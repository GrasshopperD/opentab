extern crate std;

use super::*;
use ed25519_dalek::{Signer, SigningKey};
use soroban_sdk::{
    testutils::{Address as _, Ledger, MockAuth, MockAuthInvoke},
    token::{StellarAssetClient, TokenClient},
    Address, BytesN, Env, IntoVal,
};
use std::vec::Vec;

const UNIT: i128 = 10_000_000;
const NOW: u64 = 1_800_000_000;

struct W {
    env: Env,
    v: FamilyVaultClient<'static>,
    token: TokenClient<'static>,
    sender: Address,
    merchant: Address,
    merchant2: Address,
    key: SigningKey,
    fam: u64,
}

fn setup() -> W {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(NOW);
    let admin = Address::generate(&env);
    let sender = Address::generate(&env);
    let merchant = Address::generate(&env);
    let merchant2 = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(admin.clone());
    let token = TokenClient::new(&env, &sac.address());
    StellarAssetClient::new(&env, &sac.address()).mint(&sender, &(1_000 * UNIT));
    let id = env.register(FamilyVault, (admin, sac.address()));
    let v = FamilyVaultClient::new(&env, &id);
    let key = SigningKey::from_bytes(&[7u8; 32]);
    let fam = v.create_family(&sender);
    v.deposit(&fam, &sender, &(100 * UNIT));
    v.register_key(&fam, &pk(&env, &key));
    W { env, v, token, sender, merchant, merchant2, key, fam }
}

fn pk(env: &Env, k: &SigningKey) -> BytesN<32> {
    BytesN::from_array(env, &k.verifying_key().to_bytes())
}

fn auth(w: &W, merchant: &Address, amount: i128, inv: u8) -> PaymentAuth {
    PaymentAuth {
        family_id: w.fam,
        signer: pk(&w.env, &w.key),
        merchant: merchant.clone(),
        terminal_id: 1,
        invoice_id: BytesN::from_array(&w.env, &[inv; 32]),
        amount,
        quote_hash: BytesN::from_array(&w.env, &[9u8; 32]),
        expires_at: NOW + 600,
    }
}

fn strkey(a: &Address) -> [u8; 56] {
    let mut b = [0u8; 56];
    a.to_string().copy_into_slice(&mut b);
    b
}

/// Independent re-implementation of the v1 layout (mirrors the TS encoder).
fn msg_with(net: [u8; 32], vault: &Address, token: &Address, a: &PaymentAuth) -> Vec<u8> {
    let mut m = Vec::new();
    m.extend_from_slice(b"OTFV1\0\0\0");
    m.extend_from_slice(&net);
    m.extend_from_slice(&strkey(vault));
    m.extend_from_slice(&strkey(token));
    m.extend_from_slice(&a.family_id.to_be_bytes());
    m.extend_from_slice(&a.signer.to_array());
    m.extend_from_slice(&strkey(&a.merchant));
    m.extend_from_slice(&a.terminal_id.to_be_bytes());
    m.extend_from_slice(&a.invoice_id.to_array());
    m.extend_from_slice(&a.amount.to_be_bytes());
    m.extend_from_slice(&a.quote_hash.to_array());
    m.extend_from_slice(&a.expires_at.to_be_bytes());
    m
}

fn sign_raw(w: &W, k: &SigningKey, raw: &[u8]) -> BytesN<64> {
    BytesN::from_array(&w.env, &k.sign(raw).to_bytes())
}

fn sign(w: &W, a: &PaymentAuth) -> BytesN<64> {
    let raw = msg_with(w.env.ledger().network_id().to_array(), &w.v.address, &w.token.address, a);
    sign_raw(w, &w.key, &raw)
}

#[test]
fn initialization_sets_config_and_first_family() {
    let w = setup();
    assert_eq!(w.v.config().token, w.token.address);
    assert_eq!(w.fam, 1);
    let f = w.v.get_family(&w.fam);
    assert_eq!(f.sender, w.sender);
    assert_eq!(f.balance, 100 * UNIT);
}

