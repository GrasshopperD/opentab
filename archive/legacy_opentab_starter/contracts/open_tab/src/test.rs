extern crate std;

use super::*;
use ed25519_dalek::{Signer, SigningKey};
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    token::{StellarAssetClient, TokenClient},
    Address, BytesN, Env,
};

const UNIT: i128 = 10_000_000; // 1.0 of a 7 decimal Stellar asset
const NOW: u64 = 1_800_000_000;
const WEEK: u64 = 7 * 24 * 3600;

struct World {
    env: Env,
    tab: OpenTabClient<'static>,
    token: TokenClient<'static>,
    sender: Address,
    shop: Address,
    treasury: Address,
    household: SigningKey,
}

fn setup(fee_bps: u32) -> World {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(NOW);

    let admin = Address::generate(&env);
    let sender = Address::generate(&env);
    let shop = Address::generate(&env);
    let treasury = Address::generate(&env);

    let sac = env.register_stellar_asset_contract_v2(admin.clone());
    let token = TokenClient::new(&env, &sac.address());
    StellarAssetClient::new(&env, &sac.address()).mint(&sender, &(1_000 * UNIT));

    let id = env.register(OpenTab, (admin, sac.address(), treasury.clone(), fee_bps));
    let tab = OpenTabClient::new(&env, &id);
    let household = SigningKey::from_bytes(&[7u8; 32]);
    World { env, tab, token, sender, shop, treasury, household }
}

fn pubkey(w: &World, key: &SigningKey) -> BytesN<32> {
    BytesN::from_array(&w.env, &key.verifying_key().to_bytes())
}

/// What the household phone does: sign the running total, with no network.
fn ticket(w: &World, key: &SigningKey, tab_id: u64, cumulative: i128) -> BytesN<64> {
    let msg = w.tab.ticket_message(&tab_id, &cumulative);
    let mut raw = std::vec![0u8; msg.len() as usize];
    msg.copy_into_slice(&mut raw);
    BytesN::from_array(&w.env, &key.sign(&raw).to_bytes())
}

fn open(w: &World, amount: i128) -> u64 {
    w.tab.open(&w.sender, &w.shop, &pubkey(w, &w.household), &amount, &(NOW + WEEK))
}

#[test]
fn many_purchases_settle_in_one_payment() {
    let w = setup(0);
    let id = open(&w, 50 * UNIT);
    assert_eq!(w.token.balance(&w.tab.address), 50 * UNIT);

    // Three purchases: 4, then 6.5, then 2 units. Only the last ticket is redeemed.
    let _t1 = ticket(&w, &w.household, id, 4 * UNIT);
    let _t2 = ticket(&w, &w.household, id, 105 * UNIT / 10);
    let t3 = ticket(&w, &w.household, id, 125 * UNIT / 10);

    let paid = w.tab.settle(&id, &(125 * UNIT / 10), &t3);
    assert_eq!(paid, 125 * UNIT / 10);
    assert_eq!(w.token.balance(&w.shop), 125 * UNIT / 10);
    assert_eq!(w.tab.get_tab(&id).settled, 125 * UNIT / 10);
}

#[test]
fn later_ticket_pays_only_the_difference_and_old_tickets_are_dead() {
    let w = setup(0);
    let id = open(&w, 50 * UNIT);
    let t1 = ticket(&w, &w.household, id, 10 * UNIT);
    let t2 = ticket(&w, &w.household, id, 25 * UNIT);

    assert_eq!(w.tab.settle(&id, &(10 * UNIT), &t1), 10 * UNIT);
    assert_eq!(w.tab.settle(&id, &(25 * UNIT), &t2), 15 * UNIT);
    assert_eq!(w.token.balance(&w.shop), 25 * UNIT);

    // Replaying either ticket pays nothing.
    assert_eq!(w.tab.try_settle(&id, &(10 * UNIT), &t1), Err(Ok(Error::NothingToSettle)));
    assert_eq!(w.tab.try_settle(&id, &(25 * UNIT), &t2), Err(Ok(Error::NothingToSettle)));
    assert_eq!(w.token.balance(&w.shop), 25 * UNIT);
}

#[test]
fn ticket_signed_by_anyone_else_is_rejected() {
    let w = setup(0);
    let id = open(&w, 50 * UNIT);
    let thief = SigningKey::from_bytes(&[9u8; 32]);
    let forged = ticket(&w, &thief, id, 20 * UNIT);
    assert!(w.tab.try_settle(&id, &(20 * UNIT), &forged).is_err());
    assert_eq!(w.token.balance(&w.shop), 0);
}

