extern crate std;

use super::*;
use ed25519_dalek::{Signer, SigningKey};
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    token::{StellarAssetClient, TokenClient},
    Address, BytesN, Env,
};
use std::vec::Vec as StdVec;

const UNIT: i128 = 10_000_000;
const NOW: u64 = 1_800_000_000;
const DAY: u64 = 24 * 3600;
const ACCEPT: u64 = NOW + 7 * DAY;
const SETTLE: u64 = ACCEPT + 3 * DAY;
const REFUND: u64 = SETTLE + DAY;

struct W {
    env: Env,
    c: OfflineChannelClient<'static>,
    token: TokenClient<'static>,
    sender: Address,
    shop: Address,
    shop2: Address,
    key: SigningKey,
}

fn setup() -> W {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(NOW);
    let admin = Address::generate(&env);
    let sender = Address::generate(&env);
    let shop = Address::generate(&env);
    let shop2 = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(admin.clone());
    let token = TokenClient::new(&env, &sac.address());
    StellarAssetClient::new(&env, &sac.address()).mint(&sender, &(1_000 * UNIT));
    let id = env.register(OfflineChannel, (admin, sac.address()));
    let c = OfflineChannelClient::new(&env, &id);
    W { env, c, token, sender, shop, shop2, key: SigningKey::from_bytes(&[7u8; 32]) }
}

fn pk(env: &Env, k: &SigningKey) -> BytesN<32> { BytesN::from_array(env, &k.verifying_key().to_bytes()) }
fn order(env: &Env, n: u8) -> BytesN<32> { BytesN::from_array(env, &[n; 32]) }

fn open(w: &W, shop: &Address, amount: i128) -> u64 {
    w.c.open(&w.sender, shop, &1, &pk(&w.env, &w.key), &amount, &ACCEPT, &SETTLE, &REFUND)
}

fn strkey(a: &Address) -> [u8; 56] { let mut b = [0u8; 56]; a.to_string().copy_into_slice(&mut b); b }

/// Independent encoder of the ticket layout (mirrors the doc comment, not the contract code).
fn ticket_bytes(w: &W, net: [u8; 32], id: u64, merchant: &Address, terminal: u32, key: &BytesN<32>, cum: i128, ord: &BytesN<32>) -> StdVec<u8> {
    let mut m = StdVec::new();
    m.extend_from_slice(b"OTOC1\0\0\0");
    m.extend_from_slice(&net);
    m.extend_from_slice(&strkey(&w.c.address));
    m.extend_from_slice(&strkey(&w.token.address));
    m.extend_from_slice(&id.to_be_bytes());
    m.extend_from_slice(&strkey(merchant));
    m.extend_from_slice(&terminal.to_be_bytes());
    m.extend_from_slice(&key.to_array());
    m.extend_from_slice(&cum.to_be_bytes());
    m.extend_from_slice(&ord.to_array());
    m
}

/// What the offline phone does: sign the running total for this channel.
fn sign_with(w: &W, k: &SigningKey, id: u64, merchant: &Address, cum: i128, ord: &BytesN<32>) -> BytesN<64> {
    let raw = ticket_bytes(w, w.env.ledger().network_id().to_array(), id, merchant, 1, &pk(&w.env, k), cum, ord);
    BytesN::from_array(&w.env, &k.sign(&raw).to_bytes())
}

fn settle(w: &W, id: u64, cum: i128, n: u8) -> Result<i128, Error> {
    let o = order(&w.env, n);
    let s = sign_with(w, &w.key, id, &w.shop, cum, &o);
    match w.c.try_settle(&id, &cum, &o, &pk(&w.env, &w.key), &s) {
        Ok(Ok(v)) => Ok(v),
        Err(Ok(e)) => Err(e),
        _ => panic!("host error"),
    }
}

