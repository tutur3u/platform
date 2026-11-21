import { equalBytes } from './bytes';
import { contextBytes, type VaultScope } from './context';
import { VaultCryptoError } from './errors';
import type { KeyLogState } from './keylog';
import { leafHash, treeRoot, verifyInclusion } from './merkle';
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

/** Signed by the witness on request, without appending to the log. */
export type Attestation = VaultScope & {
  readonly witness_generation: number;
  readonly seq: number;
  readonly key_log_head: Uint8Array;
  readonly env_roots: readonly EnvRoot[];
  readonly audit_head: Uint8Array;
  readonly issued_at: number;
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
  if (leaf.head.length !== 32)
    throw new VaultCryptoError('invalid_input', 'Invalid head');
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

export function environmentRoot(
  scope: VaultScope,
  leaves: readonly SnapshotLeaf[]
): EnvRoot {
  const sorted = sortLeaves(leaves);
  const env = sorted[0]?.env ?? '';
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
 * Verifies a witness attestation against the pinned witness key for its
 * generation, the client's scope, freshness (at most 10 minutes old) and the
 * client's floor (the highest key-log `seq` it has already verified).
 */
export function verifyAttestation(
  signed: SignedAttestation,
  options: {
    readonly scope: VaultScope;
    readonly witnessKeys: ReadonlyMap<number, Uint8Array>;
    readonly now: number;
    readonly floorSeq: number;
  }
): Attestation {
  const a = signed.attestation;
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
  if (a.seq < options.floorSeq) fail('Attestation is behind the client floor');
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
 * Accepts a value only if its record hash is the variable's current head in
 * the attested environment root, which rejects superseded and tombstoned
 * versions.
 */
export function assertLatest(
  a: Attestation,
  leaf: SnapshotLeaf,
  proof: { readonly index: number; readonly path: readonly Uint8Array[] }
): void {
  const root = a.env_roots.find((r) => r.env === leaf.env);
  if (!root) fail('Environment not attested');
  const ok = verifyInclusion(
    proof.index,
    root.size,
    snapshotLeafHash({ deployment: a.deployment, vault_id: a.vault_id }, leaf),
    proof.path,
    root.root
  );
  if (!ok) fail('Value is not the attested latest version');
}
