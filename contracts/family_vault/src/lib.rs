//! FamilyVault: a shared family allowance on Stellar (OpenTab Global, Mode A).
//!
//! A sender funds a family balance held by this contract. Recipient devices hold
//! Ed25519 keys that the sender registers. A recipient approves a purchase by
//! signing a canonical message OFFLINE; the connected merchant submits it with
//! `pay`. The contract checks the signature, binding, expiry, invoice uniqueness
//! and balance, then transfers real tokens to the merchant in one atomic call.
//!
//! TESTNET PROTOTYPE. Unaudited.
#![no_std]

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, token, Address, Bytes,
    BytesN, Env,
};

/// Domain tag + version at the start of every payment message (8 bytes).
pub const DOMAIN_TAG: &[u8; 8] = b"OTFV1\0\0\0";
/// Longest allowed lifetime of an invoice authorization, in seconds (24 h).
/// Replay records live far longer than this (see TTL below), so a nonce record
/// always outlives every signature that could use it.
pub const MAX_INVOICE_WINDOW: u64 = 24 * 3600;
/// Storage lifetime target per write (~30 days of 5 s ledgers), capped at max_ttl.
const BUMP_LEDGERS: u32 = 518_400;
/// Length of a strkey address (G... or C...) in ASCII.
const STRKEY_LEN: usize = 56;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    FamilyNotFound = 1,
    NonPositiveAmount = 2,
    KeyNotActive = 3,
    InvoiceUsed = 4,
    InvoiceExpired = 5,
    InvoiceWindowTooLong = 6,
    InsufficientFunds = 7,
    KeyAlreadyRegistered = 8,
    UnsupportedAddress = 9,
    Overflow = 10,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Config {
    pub admin: Address,
    pub token: Address,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Family {
    pub sender: Address,
    /// Spendable balance held for this family, in token base units.
    pub balance: i128,
    pub total_deposited: i128,
    pub total_paid: i128,
    pub total_withdrawn: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum KeyStatus {
    Active,
    Revoked,
}

/// Everything a recipient signs. The contract rebuilds the signed bytes from
/// these fields plus its own network id, address and token.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PaymentAuth {
    pub family_id: u64,
    pub signer: BytesN<32>,
    pub merchant: Address,
    pub terminal_id: u32,
    pub invoice_id: BytesN<32>,
    pub amount: i128,
    /// sha256 of the canonical local-price/quote string shown to the recipient.
    pub quote_hash: BytesN<32>,
    pub expires_at: u64,
}

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Config,
    NextFamilyId,
    Family(u64),
    Key(u64, BytesN<32>),
    Used(u64, BytesN<32>),
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FamilyCreated {
    #[topic]
    pub family_id: u64,
    pub sender: Address,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Deposited {
    #[topic]
    pub family_id: u64,
    pub from: Address,
    pub amount: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct KeyRegistered {
    #[topic]
    pub family_id: u64,
    pub key: BytesN<32>,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct KeyRevoked {
    #[topic]
    pub family_id: u64,
    pub key: BytesN<32>,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Paid {
    #[topic]
    pub family_id: u64,
    #[topic]
    pub merchant: Address,
    pub invoice_id: BytesN<32>,
    pub terminal_id: u32,
    pub amount: i128,
    pub signer: BytesN<32>,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Withdrawn {
    #[topic]
    pub family_id: u64,
    pub amount: i128,
}

#[contract]
pub struct FamilyVault;

#[contractimpl]
impl FamilyVault {
    pub fn __constructor(env: Env, admin: Address, token: Address) {
        env.storage().instance().set(&DataKey::Config, &Config { admin, token });
        env.storage().instance().set(&DataKey::NextFamilyId, &1u64);
        bump_instance(&env);
    }

    /// Create a family. The sender controls keys and withdrawals.
    pub fn create_family(env: Env, sender: Address) -> u64 {
        sender.require_auth();
        let id: u64 = env.storage().instance().get(&DataKey::NextFamilyId).unwrap();
        env.storage().instance().set(&DataKey::NextFamilyId, &(id + 1));
        let fam = Family {
            sender: sender.clone(),
            balance: 0,
            total_deposited: 0,
            total_paid: 0,
            total_withdrawn: 0,
        };
        save_family(&env, id, &fam);
        FamilyCreated { family_id: id, sender }.publish(&env);
        id
    }

    /// Move `amount` tokens from `from` into the family balance. Anyone may top
    /// up a family, but only with their own authorized funds.
    pub fn deposit(env: Env, family_id: u64, from: Address, amount: i128) -> Result<i128, Error> {
        from.require_auth();
        if amount <= 0 {
            return Err(Error::NonPositiveAmount);
        }
        let mut fam = load_family(&env, family_id)?;
        fam.balance = fam.balance.checked_add(amount).ok_or(Error::Overflow)?;
        fam.total_deposited = fam.total_deposited.checked_add(amount).ok_or(Error::Overflow)?;
        token_client(&env).transfer(&from, &env.current_contract_address(), &amount);
        save_family(&env, family_id, &fam);
        Deposited { family_id, from, amount }.publish(&env);
        Ok(fam.balance)
    }

    pub fn register_key(env: Env, family_id: u64, key: BytesN<32>) -> Result<(), Error> {
        let fam = load_family(&env, family_id)?;
        fam.sender.require_auth();
        let k = DataKey::Key(family_id, key.clone());
        if let Some(KeyStatus::Active) = env.storage().persistent().get::<_, KeyStatus>(&k) {
            return Err(Error::KeyAlreadyRegistered);
        }
        env.storage().persistent().set(&k, &KeyStatus::Active);
        bump_persistent(&env, &k);
        bump_family(&env, family_id);
        KeyRegistered { family_id, key }.publish(&env);
        Ok(())
    }

    /// Revoking blocks future payments only; completed payments are final.
    pub fn revoke_key(env: Env, family_id: u64, key: BytesN<32>) -> Result<(), Error> {
        let fam = load_family(&env, family_id)?;
        fam.sender.require_auth();
        let k = DataKey::Key(family_id, key.clone());
        if env.storage().persistent().get::<_, KeyStatus>(&k) != Some(KeyStatus::Active) {
            return Err(Error::KeyNotActive);
        }
        env.storage().persistent().set(&k, &KeyStatus::Revoked);
        bump_persistent(&env, &k);
        KeyRevoked { family_id, key }.publish(&env);
        Ok(())
    }

    /// Settle a recipient-signed purchase. Must be submitted (authorized) by
    /// the merchant named in the signed message. Returns the new balance.
    pub fn pay(env: Env, auth: PaymentAuth, signature: BytesN<64>) -> Result<i128, Error> {
        auth.merchant.require_auth();
        if auth.amount <= 0 {
            return Err(Error::NonPositiveAmount);
        }
        let now = env.ledger().timestamp();
        if now > auth.expires_at {
            return Err(Error::InvoiceExpired);
        }
        if auth.expires_at > now + MAX_INVOICE_WINDOW {
            return Err(Error::InvoiceWindowTooLong);
        }
        let mut fam = load_family(&env, auth.family_id)?;
        let kk = DataKey::Key(auth.family_id, auth.signer.clone());
        if env.storage().persistent().get::<_, KeyStatus>(&kk) != Some(KeyStatus::Active) {
            return Err(Error::KeyNotActive);
        }
        let used = DataKey::Used(auth.family_id, auth.invoice_id.clone());
        if env.storage().persistent().has(&used) {
            return Err(Error::InvoiceUsed);
        }
        // Rebuild the exact signed bytes from on-chain context; panics (and the
        // whole transaction fails) if the signature does not verify.
        let msg = build_message(&env, &auth)?;
        env.crypto().ed25519_verify(&auth.signer, &msg, &signature);

        if fam.balance < auth.amount {
            return Err(Error::InsufficientFunds);
        }
        fam.balance -= auth.amount;
        fam.total_paid = fam.total_paid.checked_add(auth.amount).ok_or(Error::Overflow)?;

        // Effects before interaction; the whole call is atomic anyway.
        env.storage().persistent().set(&used, &now);
        bump_persistent(&env, &used);
        bump_persistent(&env, &kk);
        save_family(&env, auth.family_id, &fam);

        token_client(&env).transfer(&env.current_contract_address(), &auth.merchant, &auth.amount);

        Paid {
            family_id: auth.family_id,
            merchant: auth.merchant,
            invoice_id: auth.invoice_id,
            terminal_id: auth.terminal_id,
            amount: auth.amount,
            signer: auth.signer,
        }
        .publish(&env);
        Ok(fam.balance)
    }

    /// Sender reclaims unspent funds.
    pub fn withdraw(env: Env, family_id: u64, amount: i128) -> Result<i128, Error> {
        let mut fam = load_family(&env, family_id)?;
        fam.sender.require_auth();
        if amount <= 0 {
            return Err(Error::NonPositiveAmount);
        }
        if fam.balance < amount {
            return Err(Error::InsufficientFunds);
        }
        fam.balance -= amount;
        fam.total_withdrawn = fam.total_withdrawn.checked_add(amount).ok_or(Error::Overflow)?;
        save_family(&env, family_id, &fam);
        token_client(&env).transfer(&env.current_contract_address(), &fam.sender, &amount);
        Withdrawn { family_id, amount }.publish(&env);
        Ok(fam.balance)
    }

    /// Anyone may extend storage lifetime of a family's record (no state change).
    pub fn extend_family_ttl(env: Env, family_id: u64) -> Result<(), Error> {
        load_family(&env, family_id)?;
        bump_family(&env, family_id);
        Ok(())
    }

    /// The exact bytes a recipient signs for `auth` (for client cross-checks).
    pub fn payment_message(env: Env, auth: PaymentAuth) -> Result<Bytes, Error> {
        build_message(&env, &auth)
    }

    pub fn get_family(env: Env, family_id: u64) -> Result<Family, Error> {
        load_family(&env, family_id)
    }

    pub fn balance(env: Env, family_id: u64) -> Result<i128, Error> {
        Ok(load_family(&env, family_id)?.balance)
    }

    pub fn is_key_active(env: Env, family_id: u64, key: BytesN<32>) -> bool {
        env.storage().persistent().get::<_, KeyStatus>(&DataKey::Key(family_id, key))
            == Some(KeyStatus::Active)
    }

    pub fn is_invoice_used(env: Env, family_id: u64, invoice_id: BytesN<32>) -> bool {
        env.storage().persistent().has(&DataKey::Used(family_id, invoice_id))
    }

    pub fn config(env: Env) -> Config {
        env.storage().instance().get(&DataKey::Config).unwrap()
    }
}

/// Canonical message v1 (340 bytes, big-endian integers, no separators):
/// tag(8) | network_id(32) | vault strkey(56) | token strkey(56) | family_id u64(8)
/// | signer(32) | merchant strkey(56) | terminal_id u32(4) | invoice_id(32)
/// | amount i128(16) | quote_hash(32) | expires_at u64(8)
pub fn build_message(env: &Env, a: &PaymentAuth) -> Result<Bytes, Error> {
    let cfg: Config = env.storage().instance().get(&DataKey::Config).unwrap();
    let mut m = Bytes::from_slice(env, DOMAIN_TAG);
    m.extend_from_slice(&env.ledger().network_id().to_array());
    push_strkey(&mut m, &env.current_contract_address())?;
    push_strkey(&mut m, &cfg.token)?;
    m.extend_from_slice(&a.family_id.to_be_bytes());
    m.extend_from_slice(&a.signer.to_array());
    push_strkey(&mut m, &a.merchant)?;
    m.extend_from_slice(&a.terminal_id.to_be_bytes());
    m.extend_from_slice(&a.invoice_id.to_array());
    m.extend_from_slice(&a.amount.to_be_bytes());
    m.extend_from_slice(&a.quote_hash.to_array());
    m.extend_from_slice(&a.expires_at.to_be_bytes());
    Ok(m)
}

fn push_strkey(m: &mut Bytes, a: &Address) -> Result<(), Error> {
    let s = a.to_string();
    if s.len() as usize != STRKEY_LEN {
        return Err(Error::UnsupportedAddress);
    }
    let mut buf = [0u8; STRKEY_LEN];
    s.copy_into_slice(&mut buf);
    m.extend_from_slice(&buf);
    Ok(())
}

fn token_client(env: &Env) -> token::Client<'_> {
    let cfg: Config = env.storage().instance().get(&DataKey::Config).unwrap();
    token::Client::new(env, &cfg.token)
}

fn load_family(env: &Env, id: u64) -> Result<Family, Error> {
    env.storage().persistent().get(&DataKey::Family(id)).ok_or(Error::FamilyNotFound)
}

fn save_family(env: &Env, id: u64, fam: &Family) {
    let k = DataKey::Family(id);
    env.storage().persistent().set(&k, fam);
    bump_persistent(env, &k);
    bump_instance(env);
}

fn bump_family(env: &Env, id: u64) {
    bump_persistent(env, &DataKey::Family(id));
    bump_instance(env);
}

fn bump_target(env: &Env) -> u32 {
    core::cmp::min(BUMP_LEDGERS, env.storage().max_ttl())
}

fn bump_persistent(env: &Env, k: &DataKey) {
    let b = bump_target(env);
    env.storage().persistent().extend_ttl(k, b / 2, b);
}

fn bump_instance(env: &Env) {
    let b = bump_target(env);
    env.storage().instance().extend_ttl(b / 2, b);
}

#[cfg(test)]
mod test;