#[test]
fn ticket_layout_matches_independent_encoder() {
    let w = setup();
    let id = open(&w, &w.shop, 50 * UNIT);
    let m = w.c.ticket_message(&id, &pk(&w.env, &w.key), &(5 * UNIT), &order(&w.env, 1));
    let mut raw = std::vec![0u8; m.len() as usize];
    m.copy_into_slice(&mut raw);
    assert_eq!(raw.len(), 300);
    assert_eq!(raw, ticket_bytes(&w, w.env.ledger().network_id().to_array(), id, &w.shop, 1, &pk(&w.env, &w.key), 5 * UNIT, &order(&w.env, 1)));
}

#[test]
fn open_reserves_funds_for_one_merchant() {
    let w = setup();
    let id = open(&w, &w.shop, 50 * UNIT);
    let ch = w.c.get_channel(&id);
    assert_eq!(ch.merchant, w.shop);
    assert_eq!(ch.reserved, 50 * UNIT);
    assert_eq!(w.token.balance(&w.c.address), 50 * UNIT);
    assert_eq!(w.token.balance(&w.sender), 950 * UNIT);
}

#[test]
fn open_rejects_bad_amounts_and_deadlines() {
    let w = setup();
    let k = pk(&w.env, &w.key);
    assert_eq!(w.c.try_open(&w.sender, &w.shop, &1, &k, &0, &ACCEPT, &SETTLE, &REFUND), Err(Ok(Error::NonPositiveAmount)));
    // acceptance already over
    assert_eq!(w.c.try_open(&w.sender, &w.shop, &1, &k, &UNIT, &NOW, &(NOW + 3 * DAY), &(NOW + 4 * DAY)), Err(Ok(Error::BadDeadlines)));
    // grace shorter than MIN_GRACE
    assert_eq!(w.c.try_open(&w.sender, &w.shop, &1, &k, &UNIT, &ACCEPT, &(ACCEPT + DAY), &(ACCEPT + 2 * DAY)), Err(Ok(Error::BadDeadlines)));
    // refund before settlement ends
    assert_eq!(w.c.try_open(&w.sender, &w.shop, &1, &k, &UNIT, &ACCEPT, &SETTLE, &(SETTLE - 1)), Err(Ok(Error::BadDeadlines)));
}

#[test]
fn many_offline_purchases_settle_in_one_payment() {
    let w = setup();
    let id = open(&w, &w.shop, 50 * UNIT);
    // purchases of 10, 15, 5: shop keeps only the newest running total (30)
    assert_eq!(settle(&w, id, 30 * UNIT, 3), Ok(30 * UNIT));
    assert_eq!(w.token.balance(&w.shop), 30 * UNIT);
    assert_eq!(w.c.get_channel(&id).settled, 30 * UNIT);
}

#[test]
fn later_ticket_pays_only_the_difference() {
    let w = setup();
    let id = open(&w, &w.shop, 50 * UNIT);
    assert_eq!(settle(&w, id, 10 * UNIT, 1), Ok(10 * UNIT));
    assert_eq!(settle(&w, id, 25 * UNIT, 2), Ok(15 * UNIT));
    assert_eq!(w.token.balance(&w.shop), 25 * UNIT);
}

#[test]
fn repeated_settlement_of_same_ticket_pays_nothing() {
    let w = setup();
    let id = open(&w, &w.shop, 50 * UNIT);
    settle(&w, id, 10 * UNIT, 1).unwrap();
    assert_eq!(settle(&w, id, 10 * UNIT, 1), Err(Error::NothingToSettle));
    assert_eq!(w.token.balance(&w.shop), 10 * UNIT);
}

#[test]
fn out_of_order_older_ticket_pays_nothing() {
    let w = setup();
    let id = open(&w, &w.shop, 50 * UNIT);
    settle(&w, id, 40 * UNIT, 4).unwrap();
    assert_eq!(settle(&w, id, 25 * UNIT, 2), Err(Error::NothingToSettle));
    assert_eq!(w.c.get_channel(&id).settled, 40 * UNIT);
}