#[test]
fn contract_message_matches_independent_encoder() {
    let w = setup();
    let a = auth(&w, &w.merchant, 5 * UNIT, 1);
    let onchain = w.v.payment_message(&a);
    let mut raw = std::vec![0u8; onchain.len() as usize];
    onchain.copy_into_slice(&mut raw);
    assert_eq!(raw.len(), 340);
    assert_eq!(raw, msg_with(w.env.ledger().network_id().to_array(), &w.v.address, &w.token.address, &a));
}

#[test]
fn deposit_increases_balance_and_moves_tokens() {
    let w = setup();
    assert_eq!(w.v.deposit(&w.fam, &w.sender, &(10 * UNIT)), 110 * UNIT);
    assert_eq!(w.token.balance(&w.v.address), 110 * UNIT);
    assert_eq!(w.token.balance(&w.sender), 890 * UNIT);
}

#[test]
fn deposit_without_funder_auth_fails() {
    let w = setup();
    w.env.set_auths(&[]);
    assert!(w.v.try_deposit(&w.fam, &w.sender, &UNIT).is_err());
}

#[test]
fn deposit_nonpositive_rejected() {
    let w = setup();
    assert_eq!(w.v.try_deposit(&w.fam, &w.sender, &0), Err(Ok(Error::NonPositiveAmount)));
    assert_eq!(w.v.try_deposit(&w.fam, &w.sender, &-5), Err(Ok(Error::NonPositiveAmount)));
}

#[test]
fn deposit_to_missing_family_fails() {
    let w = setup();
    assert_eq!(w.v.try_deposit(&99, &w.sender, &UNIT), Err(Ok(Error::FamilyNotFound)));
}

#[test]
fn register_key_requires_sender_auth() {
    let w = setup();
    let other = SigningKey::from_bytes(&[8u8; 32]);
    let attacker = Address::generate(&w.env);
    let key = pk(&w.env, &other);
    // Only the attacker authorizes: the sender's require_auth must fail.
    w.env.mock_auths(&[MockAuth {
        address: &attacker,
        invoke: &MockAuthInvoke {
            contract: &w.v.address,
            fn_name: "register_key",
            args: (w.fam, key.clone()).into_val(&w.env),
            sub_invokes: &[],
        },
    }]);
    assert!(w.v.try_register_key(&w.fam, &key).is_err());
    assert!(!w.v.is_key_active(&w.fam, &key));
}

#[test]
fn valid_payment_transfers_exact_amount() {
    let w = setup();
    let a = auth(&w, &w.merchant, 7 * UNIT, 1);
    let s = sign(&w, &a);
    assert_eq!(w.v.pay(&a, &s), 93 * UNIT);
    assert_eq!(w.token.balance(&w.merchant), 7 * UNIT);
    assert_eq!(w.token.balance(&w.v.address), 93 * UNIT);
    assert_eq!(w.v.get_family(&w.fam).total_paid, 7 * UNIT);
    assert!(w.v.is_invoice_used(&w.fam, &a.invoice_id));
}

#[test]
fn pay_requires_merchant_auth() {
    let w = setup();
    let a = auth(&w, &w.merchant, UNIT, 1);
    let s = sign(&w, &a);
    w.env.set_auths(&[]);
    assert!(w.v.try_pay(&a, &s).is_err());
    assert_eq!(w.token.balance(&w.merchant), 0);
}

#[test]
fn replay_same_invoice_fails() {
    let w = setup();
    let a = auth(&w, &w.merchant, UNIT, 1);
    let s = sign(&w, &a);
    w.v.pay(&a, &s);
    assert_eq!(w.v.try_pay(&a, &s), Err(Ok(Error::InvoiceUsed)));
    assert_eq!(w.token.balance(&w.merchant), UNIT);
}

