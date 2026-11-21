import { equalBytes } from './bytes';
import type { CanonicalObject } from './canonical';
import { contextBytes } from './context';
import { VaultCryptoError } from './errors';
import { sha256 } from './kdf';
import type { KeyLogState } from './keylog';
import { bytes, count, list, nullableBytes, record, text } from './schema';
import type { Attestation, EnvRoot } from './snapshot';
import { assertSignature, signObject, verifyObject } from './signing';

export const VAULT_USER_ID_BYTES = 16;
const MAX_CLOCK_SKEW_SECONDS = 60;
export const MAX_KEYRING_ATTESTATION_AGE_SECONDS = 600;

function fail(message: string): never {
  throw new VaultCryptoError('bad_signature', message);
}

/**
 * One keyring version, signed by the user's strong identity key. The first
 * head (counter 0) names the identity key; each later head extends the
 * previous head hash and is signed by the key in force, and may name the next
 * identity key, which signs from the following head on.
 */
export type KeyringHead = {
  readonly deployment: string;
  readonly vault_user_id: Uint8Array;
  readonly counter: number;
  readonly prev_hash: Uint8Array | null;
  readonly keyring_hash: Uint8Array;
  readonly signing_key: Uint8Array;
  readonly next_signing_key: Uint8Array | null;
  readonly issued_at: number;
};

export type SignedKeyringHead = {
  readonly head: KeyringHead;
  readonly signature: Uint8Array;
};

const HEAD_FIELDS = [
  'deployment',
  'vault_user_id',
  'counter',
  'prev_hash',
  'keyring_hash',
  'signing_key',
  'next_signing_key',
  'issued_at',
] as const;

export function validateKeyringHead(
  value: unknown
): asserts value is SignedKeyringHead {
  const signed = record(value, ['head', 'signature'], 'keyring head');
  bytes(signed.signature, 64, 'signature');
  const h = record(signed.head, HEAD_FIELDS, 'keyring head');
  text(h.deployment, 'deployment');
  bytes(h.vault_user_id, VAULT_USER_ID_BYTES, 'vault_user_id');
  const counter = count(h.counter, 'counter');
  const prev = nullableBytes(h.prev_hash, 32, 'prev_hash');
  bytes(h.keyring_hash, 32, 'keyring_hash');
  bytes(h.signing_key, 32, 'signing_key');
  nullableBytes(h.next_signing_key, 32, 'next_signing_key');
  count(h.issued_at, 'issued_at');
  if ((counter === 0) !== (prev === null)) {
    throw new VaultCryptoError(
      'invalid_input',
      'Only the first keyring head has no previous head'
    );
  }
}

const headObject = (h: KeyringHead): CanonicalObject => ({ ...h });

export function signKeyringHead(
  secretKey: Uint8Array,
  head: KeyringHead
): SignedKeyringHead {
  const signed = {
    head,
    signature: signObject(secretKey, 'keyring-head', headObject(head)),
  };
  validateKeyringHead(signed);
  return signed;
}

export function keyringHeadHash(signed: SignedKeyringHead): Uint8Array {
  return sha256(
    contextBytes('keyring-head-hash', {
      head: headObject(signed.head),
      signature: signed.signature,
    })
  );
}

/**
 * Checks that `next` validly follows `current` (or starts a keyring when
 * `current` is null): scope, counter, previous hash, the identity key in
 * force and its signature.
 */
export function verifyKeyringSuccessor(
  next: unknown,
  current: SignedKeyringHead | null,
  scope: { readonly deployment: string; readonly vaultUserId: Uint8Array }
): SignedKeyringHead {
  validateKeyringHead(next);
  const h = next.head;
  if (
    h.deployment !== scope.deployment ||
    !equalBytes(h.vault_user_id, scope.vaultUserId)
  ) {
    fail('Keyring head for another user');
  }
  if (current === null) {
    if (h.counter !== 0) fail('A keyring starts at counter 0');
  } else {
    const c = current.head;
    const key = c.next_signing_key ?? c.signing_key;
    if (
      h.counter !== c.counter + 1 ||
      !equalBytes(h.prev_hash ?? new Uint8Array(), keyringHeadHash(current))
    ) {
      fail('Keyring head does not extend the current head');
    }
    if (!equalBytes(h.signing_key, key))
      fail('Keyring head is not signed by the identity key in force');
    if (h.issued_at < c.issued_at) fail('Keyring head time went backwards');
  }
  if (h.next_signing_key && equalBytes(h.next_signing_key, h.signing_key))
    fail('Next identity key must differ');
  assertSignature(h.signing_key, 'keyring-head', headObject(h), next.signature);
  return next;
}

/** Signed by the witness on request: the user's current keyring head. */
export type KeyringAttestation = {
  readonly deployment: string;
  readonly vault_user_id: Uint8Array;
  readonly witness_generation: number;
  readonly counter: number;
  readonly head_hash: Uint8Array;
  readonly keyring_hash: Uint8Array;
  readonly issued_at: number;
  readonly request_nonce: Uint8Array | null;
};

export type SignedKeyringAttestation = {
  readonly attestation: KeyringAttestation;
  readonly signature: Uint8Array;
};

export function signKeyringAttestation(
  secretKey: Uint8Array,
  attestation: KeyringAttestation
): SignedKeyringAttestation {
  return {
    attestation,
    signature: signObject(secretKey, 'keyring-attestation', {
      ...attestation,
    }),
  };
}

