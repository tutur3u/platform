import type {
  AbuseGuardFamily,
  ParsedGuardRpc,
} from '@tuturuuu/utils/abuse-guard/protocol';
import { type ControlState, familyOpen, recordUsage } from './control-state';
import type { SqlRunner } from './engine';

/** One identity can spend at most 5% of its family's commands in a UTC day. */
export const FAIR_SHARE_DIVISOR = 20;
export const FAIR_DAY_MS = 86_400_000;

export type FairIdentity = NonNullable<ParsedGuardRpc['fairness']>;
export type FairAdmission =
  | { kind: 'open' }
  | { kind: 'stopped' }
  | { kind: 'limited'; keys: string[]; resetAt: number };

export function fairIdentityKeys(
  family: AbuseGuardFamily,
  identity: FairIdentity
) {
  return [
    `${family}:source:${identity.source}`,
    ...(identity.principal
      ? [`${family}:principal:${identity.principal}`]
      : []),
  ];
}

export function ensureFairAdmissionSchema(sql: SqlRunner) {
  sql
    .exec(
      'CREATE TABLE IF NOT EXISTS fair_usage (k TEXT PRIMARY KEY, used INTEGER NOT NULL, exp INTEGER NOT NULL)'
    )
    .toArray();
  sql
    .exec('CREATE INDEX IF NOT EXISTS fair_usage_exp ON fair_usage (exp)')
    .toArray();
}

/** Caller runs this and saves control state in the SAME storage transaction. */
export function admitFairCommands(input: {
  sql: SqlRunner;
  state: ControlState;
  family: AbuseGuardFamily;
  identity: FairIdentity;
  ops: number;
  budget: number;
  now: number;
}): FairAdmission {
  const { sql, state, family, identity, ops, budget, now } = input;
  if (!familyOpen(state, family)) return { kind: 'stopped' };
  const resetAt = (Math.floor(now / FAIR_DAY_MS) + 1) * FAIR_DAY_MS;
  const limit = Math.floor(budget / FAIR_SHARE_DIVISOR);
  const rows = fairIdentityKeys(family, identity).map((key) => {
    const [row] = sql
      .exec('SELECT used FROM fair_usage WHERE k = ? AND exp > ?', key, now)
      .toArray();
    return { key, used: Number(row?.used ?? 0) };
  });
  const denied = rows.filter((row) => row.used + ops > limit);
  // Rejected probes allocate no rows, dedupe entries or family commands.
  if (denied.length)
    return {
      kind: 'limited',
      keys: denied.filter((row) => row.used >= limit).map((row) => row.key),
      resetAt,
    };
  if ((state.families[family]?.used ?? 0) + ops > budget)
    return { kind: 'stopped' };
  sql
    .exec(
      'DELETE FROM fair_usage WHERE k IN (SELECT k FROM fair_usage WHERE exp <= ? LIMIT 64)',
      now
    )
    .toArray();
  for (const row of rows) {
    sql
      .exec(
        'INSERT INTO fair_usage (k, used, exp) VALUES (?, ?, ?) ON CONFLICT (k) DO UPDATE SET used = excluded.used, exp = excluded.exp',
        row.key,
        row.used + ops,
        resetAt
      )
      .toArray();
  }
  recordUsage(state, family, ops, budget, now);
  return { kind: 'open' };
}