#[test]
fn same_invoice_from_other_terminal_fails() {
    let w = setup();
    let a = auth(&w, &w.merchant, UNIT, 1);
    w.v.pay(&a, &sign(&w, &a));
    let mut b = a.clone();
    b.terminal_id = 2;
    assert_eq!(w.v.try_pay(&b, &sign(&w, &b)), Err(Ok(Error::InvoiceUsed)));
}

#[test]
fn signature_for_other_merchant_fails() {
    let w = setup();
    let a = auth(&w, &w.merchant, UNIT, 1);
    let s = sign(&w, &a);
    let mut b = a.clone();
    b.merchant = w.merchant2.clone();
    assert!(w.v.try_pay(&b, &s).is_err());
    assert_eq!(w.token.balance(&w.merchant2), 0);
}

#[test]
fn tampered_amount_fails() {
    let w = setup();
    let a = auth(&w, &w.merchant, UNIT, 1);
    let s = sign(&w, &a);
    let mut b = a.clone();
    b.amount = 50 * UNIT;
    assert!(w.v.try_pay(&b, &s).is_err());
}

#[test]
fn tampered_terminal_quote_or_expiry_fails() {
    let w = setup();
    let a = auth(&w, &w.merchant, UNIT, 1);
    let s = sign(&w, &a);
    let mut b = a.clone();
    b.terminal_id = 9;
    assert!(w.v.try_pay(&b, &s).is_err());
    let mut c = a.clone();
    c.quote_hash = BytesN::from_array(&w.env, &[1u8; 32]);
    assert!(w.v.try_pay(&c, &s).is_err());
    let mut d = a.clone();
    d.expires_at += 1;
    assert!(w.v.try_pay(&d, &s).is_err());
    assert_eq!(w.token.balance(&w.merchant), 0);
}

#[test]
fn wrong_network_fails() {
    let w = setup();
    let a = auth(&w, &w.merchant, UNIT, 1);
    let raw = msg_with([0xAB; 32], &w.v.address, &w.token.address, &a);
    assert!(w.v.try_pay(&a, &sign_raw(&w, &w.key, &raw)).is_err());
}

#[test]
fn wrong_contract_fails() {
    let w = setup();
    let a = auth(&w, &w.merchant, UNIT, 1);
    let other = Address::generate(&w.env);
    let raw = msg_with(w.env.ledger().network_id().to_array(), &other, &w.token.address, &a);
    assert!(w.v.try_pay(&a, &sign_raw(&w, &w.key, &raw)).is_err());
}

#[test]
fn wrong_token_fails() {
    let w = setup();
    let a = auth(&w, &w.merchant, UNIT, 1);
    let fake = w.env.register_stellar_asset_contract_v2(Address::generate(&w.env)).address();
    let raw = msg_with(w.env.ledger().network_id().to_array(), &w.v.address, &fake, &a);
    assert!(w.v.try_pay(&a, &sign_raw(&w, &w.key, &raw)).is_err());
}

#[test]
fn wrong_family_fails() {
    let w = setup();
    let fam2 = w.v.create_family(&w.sender);
    w.v.deposit(&fam2, &w.sender, &(50 * UNIT));
    w.v.register_key(&fam2, &pk(&w.env, &w.key));
    let a = auth(&w, &w.merchant, UNIT, 1);
    let s = sign(&w, &a);
    let mut b = a.clone();
    b.family_id = fam2;
    assert!(w.v.try_pay(&b, &s).is_err());
    assert_eq!(w.v.balance(&fam2), 50 * UNIT);
}

#[test]
fn invalid_signature_fails() {
    let w = setup();
    let a = auth(&w, &w.merchant, UNIT, 1);
    let mut bytes = sign(&w, &a).to_array();
    bytes[0] ^= 0xFF;
    assert!(w.v.try_pay(&a, &BytesN::from_array(&w.env, &bytes)).is_err());
}

