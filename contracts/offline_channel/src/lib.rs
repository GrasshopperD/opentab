//! OfflineChannel: OpenTab Global Mode B (shop AND customer offline).
//!
//! A sender reserves funds on chain for ONE named merchant and ONE checkout terminal.
//! While offline, the recipient signs running-total ("cumulative") tickets; the shop
//! checks them locally and keeps the highest. When back online the shop settles the
//! newest ticket and the contract pays only `cumulative - already_settled`.
//!
//! Safety changes vs. the archived single-shop prototype (amendments A8-A10):
//! - three deadlines: `accept_until` (shop stops accepting), `settle_until` (grace for
//!   late settlement, at least MIN_GRACE after acceptance ends), `refund_after` (>= settle_until).
//!   The sender can never refund before `refund_after` unless the merchant releases early.
//! - key rotation keeps the old key valid for settlement until `settle_until`, so tickets
//!   the shop accepted offline before it learned of the rotation are not stolen.
//! - tickets bind the network, contract, token, channel, merchant, terminal and signer key.
//! Phone clocks are untrusted: the grace window is a policy bound, not proof of signing time.
//!
//! TESTNET PROTOTYPE. Unaudited. Not deployed.
#![no_std]

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, token, Address, Bytes,
    BytesN, Env, Vec,
};