#[test]
fn cannot_settle_beyond_reserved_funds() {
    let w = setup();
    let id = open(&w, &w.shop, 20 * UNIT);
    assert_eq!(settle(&w, id, 21 * UNIT, 1), Err(Error::ExceedsReserved));
    assert_eq!(w.token.balance(&w.shop), 0);
}

#[test]
fn top_up_raises_cap_only_before_acceptance_ends() {
    let w = setup();
    let id = open(&w, &w.shop, 20 * UNIT);
    assert_eq!(w.c.top_up(&id, &w.sender, &(10 * UNIT)), 30 * UNIT);
    assert_eq!(settle(&w, id, 30 * UNIT, 1), Ok(30 * UNIT));
    w.env.ledger().set_timestamp(ACCEPT + 1);
    assert_eq!(w.c.try_top_up(&id, &w.sender, &UNIT), Err(Ok(Error::AcceptanceEnded)));
}

#[test]
fn wrong_merchant_cannot_use_ticket() {
    let w = setup();
    let a = open(&w, &w.shop, 20 * UNIT);
    let b = open(&w, &w.shop2, 20 * UNIT);
    // Ticket signed for channel A (shop) submitted to channel B (shop2): bytes differ, signature fails
    let o = order(&w.env, 1);
    let sig_a = sign_with(&w, &w.key, a, &w.shop, 5 * UNIT, &o);
    assert!(w.c.try_settle(&b, &(5 * UNIT), &o, &pk(&w.env, &w.key), &sig_a).is_err());
    assert_eq!(w.token.balance(&w.shop2), 0);
}

#[test]
fn settle_requires_the_channel_merchant_auth() {
    let w = setup();
    let id = open(&w, &w.shop, 20 * UNIT);
    let o = order(&w.env, 1);
    let s = sign_with(&w, &w.key, id, &w.shop, 5 * UNIT, &o);
    w.env.set_auths(&[]);
    assert!(w.c.try_settle(&id, &(5 * UNIT), &o, &pk(&w.env, &w.key), &s).is_err());
}

#[test]
fn invalid_or_tampered_signature_rejected() {
    let w = setup();
    let id = open(&w, &w.shop, 20 * UNIT);
    let o = order(&w.env, 1);
    let s = sign_with(&w, &w.key, id, &w.shop, 5 * UNIT, &o);
    // shop inflates the signed total
    assert!(w.c.try_settle(&id, &(15 * UNIT), &o, &pk(&w.env, &w.key), &s).is_err());
    // flipped signature byte
    let mut b = s.to_array(); b[3] ^= 1;
    assert!(w.c.try_settle(&id, &(5 * UNIT), &o, &pk(&w.env, &w.key), &BytesN::from_array(&w.env, &b)).is_err());
    // other order id than signed
    assert!(w.c.try_settle(&id, &(5 * UNIT), &order(&w.env, 9), &pk(&w.env, &w.key), &s).is_err());
    // wrong network
    let raw = ticket_bytes(&w, [0xAB; 32], id, &w.shop, 1, &pk(&w.env, &w.key), 5 * UNIT, &o);
    let s2 = BytesN::from_array(&w.env, &w.key.sign(&raw).to_bytes());
    assert!(w.c.try_settle(&id, &(5 * UNIT), &o, &pk(&w.env, &w.key), &s2).is_err());
    assert_eq!(w.token.balance(&w.shop), 0);
}

#[test]
fn unknown_key_rejected() {
    let w = setup();
    let id = open(&w, &w.shop, 20 * UNIT);
    let thief = SigningKey::from_bytes(&[9u8; 32]);
    let o = order(&w.env, 1);
    let s = sign_with(&w, &thief, id, &w.shop, 5 * UNIT, &o);
    assert_eq!(w.c.try_settle(&id, &(5 * UNIT), &o, &pk(&w.env, &thief), &s), Err(Ok(Error::UnknownKey)));
}