#[test]
fn shop_cannot_inflate_a_signed_total() {
    let w = setup(0);
    let id = open(&w, 50 * UNIT);
    let t = ticket(&w, &w.household, id, 5 * UNIT);
    // Signature is for 5, the shop claims 15.
    assert!(w.tab.try_settle(&id, &(15 * UNIT), &t).is_err());
    assert_eq!(w.token.balance(&w.shop), 0);
}

#[test]
fn ticket_for_one_tab_does_not_work_on_another() {
    let w = setup(0);
    let a = open(&w, 20 * UNIT);
    let b = open(&w, 20 * UNIT);
    let t = ticket(&w, &w.household, a, 5 * UNIT);
    assert!(w.tab.try_settle(&b, &(5 * UNIT), &t).is_err());
    assert_eq!(w.tab.settle(&a, &(5 * UNIT), &t), 5 * UNIT);
}

#[test]
fn spending_is_capped_by_what_was_funded_and_top_up_raises_the_cap() {
    let w = setup(0);
    let id = open(&w, 10 * UNIT);
    let t = ticket(&w, &w.household, id, 12 * UNIT);
    assert_eq!(w.tab.try_settle(&id, &(12 * UNIT), &t), Err(Ok(Error::OverLimit)));

    w.tab.top_up(&id, &w.sender, &(5 * UNIT));
    assert_eq!(w.tab.get_tab(&id).funded, 15 * UNIT);
    assert_eq!(w.tab.settle(&id, &(12 * UNIT), &t), 12 * UNIT);
}

#[test]
fn fee_is_taken_from_the_shop_share() {
    let w = setup(100); // 1%
    let id = open(&w, 50 * UNIT);
    let t = ticket(&w, &w.household, id, 20 * UNIT);
    let paid = w.tab.settle(&id, &(20 * UNIT), &t);
    assert_eq!(paid, 198 * UNIT / 10);
    assert_eq!(w.token.balance(&w.shop), 198 * UNIT / 10);
    assert_eq!(w.token.balance(&w.treasury), 2 * UNIT / 10);
}

#[test]
fn sender_cannot_pull_money_before_expiry_without_the_shop() {
    let w = setup(0);
    let id = open(&w, 50 * UNIT);
    // Only the sender authorises; the shop does not.
    w.env.mock_auths(&[]);
    assert!(w.tab.try_close(&id).is_err());
    assert_eq!(w.token.balance(&w.tab.address), 50 * UNIT);
}

#[test]
fn after_expiry_anyone_can_refund_the_remainder_and_tickets_stop() {
    let w = setup(0);
    let id = open(&w, 50 * UNIT);
    let t1 = ticket(&w, &w.household, id, 30 * UNIT);
    let t2 = ticket(&w, &w.household, id, 40 * UNIT);
    w.tab.settle(&id, &(30 * UNIT), &t1);

    w.env.ledger().set_timestamp(NOW + WEEK + 1);
    assert_eq!(w.tab.try_settle(&id, &(40 * UNIT), &t2), Err(Ok(Error::TabExpired)));

    w.env.mock_auths(&[]); // no signatures at all
    assert_eq!(w.tab.close(&id), 20 * UNIT);
    assert_eq!(w.token.balance(&w.sender), 970 * UNIT);
    assert_eq!(w.token.balance(&w.tab.address), 0);
    assert_eq!(w.tab.try_close(&id), Err(Ok(Error::TabClosed)));
}

#[test]
fn shop_can_agree_to_close_early() {
    let w = setup(0);
    let id = open(&w, 50 * UNIT);
    assert_eq!(w.tab.close(&id), 50 * UNIT);
    assert_eq!(w.token.balance(&w.sender), 1_000 * UNIT);
}

#[test]
fn rotating_the_key_kills_the_old_phone() {
    let w = setup(0);
    let id = open(&w, 50 * UNIT);
    let new_phone = SigningKey::from_bytes(&[11u8; 32]);
    w.tab.rotate_key(&id, &pubkey(&w, &new_phone));

    let old = ticket(&w, &w.household, id, 5 * UNIT);
    assert!(w.tab.try_settle(&id, &(5 * UNIT), &old).is_err());
    let new = ticket(&w, &new_phone, id, 5 * UNIT);
    assert_eq!(w.tab.settle(&id, &(5 * UNIT), &new), 5 * UNIT);
}

#[test]
fn expiry_can_only_move_later() {
    let w = setup(0);
    let id = open(&w, 50 * UNIT);
    assert_eq!(w.tab.try_extend(&id, &(NOW + WEEK - 1)), Err(Ok(Error::BadExpiry)));
    w.tab.extend(&id, &(NOW + 2 * WEEK));
    assert_eq!(w.tab.get_tab(&id).expires_at, NOW + 2 * WEEK);
}

