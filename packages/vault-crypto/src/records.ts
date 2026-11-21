import { equalBytes, toHex } from './bytes';
import type { CanonicalObject } from './canonical';
import { contextBytes, type VaultScope } from './context';
import { VaultCryptoError } from './errors';
import { sha256 } from './kdf';
import type { KeyLogState } from './keylog';
import {
  bool,
  bytes,
  count,
  malformed,
  nullableBytes,
  oneOf,
  record,
  text,
} from './schema';
import { assertSignature, signObject } from './signing';

export const CIPHERS = [
  'aead-edk',
  'hpke-intake',
  'hpke-esk',
  'tombstone',
] as const;
export type Cipher = (typeof CIPHERS)[number];

/**
 * Re-encryption into a new epoch keeps the original record's hash and
 * signature, and an admin attests the plaintext is unchanged, so a consumer
 * verifies both signatures. `sensitivity_change` is true exactly when the
 * re-encryption marks the variable sensitive or clears that flag.
 */
export type ReencryptionSource = {
  readonly record_hash: Uint8Array;
  readonly writer_id: string;
  readonly signature: Uint8Array;
  readonly plaintext_unchanged: true;
  readonly sensitivity_change: boolean;
};

/** One signed version of one variable. Tombstones carry no ciphertext. */
export type VersionRecord = VaultScope & {
  readonly env: string;
  readonly variable_id: string;
  readonly name: string;
  readonly type: 'secret' | 'variable';
  readonly sensitive: boolean;
  readonly version: number;
  readonly epoch: number;
  readonly cipher: Cipher;
  readonly enc_id: Uint8Array | null;
  readonly ciphertext_hash: Uint8Array | null;
  readonly prev_record_hash: Uint8Array | null;
  readonly auth_seq: number;
  readonly writer_id: string;
  readonly written_at: number;
  readonly source: ReencryptionSource | null;
};

export type SignedRecord = {
  readonly record: VersionRecord;
  readonly signature: Uint8Array;
};

const RECORD_FIELDS = [
  'deployment',
  'vault_id',
  'env',
  'variable_id',
  'name',
  'type',
  'sensitive',
  'version',
  'epoch',
  'cipher',
  'enc_id',
  'ciphertext_hash',
  'prev_record_hash',
  'auth_seq',
  'writer_id',
  'written_at',
  'source',
] as const;
const NAME = /^[A-Z_][A-Z0-9_]{0,127}$/;
export const MAX_PROVENANCE_DEPTH = 16;

function invalid(message: string): never {
  throw new VaultCryptoError('invalid_input', message);
}

function fail(message: string): never {
  throw new VaultCryptoError('bad_signature', message);
}

/** Exact wire schema plus the structural rules every record obeys. */
export function validateRecord(value: unknown): asserts value is VersionRecord {
  const r = record(value, RECORD_FIELDS, 'record');
  text(r.deployment, 'deployment');
  bytes(r.vault_id, 32, 'vault_id');
  text(r.env, 'env');
  text(r.variable_id, 'variable_id');
  if (typeof r.name !== 'string' || !NAME.test(r.name)) malformed('name');
  oneOf(r.type, ['secret', 'variable'] as const, 'type');
  const sensitive = bool(r.sensitive, 'sensitive');
  const version = count(r.version, 'version', 1);
  count(r.epoch, 'epoch', 1);
  const cipher = oneOf(r.cipher, CIPHERS, 'cipher');
  const encId = nullableBytes(r.enc_id, 16, 'enc_id');
  const ctHash = nullableBytes(r.ciphertext_hash, 32, 'ciphertext_hash');
  const prev = nullableBytes(r.prev_record_hash, 32, 'prev_record_hash');
  count(r.auth_seq, 'auth_seq');
  text(r.writer_id, 'writer_id');
  count(r.written_at, 'written_at');
  if ((version === 1) !== (prev === null))
    invalid('Only the first version has no previous record');
  const tombstone = cipher === 'tombstone';
  if (tombstone !== (ctHash === null) || tombstone !== (encId === null)) {
    invalid('Ciphertext fields must match the cipher');
  }
  if (!tombstone && (cipher === 'hpke-esk') !== sensitive) {
    invalid('Sensitive values must be sealed to the ESK');
  }
  if (r.source !== null) {
    const s = record(
      r.source,
      [
        'record_hash',
        'writer_id',
        'signature',
        'plaintext_unchanged',
        'sensitivity_change',
      ],
      'source'
    );
    bytes(s.record_hash, 32, 'source');
    text(s.writer_id, 'source');
    bytes(s.signature, 64, 'source');
    if (s.plaintext_unchanged !== true) malformed('source');
    bool(s.sensitivity_change, 'source');
    if (tombstone) invalid('A tombstone is not a re-encryption');
  }
}

function recordObject(r: VersionRecord): CanonicalObject {
  return { ...r, source: r.source === null ? null : { ...r.source } };
}

export function signRecord(
  secretKey: Uint8Array,
  r: VersionRecord
): SignedRecord {
  validateRecord(r);
  return {
    record: r,
    signature: signObject(secretKey, 'record', recordObject(r)),
  };
}

/** Hash that chains records and that witness snapshots commit to. */
export function recordHash(signed: SignedRecord): Uint8Array {
  return sha256(
    contextBytes('record-hash', {
      record: recordObject(signed.record),
      signature: signed.signature,
    })
  );
}

