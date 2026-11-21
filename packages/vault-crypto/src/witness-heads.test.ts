import { describe, expect, it } from 'vitest';
import { randomBytes } from './bytes';
import { verifyKeyLog } from './keylog';
import { generateSigningKeyPair } from './signing';
import { DEPLOYMENT, LogBuilder, makeGenesis, party } from './test-fixtures';
import {
  type KeyringHead,
  keyringHeadHash,
  signKeyringAttestation,
  signKeyringConfirmation,
  signKeyringHead,
  signWitnessConfirmation,
  verifyKeyringAttestation,
  verifyKeyringConfirmation,
  verifyKeyringSuccessor,
  verifyWitnessConfirmation,
  type WitnessHeadView,
} from './witness-heads';

const vaultUserId = randomBytes(16);
const scope = { deployment: DEPLOYMENT, vaultUserId };

function head(
  key: ReturnType<typeof generateSigningKeyPair>,
  extra: Partial<KeyringHead> = {}
) {
  return signKeyringHead(key.secretKey, {
    deployment: DEPLOYMENT,
    vault_user_id: vaultUserId,
    counter: 0,
    prev_hash: null,
    keyring_hash: randomBytes(32),
    signing_key: key.publicKey,
    next_signing_key: null,
    issued_at: 1000,
    ...extra,
  });
}

describe('keyring heads', () => {
  it('chains heads under the identity key in force and follows a rotation', () => {
    const k1 = generateSigningKeyPair();
    const k2 = generateSigningKeyPair();
    const h0 = verifyKeyringSuccessor(head(k1), null, scope);
    const h1 = verifyKeyringSuccessor(
      head(k1, {
        counter: 1,
        prev_hash: keyringHeadHash(h0),
        next_signing_key: k2.publicKey,
      }),
      h0,
      scope
    );
    const next = (k: typeof k1) =>
      head(k, { counter: 2, prev_hash: keyringHeadHash(h1) });
    expect(() => verifyKeyringSuccessor(next(k2), h1, scope)).not.toThrow();
    expect(() => verifyKeyringSuccessor(next(k1), h1, scope)).toThrow(
      /identity key in force/
    );
  });

  it('rejects gaps, forks, replays, other users and forged signatures', () => {
    const k = generateSigningKeyPair();
    const h0 = head(k);
    expect(() =>
      verifyKeyringSuccessor(head(k, { counter: 1 }), null, scope)
    ).toThrow();
    for (const bad of [
      head(k, { counter: 2, prev_hash: keyringHeadHash(h0) }),
      head(k, { counter: 1, prev_hash: randomBytes(32) }),
      head(k, { counter: 1, prev_hash: keyringHeadHash(h0), issued_at: 1 }),
    ]) {
      expect(() => verifyKeyringSuccessor(bad, h0, scope)).toThrow();
    }
    expect(() =>
      verifyKeyringSuccessor(h0, null, {
        deployment: DEPLOYMENT,
        vaultUserId: randomBytes(16),
      })
    ).toThrow(/another user/);
    const forged = { ...h0, signature: randomBytes(64) };
    expect(() => verifyKeyringSuccessor(forged, null, scope)).toThrow();
  });
});

describe('keyring attestations', () => {
  const witness = generateSigningKeyPair();
  const keys = new Map([[2, witness.publicKey]]);
  const nonce = randomBytes(16);
  const attestation = (extra = {}) =>
    signKeyringAttestation(witness.secretKey, {
      deployment: DEPLOYMENT,
      vault_user_id: vaultUserId,
      witness_generation: 2,
      counter: 5,
      head_hash: randomBytes(32),
      keyring_hash: randomBytes(32),
      issued_at: 10_000,
      request_nonce: nonce,
      ...extra,
    });
  const options = {
    ...scope,
    witnessKeys: keys,
    minGeneration: 2,
    now: 10_100,
    floorCounter: 5,
    expectedNonce: nonce,
  };

  it('accepts a fresh answer at or above the floor', () => {
    expect(verifyKeyringAttestation(attestation(), options).counter).toBe(5);
  });

  it('rejects stale, behind-floor, unanswered and retired-generation attestations', () => {
    for (const [extra, opts] of [
      [{ issued_at: 9000 }, {}],
      [{}, { floorCounter: 6 }],
      [{ request_nonce: null }, {}],
      [{}, { minGeneration: 3 }],
      [{}, { vaultUserId: randomBytes(16) }],
    ] as const) {
      expect(() =>
        verifyKeyringAttestation(attestation(extra), { ...options, ...opts })
      ).toThrow();
    }
    const tampered = { ...attestation(), signature: randomBytes(64) };
    expect(() => verifyKeyringAttestation(tampered, options)).toThrow();
  });

  it('verifies a keyring confirmation by the identity key', () => {
    const k = generateSigningKeyPair();
    const body = {
      deployment: DEPLOYMENT,
      vault_user_id: vaultUserId,
      witness_generation: 3,
      counter: 4,
      head_hash: randomBytes(32),
    };
    const sig = signKeyringConfirmation(k.secretKey, body);
    expect(() =>
      verifyKeyringConfirmation(sig, body, k.publicKey)
    ).not.toThrow();
    expect(() =>
      verifyKeyringConfirmation(sig, { ...body, counter: 5 }, k.publicKey)
    ).toThrow();
  });
});

describe('witness confirmations', () => {
  const owner = party('owner');
  const outsider = party('outsider');
  const l = new LogBuilder(makeGenesis([owner], 1));
  const state = verifyKeyLog(l.genesis, l.entries, l.pinned);
  const view: WitnessHeadView = {
    deployment: DEPLOYMENT,
    vault_id: l.vaultId,
    witness_generation: 2,
    revision: 7,
    seq: 0,
    key_log_head: state.headHash,
    env_roots: [{ env: 'prod', size: 1, root: randomBytes(32) }],
    audit_head: randomBytes(32),
  };

  it('accepts only an owner signature over exactly the current view', () => {
    const ok = signWitnessConfirmation(
      owner.pair.secretKey,
      owner.signing_key,
      view
    );
    expect(() => verifyWitnessConfirmation(ok, view, state)).not.toThrow();
    expect(() =>
      verifyWitnessConfirmation(ok, { ...view, revision: 8 }, state)
    ).toThrow();
    const stranger = signWitnessConfirmation(
      outsider.pair.secretKey,
      outsider.signing_key,
      view
    );
    expect(() => verifyWitnessConfirmation(stranger, view, state)).toThrow(
      /current owner/
    );
  });
});
