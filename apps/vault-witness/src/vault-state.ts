import {
  type EnvRoot,
  type KeyLogState,
  type SignedEntry,
  type SignedGenesis,
  type SignedRecord,
  verifyKeyLog,
  type WitnessHeadView,
} from '@tuturuuu/vault-crypto';
import { asBytes, blob, createMeta, decode, type SqlRunner } from './store';
import { buildLevels, type Levels, levelsRoot } from './tree';

/** Hard caps per vault; each keeps a full key-log replay and one attestation bounded. */
export const CAPS = {
  keyLogEntries: 2048,
  environments: 256,
  variablesPerEnv: 5000,
  records: 200_000,
  recordsPerTransition: 64,
  proofsPerAttest: 64,
  outstandingChallenges: 256,
} as const;

export const SCHEMA = [
  'CREATE TABLE IF NOT EXISTS entries (seq INTEGER PRIMARY KEY, hash BLOB NOT NULL, signed BLOB NOT NULL)',
  'CREATE TABLE IF NOT EXISTS records (hash BLOB PRIMARY KEY, env TEXT NOT NULL, variable_id TEXT NOT NULL, version INTEGER NOT NULL, signed BLOB NOT NULL, revision INTEGER NOT NULL)',
  'CREATE TABLE IF NOT EXISTS heads (env TEXT NOT NULL, variable_id TEXT NOT NULL, hash BLOB NOT NULL, leaf BLOB NOT NULL, PRIMARY KEY (env, variable_id))',
  'CREATE TABLE IF NOT EXISTS transitions (revision INTEGER PRIMARY KEY, body BLOB NOT NULL)',
  'CREATE TABLE IF NOT EXISTS challenges (nonce BLOB PRIMARY KEY, expires_at INTEGER NOT NULL)',
  'CREATE INDEX IF NOT EXISTS challenges_expiry ON challenges (expires_at)',
] as const;

export const ZERO_HASH = new Uint8Array(32);

/**
 * Read access to one vault's witnessed state, with the verified key-log
 * replay and per-environment trees cached in memory. The caches are derived
 * only from committed storage and dropped whenever a write commits or rolls
 * back, so a cold start rebuilds them from storage.
 */
export function createVaultState(sql: SqlRunner) {
  const meta = createMeta(sql);
  let keyLog: { state: KeyLogState; entries: SignedEntry[] } | null = null;
  const trees = new Map<string, { levels: Levels; ids: string[] }>();

  const deployment = () => {
    const b = meta.bytes('deployment');
    return b ? new TextDecoder().decode(b) : null;
  };

  return {
    meta,
    ensure() {
      meta.ensure();
      for (const statement of SCHEMA) sql.exec(statement).toArray();
    },
    invalidate() {
      keyLog = null;
      trees.clear();
    },
    /**
     * Keeps the replay just verified for a committed append and drops the
     * trees it changed. The object calls `invalidate` if the surrounding
     * transaction then fails.
     */
    remember(
      next: { state: KeyLogState; entries: SignedEntry[] },
      envs: Iterable<string>
    ) {
      keyLog = next;
      for (const env of envs) trees.delete(env);
    },
    initialized: () => meta.bytes('vault_id') !== null,
    deployment,
    vaultId: () => meta.bytes('vault_id') as Uint8Array,
    genesis: () => decode<SignedGenesis>(meta.bytes('genesis')),
    revision: () => meta.num('revision') ?? 0,
    generation: () => meta.num('generation'),
    reattest: () => meta.num('reattest') === 1,
    auditHead: () => meta.bytes('audit_head') ?? ZERO_HASH,
    auditCount: () => meta.num('audit_count') ?? 0,

    entries(): SignedEntry[] {
      return sql
        .exec('SELECT signed FROM entries ORDER BY seq')
        .toArray()
        .map((row) => decode<SignedEntry>(row.signed));
    },

    /** The verified key-log state at the head; replayed once per cold start. */
    keyLog(): { state: KeyLogState; entries: SignedEntry[] } {
      if (keyLog) return keyLog;
      const entries = this.entries();
      const state = verifyKeyLog(this.genesis(), entries, {
        deployment: deployment() as string,
        vaultId: this.vaultId(),
      });
      keyLog = { state, entries };
      return keyLog;
    },

    head(env: string, variableId: string): SignedRecord | null {
      const row = sql
        .exec(
          'SELECT r.signed FROM heads h JOIN records r ON r.hash = h.hash WHERE h.env = ? AND h.variable_id = ?',
          env,
          variableId
        )
        .toArray()[0];
      return row ? decode<SignedRecord>(row.signed) : null;
    },

    recordByHash(hash: Uint8Array): SignedRecord | null {
      const row = sql
        .exec('SELECT signed FROM records WHERE hash = ?', blob(hash))
        .toArray()[0];
      return row ? decode<SignedRecord>(row.signed) : null;
    },

    countVariables(env: string): number {
      const row = sql
        .exec('SELECT count(*) AS n FROM heads WHERE env = ?', env)
        .toArray()[0];
      return Number(row?.n ?? 0);
    },

    countRecords(): number {
      const row = sql.exec('SELECT count(*) AS n FROM records').toArray()[0];
      return Number(row?.n ?? 0);
    },

    /** Leaves ordered by `variable_id` in UTF-16 code-unit order, the comparison `sortLeaves` uses. */
    tree(env: string): { levels: Levels; ids: string[] } {
      const cached = trees.get(env);
      if (cached) return cached;
      const rows = sql
        .exec('SELECT variable_id, leaf FROM heads WHERE env = ?', env)
        .toArray()
        .map((row) => ({
          id: String(row.variable_id),
          leaf: asBytes(row.leaf),
        }))
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      const tree = {
        levels: buildLevels(rows.map((r) => r.leaf)),
        ids: rows.map((r) => r.id),
      };
      trees.set(env, tree);
      return tree;
    },

    /** Every environment the key log declares or that holds a variable. */
    envRoots(): EnvRoot[] {
      const fromLog = this.keyLog().state.environments();
      const fromHeads = sql
        .exec('SELECT DISTINCT env FROM heads')
        .toArray()
        .map((row) => String(row.env));
      return [...new Set([...fromLog, ...fromHeads])].sort().map((env) => {
        const { levels, ids } = this.tree(env);
        return { env, size: ids.length, root: levelsRoot(levels) };
      });
    },

    view(): WitnessHeadView {
      const { state } = this.keyLog();
      return {
        deployment: deployment() as string,
        vault_id: this.vaultId(),
        witness_generation: this.generation() ?? 0,
        revision: this.revision(),
        seq: state.headSeq,
        key_log_head: state.headHash,
        env_roots: this.envRoots(),
        audit_head: this.auditHead(),
      };
    },
  };
}

export type VaultState = ReturnType<typeof createVaultState>;