export type Authority = {
  readonly signingKey: Uint8Array;
  readonly canWrite: boolean;
  /** Admin authority: may attest that a re-encryption preserves plaintext. */
  readonly canAttest: boolean;
};

/**
 * Authority of `userId` on `env` after key-log entry `seq`: a workspace owner
 * or admin, or the member role in force then.
 */
export function authorityAt(
  state: KeyLogState,
  userId: string,
  env: string,
  seq: number
): Authority | null {
  const m = state.managersAt(seq);
  const manager = [...m.owners, ...m.admins].find((p) => p.user_id === userId);
  if (manager)
    return { signingKey: manager.signing_key, canWrite: true, canAttest: true };
  const role = state.roleAt(env, userId, seq);
  if (!role) return null;
  return {
    signingKey: role.signingKey,
    canWrite:
      role.role === 'writer' || role.role === 'editor' || role.role === 'admin',
    canAttest: role.role === 'admin',
  };
}

function verifyOne(signed: unknown, state: KeyLogState): VersionRecord {
  const wrapper = record(signed, ['record', 'signature'], 'signed record');
  validateRecord(wrapper.record);
  const r = wrapper.record;
  const signature = bytes(wrapper.signature, 64, 'signature');
  if (
    r.deployment !== state.deployment ||
    !equalBytes(r.vault_id, state.vaultId)
  )
    fail('Record for another vault');
  const authority = authorityAt(state, r.writer_id, r.env, r.auth_seq);
  if (!authority?.canWrite || (r.source !== null && !authority.canAttest)) {
    fail('Writer not authorised at auth_seq');
  }
  assertSignature(authority.signingKey, 'record', recordObject(r), signature);
  if (state.epochAt(r.env, r.auth_seq)?.epoch !== r.epoch) {
    fail('Record epoch is not the epoch in force at auth_seq');
  }
  return r;
}

/**
 * Historical verification: the record, and for a re-encryption every
 * ancestor up to an original write, were signed by principals authorised at
 * their `auth_seq`. Ancestors are looked up by record hash in `ancestry`.
 */
export function verifyRecord(
  signed: SignedRecord,
  state: KeyLogState,
  ancestry: ReadonlyMap<string, SignedRecord> = new Map()
): void {
  let current = verifyOne(signed, state);
  for (let depth = 0; current.source !== null; depth++) {
    if (depth >= MAX_PROVENANCE_DEPTH) fail('Re-encryption chain too long');
    const source = current.source;
    const original = ancestry.get(toHex(source.record_hash));
    if (!original || !equalBytes(recordHash(original), source.record_hash))
      fail('Re-encryption source missing');
    const o = verifyOne(original, state);
    if (
      o.cipher === 'tombstone' ||
      o.env !== current.env ||
      o.variable_id !== current.variable_id ||
      o.name !== current.name ||
      o.type !== current.type ||
      (o.sensitive !== current.sensitive) !== source.sensitivity_change ||
      o.writer_id !== source.writer_id ||
      !equalBytes(original.signature, source.signature) ||
      o.epoch >= current.epoch ||
      o.version >= current.version
    ) {
      fail('Re-encryption source mismatch');
    }
    current = o;
  }
}

/**
 * Append validation for the witness: on top of historical verification, the
 * writer must still hold authority at the current head (no intervening
 * revocation), the record must use the current epoch, and it must extend the
 * variable's current head exactly.
 */
export function verifyAppend(
  signed: SignedRecord,
  state: KeyLogState,
  head: SignedRecord | null,
  ancestry?: ReadonlyMap<string, SignedRecord>
): void {
  verifyRecord(signed, state, ancestry);
  const r = signed.record;
  // Authority must be continuous from auth_seq to the head with the same key,
  // so a revoke-then-regrant cannot admit a record signed before revocation.
  const signedWith = authorityAt(
    state,
    r.writer_id,
    r.env,
    r.auth_seq
  )?.signingKey;
  for (let seq = r.auth_seq; seq <= state.headSeq; seq++) {
    const at = authorityAt(state, r.writer_id, r.env, seq);
    if (
      !at?.canWrite ||
      (r.source !== null && !at.canAttest) ||
      !signedWith ||
      !equalBytes(at.signingKey, signedWith)
    ) {
      fail('Writer authority revoked since auth_seq');
    }
  }
  const epoch = state.epochAt(r.env);
  if (!epoch || epoch.epoch !== r.epoch)
    fail('Record must use the current epoch');
  if (head === null) {
    if (r.version !== 1) fail('First record must be version 1');
    return;
  }
  if (head.record.variable_id !== r.variable_id || head.record.env !== r.env)
    fail('Head for another variable');
  if (
    r.version !== head.record.version + 1 ||
    !equalBytes(r.prev_record_hash ?? new Uint8Array(), recordHash(head))
  ) {
    fail('Record does not extend the current head');
  }
}

export function assertCiphertextHash(
  r: VersionRecord,
  ciphertext: Uint8Array
): void {
  if (
    r.ciphertext_hash === null ||
    !equalBytes(sha256(ciphertext), r.ciphertext_hash)
  ) {
    throw new VaultCryptoError(
      'bad_mac',
      'Ciphertext does not match its record'
    );
  }
}
