//! OpenTab: a prepaid shop tab that a relative abroad funds and a household
//! spends at one local shop.
//!
//! The sender escrows a stable asset for one shop. The household approves each
//! purchase by signing a "ticket" that states the running total of the tab.
//! Signing and checking a ticket need no network connection. The shop redeems
//! the newest ticket whenever it is online, so many purchases settle in one
//! transaction. Money can only move to the shop (against a ticket) or back to
//! the sender (after expiry, or earlier if the shop agrees).
#![no_std]

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, token, Address, Bytes,
    BytesN, Env,
};

/// Domain tag at the start of every ticket message.
pub const TICKET_TAG: &[u8; 8] = b"OPENTAB1";
/// Highest protocol fee the constructor accepts, in basis points (2%).
pub const MAX_FEE_BPS: u32 = 200;
/// How far to push storage lifetime on each write (about 30 days of 5 s ledgers).
const BUMP_LEDGERS: u32 = 518_400;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    TabNotFound = 1,
    BadAmount = 2,
    BadExpiry = 3,
    TabExpired = 4,
    TabClosed = 5,
    OverLimit = 6,
    NothingToSettle = 7,
    BadFee = 8,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Tab {
    /// Who funded the tab and gets the unspent balance back.
    pub sender: Address,
    /// The only address that can be paid from this tab.
    pub shop: Address,
    /// Ed25519 public key of the household device that signs tickets.
    pub recipient_key: BytesN<32>,
    /// Total deposited so far.
    pub funded: i128,
    /// Running total already paid out (shop share plus fee).
    pub settled: i128,
    /// Unix time after which no ticket settles and the remainder is refundable.
    pub expires_at: u64,
    pub closed: bool,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Config {
    pub admin: Address,
    pub token: Address,
    pub treasury: Address,
    pub fee_bps: u32,
}

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Config,
    NextId,
    Tab(u64),
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Opened {
    #[topic]
    pub tab_id: u64,
    pub sender: Address,
    pub shop: Address,
    pub amount: i128,
    pub expires_at: u64,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ToppedUp {
    #[topic]
    pub tab_id: u64,
    pub from: Address,
    pub amount: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Settled {
    #[topic]
    pub tab_id: u64,
    pub cumulative: i128,
    pub paid_to_shop: i128,
    pub fee: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Closed {
    #[topic]
    pub tab_id: u64,
    pub refunded: i128,
}

#[contract]
pub struct OpenTab;

#[contractimpl]
impl OpenTab {
    pub fn __constructor(
        env: Env,
        admin: Address,
        token: Address,
        treasury: Address,
        fee_bps: u32,
    ) -> Result<(), Error> {
        if fee_bps > MAX_FEE_BPS {
            return Err(Error::BadFee);
        }
        env.storage().instance().set(
            &DataKey::Config,
            &Config { admin, token, treasury, fee_bps },
        );
        env.storage().instance().set(&DataKey::NextId, &1u64);
        Ok(())
    }

    /// Sender opens a tab for one shop and deposits `amount`.
    pub fn open(
        env: Env,
        sender: Address,
        shop: Address,
        recipient_key: BytesN<32>,
        amount: i128,
        expires_at: u64,
    ) -> Result<u64, Error> {
        sender.require_auth();
        if amount <= 0 {
            return Err(Error::BadAmount);
        }
        if expires_at <= env.ledger().timestamp() {
            return Err(Error::BadExpiry);
        }
        let cfg = Self::config(env.clone());
        token::Client::new(&env, &cfg.token).transfer(
            &sender,
            &env.current_contract_address(),
            &amount,
        );

        let tab_id: u64 = env.storage().instance().get(&DataKey::NextId).unwrap();
        env.storage().instance().set(&DataKey::NextId, &(tab_id + 1));
        let tab = Tab {
            sender: sender.clone(),
            shop: shop.clone(),
            recipient_key,
            funded: amount,
            settled: 0,
            expires_at,
            closed: false,
        };
        Self::save(&env, tab_id, &tab);
        Opened { tab_id, sender, shop, amount, expires_at }.publish(&env);
        Ok(tab_id)
    }

    /// Anyone (the sender, a sibling, an aid agency) can add money to a tab.
    pub fn top_up(env: Env, tab_id: u64, from: Address, amount: i128) -> Result<(), Error> {
        from.require_auth();
        if amount <= 0 {
            return Err(Error::BadAmount);
        }
        let mut tab = Self::load_live(&env, tab_id)?;
        let cfg = Self::config(env.clone());
        token::Client::new(&env, &cfg.token).transfer(
            &from,
            &env.current_contract_address(),
            &amount,
        );
        tab.funded += amount;
        Self::save(&env, tab_id, &tab);
        ToppedUp { tab_id, from, amount }.publish(&env);
        Ok(())
    }

    /// Sender pushes the expiry later. It can never be pulled earlier.
    pub fn extend(env: Env, tab_id: u64, new_expires_at: u64) -> Result<(), Error> {
        let mut tab = Self::load_live(&env, tab_id)?;
        tab.sender.require_auth();
        if new_expires_at <= tab.expires_at {
            return Err(Error::BadExpiry);
        }
        tab.expires_at = new_expires_at;
        Self::save(&env, tab_id, &tab);
        Ok(())
    }

    /// Shop redeems the newest ticket. `cumulative` is the running total the
    /// household signed. The contract pays the difference since the last
    /// settlement, so an old ticket can never be paid twice.
    /// Returns the amount paid to the shop.
    pub fn settle(
        env: Env,
        tab_id: u64,
        cumulative: i128,
        signature: BytesN<64>,
    ) -> Result<i128, Error> {
        let mut tab = Self::load_live(&env, tab_id)?;
        tab.shop.require_auth();
        if cumulative <= tab.settled {
            return Err(Error::NothingToSettle);
        }
        if cumulative > tab.funded {
            return Err(Error::OverLimit);
        }
        // Fails the whole transaction if the signature is not the household's.
        env.crypto().ed25519_verify(
            &tab.recipient_key,
            &Self::ticket_message(env.clone(), tab_id, cumulative),
            &signature,
        );

        let cfg = Self::config(env.clone());
        let delta = cumulative - tab.settled;
        let fee = delta * (cfg.fee_bps as i128) / 10_000;
        let to_shop = delta - fee;
        let token = token::Client::new(&env, &cfg.token);
        token.transfer(&env.current_contract_address(), &tab.shop, &to_shop);
        if fee > 0 {
            token.transfer(&env.current_contract_address(), &cfg.treasury, &fee);
        }
        tab.settled = cumulative;
        Self::save(&env, tab_id, &tab);
        Settled { tab_id, cumulative, paid_to_shop: to_shop, fee }.publish(&env);
        Ok(to_shop)
    }

    /// Returns the unspent balance to the sender. After expiry anyone can call
    /// it. Before expiry the shop has to sign, because the shop may be holding
    /// tickets it has not redeemed yet.
    pub fn close(env: Env, tab_id: u64) -> Result<i128, Error> {
        let mut tab = Self::load(&env, tab_id)?;
        if tab.closed {
            return Err(Error::TabClosed);
        }
        if env.ledger().timestamp() <= tab.expires_at {
            tab.shop.require_auth();
        }
        let refund = tab.funded - tab.settled;
        if refund > 0 {
            let cfg = Self::config(env.clone());
            token::Client::new(&env, &cfg.token).transfer(
                &env.current_contract_address(),
                &tab.sender,
                &refund,
            );
        }
        tab.closed = true;
        Self::save(&env, tab_id, &tab);
        Closed { tab_id, refunded: refund }.publish(&env);
        Ok(refund)
    }

    /// Replace the household signing key (lost or stolen phone). Needs both
    /// the sender and the shop, so neither can void tickets the other relies on.
    pub fn rotate_key(env: Env, tab_id: u64, new_key: BytesN<32>) -> Result<(), Error> {
        let mut tab = Self::load_live(&env, tab_id)?;
        tab.sender.require_auth();
        tab.shop.require_auth();
        tab.recipient_key = new_key;
        Self::save(&env, tab_id, &tab);
        Ok(())
    }

    /// The exact bytes a ticket signs:
    /// "OPENTAB1" + this contract's address as 56 ASCII characters
    /// + tab id (8 bytes, big endian) + running total (16 bytes, big endian).
    pub fn ticket_message(env: Env, tab_id: u64, cumulative: i128) -> Bytes {
        let mut msg = Bytes::from_slice(&env, TICKET_TAG);
        let mut addr = [0u8; 56];
        env.current_contract_address().to_string().copy_into_slice(&mut addr);
        msg.extend_from_slice(&addr);
        msg.extend_from_slice(&tab_id.to_be_bytes());
        msg.extend_from_slice(&cumulative.to_be_bytes());
        msg
    }

    pub fn get_tab(env: Env, tab_id: u64) -> Result<Tab, Error> {
        Self::load(&env, tab_id)
    }

    pub fn config(env: Env) -> Config {
        env.storage().instance().get(&DataKey::Config).unwrap()
    }
}

impl OpenTab {
    fn load(env: &Env, tab_id: u64) -> Result<Tab, Error> {
        env.storage()
            .persistent()
            .get(&DataKey::Tab(tab_id))
            .ok_or(Error::TabNotFound)
    }

    /// A tab that can still take deposits and settlements.
    fn load_live(env: &Env, tab_id: u64) -> Result<Tab, Error> {
        let tab = Self::load(env, tab_id)?;
        if tab.closed {
            return Err(Error::TabClosed);
        }
        if env.ledger().timestamp() > tab.expires_at {
            return Err(Error::TabExpired);
        }
        Ok(tab)
    }

    fn save(env: &Env, tab_id: u64, tab: &Tab) {
        let key = DataKey::Tab(tab_id);
        env.storage().persistent().set(&key, tab);
        let bump = core::cmp::min(BUMP_LEDGERS, env.storage().max_ttl());
        env.storage().persistent().extend_ttl(&key, bump / 2, bump);
        env.storage().instance().extend_ttl(bump / 2, bump);
    }
}

#[cfg(test)]
mod test;
