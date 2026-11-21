import {
  type EntryPayload,
  type EpochDescriptor,
  entryHash,
  equalBytes,
  type KeyLogState,
  MAX_PROVENANCE_DEPTH,
  recordHash,
  type SignedEntry,
  type SignedRecord,
  snapshotLeafHash,
  toHex,
  validateRecord,
  VaultCryptoError,
  verifyAppend,
  verifyKeyLog,
} from '@tuturuuu/vault-crypto';
import { blob, encode, type SqlRunner } from './store';
import { CAPS, type VaultState } from './vault-state';

export type AppendRequest = {
  readonly challenge: Uint8Array;
  readonly base: {
    readonly witness_generation: number;
    readonly seq: number;
    readonly key_log_head: Uint8Array;
  };
  readonly entry: SignedEntry | null;
  readonly records: readonly SignedRecord[];
};

export type AppendResult =
  | {
      readonly ok: true;
      readonly revision: number;
      readonly seq: number;
      readonly key_log_head: Uint8Array;
      readonly payload_hashes: Uint8Array[];
    }
  | {
      readonly ok: false;
      readonly error: 'challenge_invalid' | 'stale_head' | 'rejected' | 'limit';
      readonly message: string;
    };

/** Wrap digests an epoch descriptor authorises, including its history wraps. */
function descriptorPayloads(d: EpochDescriptor): Uint8Array[] {
  const out = d.wraps.map((w) => w.digest);
  if (d.history) out.push(d.history.normal, d.history.sensitive);
  return out;
}

function entryPayloads(p: EntryPayload): Uint8Array[] {
  switch (p.kind) {
    case 'epoch':
      return descriptorPayloads(p.descriptor);
    case 'wrap_addition':
      return p.wraps.map((w) => w.digest);
    default:
      return p.next_epochs.flatMap(descriptorPayloads);
  }
}

/**
 * Hashes a publisher may promote from staging once this transition commits:
 * ciphertext hashes of the records and wrap digests the entry authorises.
 */