#[test]
fn unregistered_key_fails() {
    let w = setup();
    let stranger = SigningKey::from_bytes(&[3u8; 32]);
    let mut a = auth(&w, &w.merchant, UNIT, 1);
    a.signer = pk(&w.env, &stranger);
    let raw = msg_with(w.env.ledger().network_id().to_array(), &w.v.address, &w.token.address, &a);
    assert_eq!(w.v.try_pay(&a, &sign_raw(&w, &stranger, &raw)), Err(Ok(Error::KeyNotActive)));
}

#[test]
fn registered_key_signing_for_other_signer_field_fails() {
    // Signature by the registered key but claiming another (unregistered) signer.
    let w = setup();
    let a = auth(&w, &w.merchant, UNIT, 1);
    let s = sign(&w, &a);
    let mut b = a.clone();
    b.signer = pk(&w.env, &SigningKey::from_bytes(&[4u8; 32]));
    assert!(w.v.try_pay(&b, &s).is_err());
}

#[test]
fn expired_invoice_fails() {
    let w = setup();
    let a = auth(&w, &w.merchant, UNIT, 1);
    let s = sign(&w, &a);
    w.env.ledger().set_timestamp(NOW + 601);
    assert_eq!(w.v.try_pay(&a, &s), Err(Ok(Error::InvoiceExpired)));
}

#[test]
fn invoice_window_too_long_fails() {
    let w = setup();
    let mut a = auth(&w, &w.merchant, UNIT, 1);
    a.expires_at = NOW + MAX_INVOICE_WINDOW + 1;
    let s = sign(&w, &a);
    assert_eq!(w.v.try_pay(&a, &s), Err(Ok(Error::InvoiceWindowTooLong)));
}

#[test]
fn revoked_key_fails_but_completed_payment_stands() {
    let w = setup();
    let a = auth(&w, &w.merchant, UNIT, 1);
    w.v.pay(&a, &sign(&w, &a));
    w.v.revoke_key(&w.fam, &pk(&w.env, &w.key));
    let b = auth(&w, &w.merchant, UNIT, 2);
    assert_eq!(w.v.try_pay(&b, &sign(&w, &b)), Err(Ok(Error::KeyNotActive)));
    assert_eq!(w.token.balance(&w.merchant), UNIT);
    assert_eq!(w.v.balance(&w.fam), 99 * UNIT);
}

#[test]
fn zero_and_negative_amount_rejected() {
    let w = setup();
    let a = auth(&w, &w.merchant, 0, 1);
    assert_eq!(w.v.try_pay(&a, &sign(&w, &a)), Err(Ok(Error::NonPositiveAmount)));
    let b = auth(&w, &w.merchant, -UNIT, 2);
    assert_eq!(w.v.try_pay(&b, &sign(&w, &b)), Err(Ok(Error::NonPositiveAmount)));
}

#[test]
fn insufficient_funds_rejected_without_partial_debit() {
    let w = setup();
    let a = auth(&w, &w.merchant, 101 * UNIT, 1);
    assert_eq!(w.v.try_pay(&a, &sign(&w, &a)), Err(Ok(Error::InsufficientFunds)));
    assert_eq!(w.v.balance(&w.fam), 100 * UNIT);
    assert!(!w.v.is_invoice_used(&w.fam, &a.invoice_id));
}

#[test]
fn competing_payments_cannot_overspend_shared_balance() {
    // Two terminals at two merchants each hold a valid 60-unit authorization
    // against a 100-unit balance. Ledger ordering serializes them: one fails.
    let w = setup();
    let a = auth(&w, &w.merchant, 60 * UNIT, 1);
    let b = auth(&w, &w.merchant2, 60 * UNIT, 2);
    let (sa, sb) = (sign(&w, &a), sign(&w, &b));
    w.v.pay(&a, &sa);
    assert_eq!(w.v.try_pay(&b, &sb), Err(Ok(Error::InsufficientFunds)));
    assert_eq!(w.token.balance(&w.merchant2), 0);
    assert_eq!(w.v.balance(&w.fam), 40 * UNIT);
}

