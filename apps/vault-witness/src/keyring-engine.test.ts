import {
  generateSigningKeyPair,
  type KeyringHead,
  keyringHeadHash,
  randomBytes,
  type SignedKeyringHead,
  signKeyringConfirmation,
  signKeyringHead,
  verifyKeyringAttestation,
} from '@tuturuuu/vault-crypto';
import { describe, expect, it } from 'vite-plus/test';
import { createKeyringEngine, type KeyringPending } from './keyring-engine';
import { DEPLOYMENT, signer, sqlite } from './test-support';

const NOW = 1_800_000_000_000;

function setup() {
  const db = sqlite();
  const vaultUserId = randomBytes(16);
  const keys = new Map<number, Uint8Array>();
  let current = signer(1);
  keys.set(1, current.publicKey);
  let engine = createKeyringEngine(db.sql, current);
  const run = <T>(fn: (e: typeof engine) => T) => db.tx(() => fn(engine));
  const identity = generateSigningKeyPair();
  const head = (
    key: ReturnType<typeof generateSigningKeyPair>,
    prev: SignedKeyringHead | null,
    extra: Partial<KeyringHead> = {}
  ) =>
    signKeyringHead(key.secretKey, {
      deployment: DEPLOYMENT,
      vault_user_id: vaultUserId,
      counter: prev ? prev.head.counter + 1 : 0,
      prev_hash: prev ? keyringHeadHash(prev) : null,
      keyring_hash: randomBytes(32),
      signing_key: key.publicKey,
      next_signing_key: null,
      issued_at: 1000,
      ...extra,
    });
  const put = (h: SignedKeyringHead) =>
    run((e) =>
      e.put(
        { deployment: DEPLOYMENT, vault_user_id: vaultUserId, head: h },
        NOW
      )
    );
  return {
    vaultUserId,
    keys,
    identity,
    head,
    put,
    run,
    rotate(generation: number) {
      current = signer(generation);
      keys.set(generation, current.publicKey);
      engine = createKeyringEngine(db.sql, current);
    },
  };
}

describe('keyring authority', () => {
  it('accepts a chain of heads and signs the current one', () => {
    const s = setup();
    const h0 = s.head(s.identity, null);
    expect(s.put(h0)).toEqual({ ok: true, counter: 0 });
    const h1 = s.head(s.identity, h0);
    expect(s.put(h1)).toEqual({ ok: true, counter: 1 });
    const nonce = randomBytes(16);
    const out = s.run((e) =>
      e.attest({ vault_user_id: s.vaultUserId, nonce }, NOW)
    );
    if (!out.ok) throw new Error(out.error);
    const a = verifyKeyringAttestation(out.attestation, {
      deployment: DEPLOYMENT,
      vaultUserId: s.vaultUserId,
      witnessKeys: s.keys,
      minGeneration: 1,
      now: NOW / 1000,
      floorCounter: 1,
      expectedNonce: nonce,
    });
    expect(a.keyring_hash).toEqual(h1.head.keyring_hash);
    expect(out.head).toEqual(h1);
  });

  it('refuses replayed, forked and foreign-key heads', () => {
    const s = setup();
    const h0 = s.head(s.identity, null);
    s.put(h0);
    const h1 = s.head(s.identity, h0);
    s.put(h1);
    expect(s.put(h0)).toMatchObject({ ok: false, error: 'rejected' });
    expect(s.put(s.head(s.identity, h0))).toMatchObject({ ok: false });
    expect(s.put(s.head(generateSigningKeyPair(), h1))).toMatchObject({
      ok: false,
      error: 'rejected',
    });
  });

  it('follows an identity rotation named by the previous head', () => {
    const s = setup();
    const next = generateSigningKeyPair();
    const h0 = s.head(s.identity, null, { next_signing_key: next.publicKey });
    s.put(h0);
    expect(s.put(s.head(s.identity, h0))).toMatchObject({ ok: false });
    expect(s.put(s.head(next, h0))).toEqual({ ok: true, counter: 1 });
  });

  it('enters re-attest on a new generation until the identity key confirms the head', () => {
    const s = setup();
    const h0 = s.head(s.identity, null);
    s.put(h0);
    s.rotate(2);
    const blocked = s.run((e) =>
      e.attest({ vault_user_id: s.vaultUserId, nonce: null }, NOW)
    );
    expect(blocked).toMatchObject({ ok: false, error: 'reattest_required' });
    const pending = (blocked as unknown as { pending: KeyringPending }).pending;
    expect(pending).toMatchObject({ witness_generation: 2, counter: 0 });
    expect(s.put(s.head(s.identity, h0))).toMatchObject({
      error: 'reattest_required',
    });
    const wrong = signKeyringConfirmation(
      generateSigningKeyPair().secretKey,
      pending
    );
    expect(s.run((e) => e.confirm({ signature: wrong }, NOW))).toMatchObject({
      error: 'rejected',
    });
    const sig = signKeyringConfirmation(s.identity.secretKey, pending);
    expect(s.run((e) => e.confirm({ signature: sig }, NOW))).toEqual({
      ok: true,
    });
    expect(
      s.run((e) => e.attest({ vault_user_id: s.vaultUserId, nonce: null }, NOW))
    ).toMatchObject({ ok: true });
  });

  it('does not enter re-attest for an empty keyring', () => {
    const s = setup();
    s.rotate(2);
    expect(s.put(s.head(s.identity, null))).toEqual({ ok: true, counter: 0 });
  });
});