#[test]
fn bad_inputs_are_refused() {
    let w = setup(0);
    let key = pubkey(&w, &w.household);
    assert_eq!(
        w.tab.try_open(&w.sender, &w.shop, &key, &0, &(NOW + WEEK)),
        Err(Ok(Error::BadAmount))
    );
    assert_eq!(
        w.tab.try_open(&w.sender, &w.shop, &key, &UNIT, &NOW),
        Err(Ok(Error::BadExpiry))
    );
    assert_eq!(w.tab.try_get_tab(&99), Err(Ok(Error::TabNotFound)));
}

#[test]
fn ticket_bytes_match_the_documented_layout() {
    let w = setup(0);
    let msg = w.tab.ticket_message(&3, &(125 * UNIT / 10));
    let mut got = std::vec![0u8; msg.len() as usize];
    msg.copy_into_slice(&mut got);

    // Rebuild the same bytes the way the web app does.
    let mut want = std::vec::Vec::new();
    want.extend_from_slice(b"OPENTAB1");
    let addr = w.tab.address.to_string();
    let mut addr_raw = [0u8; 56];
    addr.copy_into_slice(&mut addr_raw);
    assert_eq!(addr_raw[0], b'C');
    want.extend_from_slice(&addr_raw);
    want.extend_from_slice(&3u64.to_be_bytes());
    want.extend_from_slice(&(125 * UNIT / 10).to_be_bytes());
    assert_eq!(got, want);
    assert_eq!(got.len(), 8 + 56 + 8 + 16);
}

/// The signature below was produced by `web/ticket.mjs` in Node with
/// @stellar/stellar-sdk (see `web/ticket.test.mjs`). If the contract accepts
/// it, the browser and the contract agree on the ticket format.
#[test]
fn browser_and_contract_agree_on_a_ticket() {
    use soroban_sdk::String;
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(NOW);
    let admin = Address::generate(&env);
    let sender = Address::generate(&env);
    let shop = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(admin.clone());
    StellarAssetClient::new(&env, &sac.address()).mint(&sender, &(100 * UNIT));

    let fixed = Address::from_string(&String::from_str(
        &env,
        "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4",
    ));
    env.register_at(&fixed, OpenTab, (admin.clone(), sac.address(), admin.clone(), 0u32));
    let tab = OpenTabClient::new(&env, &fixed);

    let household = SigningKey::from_bytes(&[7u8; 32]);
    assert_eq!(
        hex(&household.verifying_key().to_bytes()),
        "ea4a6c63e29c520abef5507b132ec5f9954776aebebe7b92421eea691446d22c"
    );
    let key = BytesN::from_array(&env, &household.verifying_key().to_bytes());
    // Tab ids start at 1; open three so the fixture's tab id 3 exists.
    for _ in 0..3 {
        tab.open(&sender, &shop, &key, &(20 * UNIT), &(NOW + WEEK));
    }

    let js_sig = unhex64("b181ddcfc62261c263bc362b135df0b85ce2361e39cd9e339d8c875aad41dfa919741de0dd8f0360405e6e01e6eda1ef588335af9e7a1531b3b6404a19b30004");
    let paid = tab.settle(&3, &(125 * UNIT / 10), &BytesN::from_array(&env, &js_sig));
    assert_eq!(paid, 125 * UNIT / 10);
}

fn hex(b: &[u8]) -> std::string::String {
    b.iter().map(|x| std::format!("{:02x}", x)).collect()
}

fn unhex64(s: &str) -> [u8; 64] {
    let mut out = [0u8; 64];
    for i in 0..64 {
        out[i] = u8::from_str_radix(&s[2 * i..2 * i + 2], 16).unwrap();
    }
    out
}

#[test]
fn money_is_conserved() {
    let w = setup(50); // 0.5%
    let id = open(&w, 100 * UNIT);
    w.tab.top_up(&id, &w.sender, &(20 * UNIT));
    let t = ticket(&w, &w.household, id, 73 * UNIT);
    w.tab.settle(&id, &(73 * UNIT), &t);
    w.env.ledger().set_timestamp(NOW + WEEK + 1);
    w.tab.close(&id);

    let total = w.token.balance(&w.sender)
        + w.token.balance(&w.shop)
        + w.token.balance(&w.treasury)
        + w.token.balance(&w.tab.address);
    assert_eq!(total, 1_000 * UNIT);
    assert_eq!(w.token.balance(&w.tab.address), 0);
}

#[test]
fn constructor_rejects_a_fee_above_the_cap() {
    let env = Env::default();
    let a = Address::generate(&env);
    let res = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        env.register(OpenTab, (a.clone(), a.clone(), a.clone(), MAX_FEE_BPS + 1));
    }));
    assert!(res.is_err());
}