#[test]
fn shared_balance_works_across_two_merchants() {
    let w = setup();
    let a = auth(&w, &w.merchant, 30 * UNIT, 1);
    let b = auth(&w, &w.merchant2, 20 * UNIT, 2);
    w.v.pay(&a, &sign(&w, &a));
    w.v.pay(&b, &sign(&w, &b));
    assert_eq!(w.token.balance(&w.merchant), 30 * UNIT);
    assert_eq!(w.token.balance(&w.merchant2), 20 * UNIT);
    assert_eq!(w.v.balance(&w.fam), 50 * UNIT);
}

#[test]
fn withdraw_requires_sender_and_respects_balance() {
    let w = setup();
    w.env.set_auths(&[]);
    assert!(w.v.try_withdraw(&w.fam, &UNIT).is_err());
    w.env.mock_all_auths();
    assert_eq!(w.v.try_withdraw(&w.fam, &(101 * UNIT)), Err(Ok(Error::InsufficientFunds)));
    assert_eq!(w.v.withdraw(&w.fam, &(40 * UNIT)), 60 * UNIT);
    assert_eq!(w.token.balance(&w.sender), 940 * UNIT);
}

#[test]
fn multiple_families_are_isolated() {
    let w = setup();
    let sender2 = Address::generate(&w.env);
    StellarAssetClient::new(&w.env, &w.token.address).mint(&sender2, &(10 * UNIT));
    let fam2 = w.v.create_family(&sender2);
    w.v.deposit(&fam2, &sender2, &(10 * UNIT));
    // Family 1's key is not registered on family 2.
    let mut a = auth(&w, &w.merchant, UNIT, 1);
    a.family_id = fam2;
    assert_eq!(w.v.try_pay(&a, &sign(&w, &a)), Err(Ok(Error::KeyNotActive)));
    // Same invoice id is scoped per family: family 1 can still use it.
    let b = auth(&w, &w.merchant, UNIT, 1);
    w.v.pay(&b, &sign(&w, &b));
    assert_eq!(w.v.balance(&fam2), 10 * UNIT);
    assert_eq!(w.v.balance(&w.fam), 99 * UNIT);
}

#[test]
fn money_is_conserved() {
    let w = setup();
    let a = auth(&w, &w.merchant, 12 * UNIT, 1);
    w.v.pay(&a, &sign(&w, &a));
    w.v.withdraw(&w.fam, &(8 * UNIT));
    let f = w.v.get_family(&w.fam);
    assert_eq!(f.total_deposited - f.total_paid - f.total_withdrawn, f.balance);
    assert_eq!(w.token.balance(&w.v.address), f.balance);
    assert_eq!(
        w.token.balance(&w.sender) + w.token.balance(&w.merchant) + w.token.balance(&w.v.address),
        1_000 * UNIT
    );
}

#[test]
fn replay_record_survives_ttl_window() {
    // After the invoice's whole validity window passes, the record still exists
    // and the (now expired) signature still cannot be replayed.
    let w = setup();
    let a = auth(&w, &w.merchant, UNIT, 1);
    let s = sign(&w, &a);
    w.v.pay(&a, &s);
    w.env.ledger().with_mut(|l| {
        l.sequence_number += 100_000;
        l.timestamp = NOW + 500;
    });
    assert!(w.v.is_invoice_used(&w.fam, &a.invoice_id));
    assert_eq!(w.v.try_pay(&a, &s), Err(Ok(Error::InvoiceUsed)));
}

#[test]
fn double_registration_rejected_and_revoke_unknown_rejected() {
    let w = setup();
    assert_eq!(w.v.try_register_key(&w.fam, &pk(&w.env, &w.key)), Err(Ok(Error::KeyAlreadyRegistered)));
    let other = pk(&w.env, &SigningKey::from_bytes(&[5u8; 32]));
    assert_eq!(w.v.try_revoke_key(&w.fam, &other), Err(Ok(Error::KeyNotActive)));
}