#[test]
fn settlement_allowed_in_grace_period_after_acceptance_ends() {
    let w = setup();
    let id = open(&w, &w.shop, 20 * UNIT);
    w.env.ledger().set_timestamp(ACCEPT + DAY); // shop reconnects late
    assert_eq!(settle(&w, id, 12 * UNIT, 1), Ok(12 * UNIT));
    // sender cannot refund during the grace window
    assert_eq!(w.c.try_refund(&id), Err(Ok(Error::RefundTooEarly)));
}

#[test]
fn settlement_rights_end_after_settle_until() {
    let w = setup();
    let id = open(&w, &w.shop, 20 * UNIT);
    w.env.ledger().set_timestamp(SETTLE + 1);
    assert_eq!(settle(&w, id, 5 * UNIT, 1), Err(Error::SettlementEnded));
}

#[test]
fn refund_only_after_refund_after_and_only_the_remainder() {
    let w = setup();
    let id = open(&w, &w.shop, 20 * UNIT);
    settle(&w, id, 8 * UNIT, 1).unwrap();
    w.env.ledger().set_timestamp(REFUND);
    assert_eq!(w.c.try_refund(&id), Err(Ok(Error::RefundTooEarly)));
    w.env.ledger().set_timestamp(REFUND + 1);
    assert_eq!(w.c.refund(&id), 12 * UNIT);
    assert_eq!(w.token.balance(&w.sender), 992 * UNIT);
    assert_eq!(w.c.try_refund(&id), Err(Ok(Error::Closed)));
}

#[test]
fn merchant_can_release_early_sender_cannot() {
    let w = setup();
    let id = open(&w, &w.shop, 20 * UNIT);
    settle(&w, id, 5 * UNIT, 1).unwrap();
    assert_eq!(w.c.try_refund(&id), Err(Ok(Error::RefundTooEarly)));
    w.env.set_auths(&[]);
    assert!(w.c.try_merchant_release(&id).is_err());
    w.env.mock_all_auths();
    assert_eq!(w.c.merchant_release(&id), 15 * UNIT);
    assert_eq!(settle(&w, id, 6 * UNIT, 2), Err(Error::Closed));
}

#[test]
fn key_rotation_keeps_old_tickets_settleable_in_grace() {
    let w = setup();
    let id = open(&w, &w.shop, 30 * UNIT);
    // Shop accepted an old-key ticket for 10 offline; then the phone is lost and the key rotated.
    let o1 = order(&w.env, 1);
    let old_sig = sign_with(&w, &w.key, id, &w.shop, 10 * UNIT, &o1);
    let new_key = SigningKey::from_bytes(&[8u8; 32]);
    w.c.rotate_key(&id, &pk(&w.env, &new_key));
    w.env.ledger().set_timestamp(ACCEPT + DAY);
    assert_eq!(w.c.settle(&id, &(10 * UNIT), &o1, &pk(&w.env, &w.key), &old_sig), 10 * UNIT);
    // New key continues the same running total
    let o2 = order(&w.env, 2);
    let new_sig = sign_with(&w, &new_key, id, &w.shop, 18 * UNIT, &o2);
    assert_eq!(w.c.settle(&id, &(18 * UNIT), &o2, &pk(&w.env, &new_key), &new_sig), 8 * UNIT);
    // After settle_until, nothing (old or new key) settles
    w.env.ledger().set_timestamp(SETTLE + 1);
    let o3 = order(&w.env, 3);
    let late = sign_with(&w, &w.key, id, &w.shop, 20 * UNIT, &o3);
    assert_eq!(w.c.try_settle(&id, &(20 * UNIT), &o3, &pk(&w.env, &w.key), &late), Err(Ok(Error::SettlementEnded)));
}

