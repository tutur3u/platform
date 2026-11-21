import { equalBytes } from './bytes';
import { contextBytes, type VaultScope } from './context';
import { VaultCryptoError } from './errors';
import type { KeyLogState } from './keylog';
import { leafHash, treeRoot, verifyInclusion } from './merkle';
import { recordHash, type SignedRecord, validateRecord } from './records';
import { bytes, count, list, nullableBytes, record, text } from './schema';
import { assertSignature, signObject } from './signing';

/** One leaf per variable: the hash of its latest record or tombstone. */
export type SnapshotLeaf = {
  readonly env: string;
  readonly variable_id: string;
  readonly head: Uint8Array;
};

export type EnvRoot = {
  readonly env: string;
  readonly size: number;
  readonly root: Uint8Array;
};

/**
 * Signed by the witness on request, without appending to the log.
 * `revision` increases on every accepted transition, including value writes
 * and deletions that do not touch the key log, so a client floor on it
 * rejects any older snapshot. `request_nonce` echoes the client's fresh
 * nonce when the client asks for one.
 */
export type Attestation = VaultScope & {
  readonly witness_generation: number;
  readonly revision: number;
  readonly seq: number;
  readonly key_log_head: Uint8Array;
  readonly env_roots: readonly EnvRoot[];
  readonly audit_head: Uint8Array;
  readonly issued_at: number;
  readonly request_nonce: Uint8Array | null;
};

export type SignedAttestation = {
  readonly attestation: Attestation;
  readonly signature: Uint8Array;
};

export const MAX_ATTESTATION_AGE_SECONDS = 600;
const MAX_CLOCK_SKEW_SECONDS = 60;

function fail(message: string): never {
  throw new VaultCryptoError('bad_signature', message);
}

export function snapshotLeafHash(
  scope: VaultScope,
  leaf: SnapshotLeaf
): Uint8Array {
  bytes(leaf.head, 32, 'head');
  return leafHash(
    contextBytes('snapshot-leaf', {
      deployment: scope.deployment,
      vault_id: scope.vault_id,
      env: leaf.env,
      variable_id: leaf.variable_id,
      head: leaf.head,
    })
  );
}

/** Leaves are ordered by `variable_id` so the tree is deterministic. */
export function sortLeaves(leaves: readonly SnapshotLeaf[]): SnapshotLeaf[] {
  return [...leaves].sort((a, b) =>
    a.variable_id < b.variable_id ? -1 : a.variable_id > b.variable_id ? 1 : 0
  );
}

/** Builds an environment root; the witness is the only builder, and it rejects duplicates. */
export function environmentRoot(
  scope: VaultScope,
  env: string,
  leaves: readonly SnapshotLeaf[]
): EnvRoot {
  const sorted = sortLeaves(leaves);
  if (sorted.some((l) => l.env !== env))
    throw new VaultCryptoError('invalid_input', 'Mixed environments');
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i]?.variable_id === sorted[i - 1]?.variable_id) {
      throw new VaultCryptoError('invalid_input', 'Duplicate variable');
    }
  }
  return {
    env,
    size: sorted.length,
    root: treeRoot(sorted.map((l) => snapshotLeafHash(scope, l))),
  };
}

function attestationObject(a: Attestation) {
  return { ...a, env_roots: a.env_roots.map((r) => ({ ...r })) };
}

function assertShape(value: unknown): asserts value is SignedAttestation {
  const signed = record(value, ['attestation', 'signature'], 'attestation');
  bytes(signed.signature, 64, 'signature');
  const a = record(
    signed.attestation,
    [
      'deployment',
      'vault_id',
      'witness_generation',
      'revision',
      'seq',
      'key_log_head',
      'env_roots',
      'audit_head',
      'issued_at',
      'request_nonce',
    ],
    'attestation'
  );
  text(a.deployment, 'deployment');
  bytes(a.vault_id, 32, 'vault_id');
  count(a.witness_generation, 'witness_generation', 1);
  count(a.revision, 'revision');
  count(a.seq, 'seq');
  bytes(a.key_log_head, 32, 'key_log_head');
  bytes(a.audit_head, 32, 'audit_head');
  count(a.issued_at, 'issued_at');
  nullableBytes(a.request_nonce, 16, 'request_nonce');
  for (const r of list(a.env_roots, 'env_roots')) {
    const o = record(r, ['env', 'size', 'root'], 'env_root');
    text(o.env, 'env');
    count(o.size, 'size');
    bytes(o.root, 32, 'root');
  }
}

