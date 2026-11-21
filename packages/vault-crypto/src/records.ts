import type { CanonicalObject } from './canonical';
import { contextBytes, type VaultScope } from './context';
import { equalBytes } from './bytes';
import { VaultCryptoError } from './errors';
import { sha256 } from './kdf';
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
 * signature, and the re-encrypting admin attests the plaintext is unchanged,
 * so a consumer can verify both signatures.
 */
export type ReencryptionSource = {
  readonly record_hash: Uint8Array;
  readonly writer_id: string;
  readonly signature: Uint8Array;
  readonly plaintext_unchanged: true;
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

const NAME = /^[A-Z_][A-Z0-9_]{0,127}$/;

function invalid(message: string): never {
  throw new VaultCryptoError('invalid_input', message);
}

const isCount = (n: number) => Number.isSafeInteger(n) && n >= 0;

export function validateRecord(r: VersionRecord): void {
  if (!NAME.test(r.name)) invalid('Invalid variable name');
  if (r.type !== 'secret' && r.type !== 'variable') invalid('Invalid type');
  if (!CIPHERS.includes(r.cipher)) invalid('Invalid cipher');
  if (!isCount(r.version) || r.version < 1) invalid('Invalid version');
  if (!isCount(r.epoch) || !isCount(r.auth_seq) || !isCount(r.written_at)) {
    invalid('Invalid counter');
  }
  if ((r.version === 1) !== (r.prev_record_hash === null)) {
    invalid('Only the first version has no previous record');
  }
  if (r.prev_record_hash !== null && r.prev_record_hash.length !== 32) {
    invalid('Invalid previous record hash');
  }
  const tombstone = r.cipher === 'tombstone';
  if (
    tombstone !== (r.ciphertext_hash === null) ||
    tombstone !== (r.enc_id === null)
  ) {
    invalid('Ciphertext fields must match the cipher');
  }
  if (r.ciphertext_hash !== null && r.ciphertext_hash.length !== 32) {
    invalid('Invalid ciphertext hash');
  }
  if (r.enc_id !== null && r.enc_id.length !== 16) invalid('Invalid enc_id');
  if ((r.cipher === 'hpke-esk') !== r.sensitive && !tombstone) {
    invalid('Sensitive values must be sealed to the ESK');
  }
  if (r.source !== null) {
    if (tombstone) invalid('A tombstone is not a re-encryption');
    if (r.source.plaintext_unchanged !== true) invalid('Missing attestation');
    if (
      r.source.record_hash.length !== 32 ||
      r.source.signature.length !== 64
    ) {
      invalid('Invalid re-encryption source');
    }
  }
}

function recordObject(record: VersionRecord): CanonicalObject {
  return {
    ...record,
    source: record.source === null ? null : { ...record.source },
  };
}

export function signRecord(
  secretKey: Uint8Array,
  record: VersionRecord
): SignedRecord {
  validateRecord(record);
  return {
    record,
    signature: signObject(secretKey, 'record', recordObject(record)),
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

export type WriterLookup = (
  writerId: string,
  env: string,
  authSeq: number
) => { readonly signingKey: Uint8Array; readonly canWrite: boolean } | null;

/**
 * Verifies a record's structure and writer signature, that the writer could
 * write at `auth_seq`, and, for a re-encryption, the source writer's
 * signature over the original record. The original record is supplied by the
 * caller, and its hash must match the reference.
 */
export function verifyRecord(
  signed: SignedRecord,
  writerAt: WriterLookup,
  original?: SignedRecord
): void {
  const r = signed.record;
  validateRecord(r);
  const writer = writerAt(r.writer_id, r.env, r.auth_seq);
  if (!writer?.canWrite) {
    throw new VaultCryptoError(
      'bad_signature',
      'Writer not authorised at auth_seq'
    );
  }
  assertSignature(
    writer.signingKey,
    'record',
    recordObject(r),
    signed.signature
  );
  if (r.source === null) return;
  if (!original || !equalBytes(recordHash(original), r.source.record_hash)) {
    throw new VaultCryptoError(
      'bad_signature',
      'Re-encryption source mismatch'
    );
  }
  const o = original.record;
  if (
    o.variable_id !== r.variable_id ||
    o.env !== r.env ||
    o.writer_id !== r.source.writer_id ||
    !equalBytes(original.signature, r.source.signature) ||
    o.epoch >= r.epoch
  ) {
    throw new VaultCryptoError(
      'bad_signature',
      'Re-encryption source mismatch'
    );
  }
  verifyRecord(original, writerAt);
}

export function assertCiphertextHash(
  record: VersionRecord,
  ciphertext: Uint8Array
): void {
  if (
    record.ciphertext_hash === null ||
    !equalBytes(sha256(ciphertext), record.ciphertext_hash)
  ) {
    throw new VaultCryptoError(
      'bad_mac',
      'Ciphertext does not match its record'
    );
  }
}