pub const DOMAIN_TAG: &[u8; 8] = b"OTOC1\0\0\0";
/// Minimum settlement grace after acceptance ends (2 days).
pub const MIN_GRACE: u64 = 2 * 24 * 3600;
const BUMP_LEDGERS: u32 = 518_400;
const STRKEY_LEN: usize = 56;
/// Bound on retained retiring keys (each stays settleable until `settle_until`).
pub const MAX_RETIRING_KEYS: u32 = 3;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    ChannelNotFound = 1,
    NonPositiveAmount = 2,
    BadDeadlines = 3,
    AcceptanceEnded = 4,
    SettlementEnded = 5,
    NothingToSettle = 6,
    ExceedsReserved = 7,
    UnknownKey = 8,
    RefundTooEarly = 9,
    Closed = 10,
    DeadlinesOnlyMoveLater = 11,
    SameKey = 12,
    UnsupportedAddress = 13,
    Overflow = 14,
    TooManyRotations = 15,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Config {
    pub admin: Address,
    pub token: Address,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Channel {
    pub sender: Address,
    pub merchant: Address,
    pub terminal_id: u32,
    pub key: BytesN<32>,
    /// Previous keys after rotations; all remain settleable until `settle_until`.
    pub retiring_keys: Vec<BytesN<32>>,
    pub reserved: i128,
    /// Highest cumulative amount already paid to the merchant.
    pub settled: i128,
    pub accept_until: u64,
    pub settle_until: u64,
    pub refund_after: u64,
    pub closed: bool,
}

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Config,
    NextId,
    Channel(u64),
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Opened {
    #[topic]
    pub channel_id: u64,
    #[topic]
    pub merchant: Address,
    pub sender: Address,
    pub reserved: i128,
    pub accept_until: u64,
    pub settle_until: u64,
    pub refund_after: u64,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ToppedUp {
    #[topic]
    pub channel_id: u64,
    pub amount: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Settled {
    #[topic]
    pub channel_id: u64,
    #[topic]
    pub merchant: Address,
    pub cumulative: i128,
    pub paid: i128,
    pub order_id: BytesN<32>,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct KeyRotated {
    #[topic]
    pub channel_id: u64,
    pub new_key: BytesN<32>,
    pub retiring_key: BytesN<32>,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Refunded {
    #[topic]
    pub channel_id: u64,
    pub amount: i128,
    pub early_release: bool,
}

#[contract]
pub struct OfflineChannel;

#[contractimpl]
impl OfflineChannel {
    pub fn __constructor(env: Env, admin: Address, token: Address) {
        env.storage().instance().set(&DataKey::Config, &Config { admin, token });
        env.storage().instance().set(&DataKey::NextId, &1u64);
        bump_instance(&env);
    }

    /// Reserve `amount` for one merchant + terminal, signed for by `key`.
    #[allow(clippy::too_many_arguments)]
    pub fn open(
        env: Env,
        sender: Address,
        merchant: Address,
        terminal_id: u32,
        key: BytesN<32>,
        amount: i128,
        accept_until: u64,
        settle_until: u64,
        refund_after: u64,
    ) -> Result<u64, Error> {
        sender.require_auth();
        if amount <= 0 {
            return Err(Error::NonPositiveAmount);
        }
        check_deadlines(env.ledger().timestamp(), accept_until, settle_until, refund_after)?;
        let id: u64 = env.storage().instance().get(&DataKey::NextId).unwrap();
        env.storage().instance().set(&DataKey::NextId, &(id + 1));
        token_client(&env).transfer(&sender, &env.current_contract_address(), &amount);
        let ch = Channel {
            sender: sender.clone(),
            merchant: merchant.clone(),
            terminal_id,
            key,
            retiring_keys: Vec::new(&env),
            reserved: amount,
            settled: 0,
            accept_until,
            settle_until,
            refund_after,
            closed: false,
        };
        save(&env, id, &ch);
        Opened { channel_id: id, merchant, sender, reserved: amount, accept_until, settle_until, refund_after }
            .publish(&env);
        Ok(id)
    }

    /// Add funds while the channel still accepts purchases.
    pub fn top_up(env: Env, channel_id: u64, from: Address, amount: i128) -> Result<i128, Error> {
        from.require_auth();
        if amount <= 0 {
            return Err(Error::NonPositiveAmount);
        }
        let mut ch = load_open(&env, channel_id)?;
        if env.ledger().timestamp() > ch.accept_until {
            return Err(Error::AcceptanceEnded);
        }
        ch.reserved = ch.reserved.checked_add(amount).ok_or(Error::Overflow)?;
        token_client(&env).transfer(&from, &env.current_contract_address(), &amount);
        save(&env, channel_id, &ch);
        ToppedUp { channel_id, amount }.publish(&env);
        Ok(ch.reserved)
    }

    /// Merchant settles its newest ticket. Pays `cumulative - settled`.
    pub fn settle(
        env: Env,
        channel_id: u64,
        cumulative: i128,
        order_id: BytesN<32>,
        key: BytesN<32>,
        signature: BytesN<64>,
    ) -> Result<i128, Error> {
        let mut ch = load_open(&env, channel_id)?;
        ch.merchant.require_auth();
        if env.ledger().timestamp() > ch.settle_until {
            return Err(Error::SettlementEnded);
        }
        let known = key == ch.key || ch.retiring_keys.contains(&key);
        if !known {
            return Err(Error::UnknownKey);
        }
        if cumulative <= ch.settled {
            return Err(Error::NothingToSettle);
        }
        if cumulative > ch.reserved {
            return Err(Error::ExceedsReserved);
        }
        let msg = build_ticket(&env, channel_id, &ch, &key, cumulative, &order_id)?;
        env.crypto().ed25519_verify(&key, &msg, &signature);

        let paid = cumulative - ch.settled;
        ch.settled = cumulative;
        save(&env, channel_id, &ch);
        token_client(&env).transfer(&env.current_contract_address(), &ch.merchant, &paid);
        Settled { channel_id, merchant: ch.merchant.clone(), cumulative, paid, order_id }.publish(&env);
        Ok(paid)
    }

    /// Replace the recipient key (lost phone). The old key stays settleable until
    /// `settle_until` so offline-accepted tickets are not invalidated.
    pub fn rotate_key(env: Env, channel_id: u64, new_key: BytesN<32>) -> Result<(), Error> {
        let mut ch = load_open(&env, channel_id)?;
        ch.sender.require_auth();
        if new_key == ch.key || ch.retiring_keys.contains(&new_key) {
            return Err(Error::SameKey);
        }
        if ch.retiring_keys.len() >= MAX_RETIRING_KEYS {
            return Err(Error::TooManyRotations);
        }
        let old = ch.key.clone();
        ch.retiring_keys.push_back(old.clone());
        ch.key = new_key.clone();
        save(&env, channel_id, &ch);
        KeyRotated { channel_id, new_key, retiring_key: old }.publish(&env);
        Ok(())
    }

    /// Move deadlines later (never earlier), keeping the grace and refund ordering.
    pub fn extend(env: Env, channel_id: u64, accept_until: u64, settle_until: u64, refund_after: u64) -> Result<(), Error> {
        let mut ch = load_open(&env, channel_id)?;
        ch.sender.require_auth();
        if accept_until < ch.accept_until || settle_until < ch.settle_until || refund_after < ch.refund_after {
            return Err(Error::DeadlinesOnlyMoveLater);
        }
        check_deadlines(env.ledger().timestamp(), accept_until, settle_until, refund_after)?;
        ch.accept_until = accept_until;
        ch.settle_until = settle_until;
        ch.refund_after = refund_after;
        save(&env, channel_id, &ch);
        Ok(())
    }

    /// After `refund_after`, anyone may return the unsettled remainder to the sender.
    pub fn refund(env: Env, channel_id: u64) -> Result<i128, Error> {
        let ch = load_open(&env, channel_id)?;
        if env.ledger().timestamp() <= ch.refund_after {
            return Err(Error::RefundTooEarly);
        }
        close_and_refund(&env, channel_id, ch, false)
    }

    /// The merchant may release the remainder early (it gives up unsettled tickets).
    pub fn merchant_release(env: Env, channel_id: u64) -> Result<i128, Error> {
        let ch = load_open(&env, channel_id)?;
        ch.merchant.require_auth();
        close_and_refund(&env, channel_id, ch, true)
    }

    pub fn ticket_message(env: Env, channel_id: u64, key: BytesN<32>, cumulative: i128, order_id: BytesN<32>) -> Result<Bytes, Error> {
        let ch = load(&env, channel_id)?;
        build_ticket(&env, channel_id, &ch, &key, cumulative, &order_id)
    }

    pub fn get_channel(env: Env, channel_id: u64) -> Result<Channel, Error> {
        load(&env, channel_id)
    }

    pub fn extend_channel_ttl(env: Env, channel_id: u64) -> Result<(), Error> {
        let ch = load(&env, channel_id)?;
        save(&env, channel_id, &ch);
        Ok(())
    }

    pub fn config(env: Env) -> Config {
        env.storage().instance().get(&DataKey::Config).unwrap()
    }
}

fn check_deadlines(now: u64, accept_until: u64, settle_until: u64, refund_after: u64) -> Result<(), Error> {
    if accept_until <= now
        || settle_until < accept_until.checked_add(MIN_GRACE).ok_or(Error::Overflow)?
        || refund_after < settle_until
    {
        return Err(Error::BadDeadlines);
    }
    Ok(())
}

fn close_and_refund(env: &Env, id: u64, mut ch: Channel, early: bool) -> Result<i128, Error> {
    let amount = ch.reserved - ch.settled;
    ch.closed = true;
    save(env, id, &ch);
    if amount > 0 {
        token_client(env).transfer(&env.current_contract_address(), &ch.sender, &amount);
    }
    Refunded { channel_id: id, amount, early_release: early }.publish(env);
    Ok(amount)
}

/// Ticket v1 (300 bytes, big-endian): tag(8) | network_id(32) | contract(56) | token(56)
/// | channel_id u64(8) | merchant(56) | terminal_id u32(4) | key(32) | cumulative i128(16) | order_id(32)
/// Note: `key` and the merchant/terminal come from what the ticket claims and the channel state.
pub fn build_ticket(env: &Env, id: u64, ch: &Channel, key: &BytesN<32>, cumulative: i128, order_id: &BytesN<32>) -> Result<Bytes, Error> {
    let cfg: Config = env.storage().instance().get(&DataKey::Config).unwrap();
    let mut m = Bytes::from_slice(env, DOMAIN_TAG);
    m.extend_from_slice(&env.ledger().network_id().to_array());
    push_strkey(&mut m, &env.current_contract_address())?;
    push_strkey(&mut m, &cfg.token)?;
    m.extend_from_slice(&id.to_be_bytes());
    push_strkey(&mut m, &ch.merchant)?;
    m.extend_from_slice(&ch.terminal_id.to_be_bytes());
    m.extend_from_slice(&key.to_array());
    m.extend_from_slice(&cumulative.to_be_bytes());
    m.extend_from_slice(&order_id.to_array());
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

fn load(env: &Env, id: u64) -> Result<Channel, Error> {
    env.storage().persistent().get(&DataKey::Channel(id)).ok_or(Error::ChannelNotFound)
}

fn load_open(env: &Env, id: u64) -> Result<Channel, Error> {
    let ch = load(env, id)?;
    if ch.closed {
        return Err(Error::Closed);
    }
    Ok(ch)
}

fn save(env: &Env, id: u64, ch: &Channel) {
    let k = DataKey::Channel(id);
    env.storage().persistent().set(&k, ch);
    let b = core::cmp::min(BUMP_LEDGERS, env.storage().max_ttl());
    env.storage().persistent().extend_ttl(&k, b / 2, b);
    bump_instance(env);
}

fn bump_instance(env: &Env) {
    let b = core::cmp::min(BUMP_LEDGERS, env.storage().max_ttl());
    env.storage().instance().extend_ttl(b / 2, b);
}

#[cfg(test)]
mod test;