/**
 * A client accepts a keyring only when it hashes to the `keyring_hash` of a
 * fresh attestation from a pinned witness generation, at or above its counter
 * floor, answering its nonce when one was sent.
 */
export function verifyKeyringAttestation(
  signed: unknown,
  options: {
    readonly deployment: string;
    readonly vaultUserId: Uint8Array;
    readonly witnessKeys: ReadonlyMap<number, Uint8Array>;
    readonly minGeneration: number;
    readonly now: number;
    readonly floorCounter: number;
    readonly expectedNonce?: Uint8Array;
  }
): KeyringAttestation {
  const s = record(signed, ['attestation', 'signature'], 'attestation');
  bytes(s.signature, 64, 'signature');
  const a = record(
    s.attestation,
    [
      'deployment',
      'vault_user_id',
      'witness_generation',
      'counter',
      'head_hash',
      'keyring_hash',
      'issued_at',
      'request_nonce',
    ],
    'attestation'
  ) as KeyringAttestation;
  text(a.deployment, 'deployment');
  bytes(a.vault_user_id, VAULT_USER_ID_BYTES, 'vault_user_id');
  count(a.witness_generation, 'witness_generation', 1);
  count(a.counter, 'counter');
  bytes(a.head_hash, 32, 'head_hash');
  bytes(a.keyring_hash, 32, 'keyring_hash');
  count(a.issued_at, 'issued_at');
  nullableBytes(a.request_nonce, 16, 'request_nonce');
  if (a.witness_generation < options.minGeneration)
    fail('Retired witness generation');
  const key = options.witnessKeys.get(a.witness_generation);
  if (!key) fail('Unknown witness generation');
  if (
    !verifyObject(key, 'keyring-attestation', { ...a }, s.signature as never)
  ) {
    fail('Signature verification failed');
  }
  if (
    a.deployment !== options.deployment ||
    !equalBytes(a.vault_user_id, options.vaultUserId)
  ) {
    fail('Attestation for another user');
  }
  if (
    a.issued_at > options.now + MAX_CLOCK_SKEW_SECONDS ||
    a.issued_at < options.now - MAX_KEYRING_ATTESTATION_AGE_SECONDS
  ) {
    fail('Stale attestation');
  }
  if (a.counter < options.floorCounter)
    fail('Attestation is behind the client floor');
  if (
    options.expectedNonce &&
    !(a.request_nonce && equalBytes(a.request_nonce, options.expectedNonce))
  ) {
    fail('Attestation does not answer this request');
  }
  return a;
}

/**
 * The state a restored witness asks an owner to confirm before it signs
 * attestations again: an attestation without its time and nonce.
 */
export type WitnessHeadView = Omit<Attestation, 'issued_at' | 'request_nonce'>;

export type WitnessConfirmation = {
  readonly view: WitnessHeadView;
  readonly key: Uint8Array;
  readonly signature: Uint8Array;
};

const viewObject = (v: WitnessHeadView): CanonicalObject => ({
  deployment: v.deployment,
  vault_id: v.vault_id,
  witness_generation: v.witness_generation,
  revision: v.revision,
  seq: v.seq,
  key_log_head: v.key_log_head,
  env_roots: v.env_roots.map((r: EnvRoot) => ({ ...r })),
  audit_head: v.audit_head,
});

/** An owner's client signs the head after checking it against its floors. */
export function signWitnessConfirmation(
  secretKey: Uint8Array,
  publicKey: Uint8Array,
  view: WitnessHeadView
): WitnessConfirmation {
  return {
    view,
    key: publicKey,
    signature: signObject(secretKey, 'witness-confirm', viewObject(view)),
  };
}

/**
 * The witness accepts a confirmation only for exactly its current view and
 * only from a key in the owner set at its head.
 */
export function verifyWitnessConfirmation(
  value: unknown,
  current: WitnessHeadView,
  state: KeyLogState
): void {
  const c = record(value, ['view', 'key', 'signature'], 'confirmation');
  const key = bytes(c.key, 32, 'key');
  const signature = bytes(c.signature, 64, 'signature');
  const owners = state.managersAt(state.headSeq).owners;
  if (!owners.some((o) => equalBytes(o.signing_key, key)))
    fail('Confirmation is not by a current owner');
  const expected = viewObject(current);
  const v = record(c.view, Object.keys(expected), 'view');
  list(v.env_roots, 'env_roots');
  assertSignature(key, 'witness-confirm', expected, signature);
}

export type KeyringConfirmationBody = {
  readonly deployment: string;
  readonly vault_user_id: Uint8Array;
  readonly witness_generation: number;
  readonly counter: number;
  readonly head_hash: Uint8Array;
};

/** The user's identity key confirms a restored keyring head. */
export function signKeyringConfirmation(
  secretKey: Uint8Array,
  body: KeyringConfirmationBody
): Uint8Array {
  return signObject(secretKey, 'keyring-confirm', { ...body });
}

export function verifyKeyringConfirmation(
  signature: unknown,
  body: KeyringConfirmationBody,
  identityKey: Uint8Array
): void {
  assertSignature(
    identityKey,
    'keyring-confirm',
    { ...body },
    bytes(signature, 64, 'signature')
  );
}