#[test]
fn repeated_rotation_keeps_every_retiring_key_and_is_bounded() {
    let w = setup();
    let id = open(&w, &w.shop, 30 * UNIT);
    let o = order(&w.env, 1);
    let first_sig = sign_with(&w, &w.key, id, &w.shop, 4 * UNIT, &o);
    for n in 20u8..23 { w.c.rotate_key(&id, &pk(&w.env, &SigningKey::from_bytes(&[n; 32]))); }
    assert_eq!(w.c.try_rotate_key(&id, &pk(&w.env, &SigningKey::from_bytes(&[30u8; 32]))), Err(Ok(Error::TooManyRotations)));
    // The very first key's offline ticket still settles after three rotations
    assert_eq!(w.c.settle(&id, &(4 * UNIT), &o, &pk(&w.env, &w.key), &first_sig), 4 * UNIT);
    // Re-using an old key as "new" is refused
    assert!(w.c.try_rotate_key(&id, &pk(&w.env, &w.key)).is_err());
}

#[test]
fn rotation_requires_sender_auth() {
    let w = setup();
    let id = open(&w, &w.shop, 30 * UNIT);
    w.env.set_auths(&[]);
    assert!(w.c.try_rotate_key(&id, &pk(&w.env, &SigningKey::from_bytes(&[8u8; 32]))).is_err());
}

#[test]
fn deadlines_only_move_later() {
    let w = setup();
    let id = open(&w, &w.shop, 30 * UNIT);
    assert_eq!(w.c.try_extend(&id, &(ACCEPT - 1), &SETTLE, &REFUND), Err(Ok(Error::DeadlinesOnlyMoveLater)));
    w.c.extend(&id, &(ACCEPT + DAY), &(SETTLE + DAY), &(REFUND + DAY));
    assert_eq!(w.c.get_channel(&id).settle_until, SETTLE + DAY);
}

#[test]
fn channels_are_isolated() {
    let w = setup();
    let a = open(&w, &w.shop, 20 * UNIT);
    let b = open(&w, &w.shop, 30 * UNIT);
    // Channel A's ticket cannot be settled against channel B (same shop, same key)
    let o = order(&w.env, 1);
    let sig_a = sign_with(&w, &w.key, a, &w.shop, 15 * UNIT, &o);
    assert!(w.c.try_settle(&b, &(15 * UNIT), &o, &pk(&w.env, &w.key), &sig_a).is_err());
    assert_eq!(settle(&w, a, 20 * UNIT, 2), Ok(20 * UNIT));
    assert_eq!(settle(&w, a, 25 * UNIT, 3), Err(Error::ExceedsReserved)); // cannot draw on B's reserve
    assert_eq!(w.c.get_channel(&b).settled, 0);
}

#[test]
fn money_is_conserved() {
    let w = setup();
    let a = open(&w, &w.shop, 20 * UNIT);
    let b = open(&w, &w.shop2, 15 * UNIT);
    settle(&w, a, 7 * UNIT, 1).unwrap();
    let o = order(&w.env, 1);
    let s = sign_with(&w, &w.key, b, &w.shop2, 9 * UNIT, &o);
    w.c.settle(&b, &(9 * UNIT), &o, &pk(&w.env, &w.key), &s);
    w.env.ledger().set_timestamp(REFUND + 1);
    w.c.refund(&a);
    w.c.refund(&b);
    let total = w.token.balance(&w.sender) + w.token.balance(&w.shop) + w.token.balance(&w.shop2) + w.token.balance(&w.c.address);
    assert_eq!(total, 1_000 * UNIT);
    assert_eq!(w.token.balance(&w.c.address), 0);
    assert_eq!(w.token.balance(&w.shop), 7 * UNIT);
    assert_eq!(w.token.balance(&w.shop2), 9 * UNIT);
}

#[test]
fn channel_record_survives_ledger_advance() {
    let w = setup();
    let id = open(&w, &w.shop, 20 * UNIT);
    settle(&w, id, 5 * UNIT, 1).unwrap();
    w.env.ledger().with_mut(|l| { l.sequence_number += 100_000; l.timestamp = ACCEPT; });
    w.c.extend_channel_ttl(&id);
    assert_eq!(w.c.get_channel(&id).settled, 5 * UNIT);
    assert_eq!(settle(&w, id, 5 * UNIT, 1), Err(Error::NothingToSettle));
}