export function signAttestation(
  secretKey: Uint8Array,
  attestation: Attestation
): SignedAttestation {
  return {
    attestation,
    signature: signObject(
      secretKey,
      'attestation',
      attestationObject(attestation)
    ),
  };
}

/**
 * Verifies a witness attestation: the pinned key for its generation (no
 * generation below `minGeneration`), the client's scope, freshness (at most
 * 10 minutes old), the client's revision and sequence floors, and the
 * client's request nonce when one was sent.
 */
export function verifyAttestation(
  signed: unknown,
  options: {
    readonly scope: VaultScope;
    readonly witnessKeys: ReadonlyMap<number, Uint8Array>;
    readonly minGeneration: number;
    readonly now: number;
    readonly floorSeq: number;
    readonly floorRevision: number;
    readonly expectedNonce?: Uint8Array;
  }
): Attestation {
  assertShape(signed);
  const a = signed.attestation;
  if (a.witness_generation < options.minGeneration)
    fail('Retired witness generation');
  const key = options.witnessKeys.get(a.witness_generation);
  if (!key) fail('Unknown witness generation');
  assertSignature(key, 'attestation', attestationObject(a), signed.signature);
  if (
    a.deployment !== options.scope.deployment ||
    !equalBytes(a.vault_id, options.scope.vault_id)
  ) {
    fail('Attestation for another vault');
  }
  if (
    a.issued_at > options.now + MAX_CLOCK_SKEW_SECONDS ||
    a.issued_at < options.now - MAX_ATTESTATION_AGE_SECONDS
  ) {
    fail('Stale attestation');
  }
  if (a.seq < options.floorSeq || a.revision < options.floorRevision)
    fail('Attestation is behind the client floor');
  if (
    options.expectedNonce &&
    !(a.request_nonce && equalBytes(a.request_nonce, options.expectedNonce))
  ) {
    fail('Attestation does not answer this request');
  }
  const envs = a.env_roots.map((r) => r.env);
  if (new Set(envs).size !== envs.length) fail('Duplicate environment root');
  return a;
}

/** The attestation must name exactly the key-log head the client verified. */
export function assertMatchesKeyLog(a: Attestation, state: KeyLogState): void {
  if (a.seq !== state.headSeq || !equalBytes(a.key_log_head, state.headHash)) {
    fail('Attestation does not match the verified key log');
  }
}

/**
 * Accepts a value only if this signed record is its variable's attested
 * latest version. The leaf is computed from the record, so a superseded
 * version fails, and a tombstone is never accepted as a value.
 */
export function assertLatestRecord(
  a: Attestation,
  signed: SignedRecord,
  proof: { readonly index: number; readonly path: readonly Uint8Array[] }
): void {
  const wrapper = record(signed, ['record', 'signature'], 'signed record');
  validateRecord(wrapper.record);
  bytes(wrapper.signature, 64, 'signature');
  const r = signed.record;
  if (r.deployment !== a.deployment || !equalBytes(r.vault_id, a.vault_id))
    fail('Record for another vault');
  if (r.cipher === 'tombstone') fail('Variable is deleted');
  const root = a.env_roots.find((x) => x.env === r.env);
  if (!root) fail('Environment not attested');
  const leaf = snapshotLeafHash(a, {
    env: r.env,
    variable_id: r.variable_id,
    head: recordHash(signed),
  });
  if (!verifyInclusion(proof.index, root.size, leaf, proof.path, root.root)) {
    fail('Value is not the attested latest version');
  }
}