export function payloadHashes(
  entry: SignedEntry | null,
  records: readonly SignedRecord[]
): Uint8Array[] {
  const all = [
    ...(entry ? entryPayloads(entry.body.payload) : []),
    ...records.flatMap((r) =>
      r.record.ciphertext_hash ? [r.record.ciphertext_hash] : []
    ),
  ];
  const seen = new Set<string>();
  return all.filter((h) => {
    const k = toHex(h);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function ancestryOf(
  vault: VaultState,
  signed: SignedRecord
): Map<string, SignedRecord> {
  const ancestry = new Map<string, SignedRecord>();
  let source = signed.record.source;
  for (let depth = 0; source && depth < MAX_PROVENANCE_DEPTH; depth++) {
    const original = vault.recordByHash(source.record_hash);
    if (!original) break;
    ancestry.set(toHex(source.record_hash), original);
    source = original.record.source;
  }
  return ancestry;
}

const reject = (message: string): AppendResult => ({
  ok: false,
  error: 'rejected',
  message,
});

/**
 * Validates and commits one transition. Runs inside the caller's
 * transaction and never throws for a rejected transition, so the consumed
 * challenge commits even when the transition does not.
 */
export function appendTransition(
  sql: SqlRunner,
  vault: VaultState,
  request: AppendRequest,
  now: number
): AppendResult {
  const found = sql
    .exec(
      'SELECT expires_at FROM challenges WHERE nonce = ?',
      blob(request.challenge)
    )
    .toArray()[0];
  sql
    .exec('DELETE FROM challenges WHERE nonce = ?', blob(request.challenge))
    .toArray();
  if (!found || Number(found.expires_at) <= now) {
    return {
      ok: false,
      error: 'challenge_invalid',
      message: 'Unknown or expired challenge',
    };
  }

  const current = vault.keyLog();
  const { base } = request;
  if (
    base.witness_generation !== vault.generation() ||
    base.seq !== current.state.headSeq ||
    !equalBytes(base.key_log_head, current.state.headHash)
  ) {
    return {
      ok: false,
      error: 'stale_head',
      message: 'Submission does not name the current head',
    };
  }
  if (!request.entry && request.records.length === 0)
    return reject('Empty transition');
  if (request.records.length > CAPS.recordsPerTransition)
    return { ok: false, error: 'limit', message: 'Too many records' };

  let state: KeyLogState = current.state;
  let entries = current.entries;
  try {
    if (request.entry) {
      if (current.entries.length >= CAPS.keyLogEntries)
        return { ok: false, error: 'limit', message: 'Key log is full' };
      entries = [...current.entries, request.entry];
      state = verifyKeyLog(vault.genesis(), entries, {
        deployment: vault.deployment() as string,
        vaultId: vault.vaultId(),
      });
      if (state.environments().length > CAPS.environments)
        return { ok: false, error: 'limit', message: 'Too many environments' };
    }
    const touched = new Set<string>();
    const newVariables = new Map<string, number>();
    for (const signed of request.records) {
      if (
        signed === null ||
        typeof signed !== 'object' ||
        !('record' in signed)
      )
        return reject('Malformed record');
      validateRecord(signed.record);
      const r = signed.record;
      const key = `${r.env}\u0000${r.variable_id}`;
      if (touched.has(key)) return reject('Variable named twice');
      touched.add(key);
      const head = vault.head(r.env, r.variable_id);
      verifyAppend(signed, state, head, ancestryOf(vault, signed));
      if (!head) newVariables.set(r.env, (newVariables.get(r.env) ?? 0) + 1);
    }
    for (const [env, added] of newVariables) {
      if (vault.countVariables(env) + added > CAPS.variablesPerEnv)
        return { ok: false, error: 'limit', message: 'Too many variables' };
    }
    if (vault.countRecords() + request.records.length > CAPS.records)
      return { ok: false, error: 'limit', message: 'Record storage is full' };
  } catch (error) {
    if (error instanceof VaultCryptoError) return reject(error.message);
    throw error;
  }

  const revision = vault.revision() + 1;
  const scope = {
    deployment: vault.deployment() as string,
    vault_id: vault.vaultId(),
  };
  if (request.entry) {
    sql
      .exec(
        'INSERT INTO entries (seq, hash, signed) VALUES (?, ?, ?)',
        request.entry.body.seq,
        blob(entryHash(request.entry)),
        encode(request.entry)
      )
      .toArray();
  }
  const recordHashes: Uint8Array[] = [];
  for (const signed of request.records) {
    const r = signed.record;
    const hash = recordHash(signed);
    recordHashes.push(hash);
    sql
      .exec(
        'INSERT INTO records (hash, env, variable_id, version, signed, revision) VALUES (?, ?, ?, ?, ?, ?)',
        blob(hash),
        r.env,
        r.variable_id,
        r.version,
        encode(signed),
        revision
      )
      .toArray();
    const leaf = snapshotLeafHash(scope, {
      env: r.env,
      variable_id: r.variable_id,
      head: hash,
    });
    sql
      .exec(
        'INSERT INTO heads (env, variable_id, hash, leaf) VALUES (?, ?, ?, ?) ON CONFLICT (env, variable_id) DO UPDATE SET hash = excluded.hash, leaf = excluded.leaf',
        r.env,
        r.variable_id,
        blob(hash),
        blob(leaf)
      )
      .toArray();
  }
  const payload_hashes = payloadHashes(request.entry, request.records);
  sql
    .exec(
      'INSERT INTO transitions (revision, body) VALUES (?, ?)',
      revision,
      encode({
        revision,
        entry_seq: request.entry ? request.entry.body.seq : null,
        record_hashes: recordHashes,
        payload_hashes,
        committed_at: Math.floor(now / 1000),
      })
    )
    .toArray();
  vault.meta.setNum('revision', revision);
  vault.remember(
    { state, entries },
    request.records.map((r) => r.record.env)
  );
  return {
    ok: true,
    revision,
    seq: state.headSeq,
    key_log_head: state.headHash,
    payload_hashes,
  };
}
