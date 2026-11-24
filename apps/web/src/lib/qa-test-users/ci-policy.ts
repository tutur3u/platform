import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { QaCiClaims } from './github-oidc';
import type { CreateQaUsersInput } from './policy';
import type { QaStore, QaUserRow } from './store';

/**
 * Hard caps for the GitHub Actions E2E principal. The staff path keeps the
 * ledger's own limits; these apply on top of them and are never configurable.
 */
export const QA_CI_PURPOSE = 'upskii-e2e';
export const QA_CI_MAX_ACCOUNTS_PER_RUN = 4;
export const QA_CI_MAX_STAFF_PER_RUN = 1;
export const QA_CI_MAX_TTL_SECONDS = 2 * 60 * 60;
export const QA_CI_MAX_RUNS_PER_DAY = 12;
const QA_CI_TIERS: ReadonlySet<string> = new Set(['FREE', 'PRO']);
const DAY_MS = 24 * 60 * 60_000;
/** `qa_test_list_users` returns at most this many of the newest rows. */
const LEDGER_LIST_LIMIT = 500;

export type QaCiOperation =
  | 'list'
  | 'create'
  | 'session'
  | 'delete'
  | 'cleanup';

export interface QaCiRefusal {
  status: 403 | 404 | 429 | 503;
  reason: string;
}

const refuse = (status: QaCiRefusal['status'], reason: string) => ({
  status,
  reason,
});

/** Rows the CI principal may see or act on: its own `upskii-e2e` runs. */
export function isCiOwnedRow(
  row: Pick<QaUserRow, 'operatorUserId' | 'purpose'>,
  operatorId: string
) {
  return row.operatorUserId === operatorId && row.purpose === QA_CI_PURPOSE;
}

/** A run the CI principal owns, with every row it ever held; null when unknown. */
async function ownedRunRows(
  store: Pick<QaStore, 'listUsers'>,
  runId: string,
  operatorId: string
): Promise<QaUserRow[] | QaCiRefusal> {
  const rows = await store.listUsers(runId, true);
  if (rows.length === 0) return refuse(404, 'run_unknown');
  if (!rows.every((row) => isCiOwnedRow(row, operatorId)))
    return refuse(403, 'run_foreign');
  return rows;
}

/**
 * New runs in the last 24 hours, by the earliest account each run created.
 * Ledger rows are never purged, so deleted accounts still count. When the
 * ledger's newest-500 window does not reach back 24 hours the count cannot be
 * proven, and the request is refused rather than under-counted.
 */
async function recentCiRuns(
  store: Pick<QaStore, 'listUsers'>,
  operatorId: string,
  now: number
): Promise<number | QaCiRefusal> {
  const rows = await store.listUsers(null, true);
  const since = now - DAY_MS;
  if (rows.length >= LEDGER_LIST_LIMIT) {
    const oldest = Math.min(...rows.map((row) => Date.parse(row.createdAt)));
    if (!(oldest <= since)) return refuse(429, 'daily_window_unverifiable');
  }
  const firstSeen = new Map<string, number>();
  for (const row of rows) {
    if (!isCiOwnedRow(row, operatorId)) continue;
    const at = Date.parse(row.createdAt);
    firstSeen.set(row.runId, Math.min(firstSeen.get(row.runId) ?? at, at));
  }
  return [...firstSeen.values()].filter((at) => at > since).length;
}

export async function admitCiCreate(
  store: Pick<QaStore, 'listUsers'>,
  operatorId: string,
  input: CreateQaUsersInput,
  now = Date.now()
): Promise<QaCiRefusal | null> {
  if (!QA_CI_TIERS.has(input.tier)) return refuse(403, 'tier');
  if (input.purpose !== undefined && input.purpose !== QA_CI_PURPOSE)
    return refuse(403, 'purpose');
  if (
    input.ttlSeconds !== undefined &&
    input.ttlSeconds > QA_CI_MAX_TTL_SECONDS
  )
    return refuse(403, 'ttl');
  if (input.count > QA_CI_MAX_ACCOUNTS_PER_RUN) return refuse(403, 'count');
  // `staff` applies to every account in the request.
  if (input.staff && input.count > QA_CI_MAX_STAFF_PER_RUN)
    return refuse(403, 'staff');

  if (input.runId) {
    const rows = await ownedRunRows(store, input.runId, operatorId);
    if (!Array.isArray(rows)) return rows;
    // A run made through another path (the same operator's staff session)
    // can live longer than the CI TTL; the CI principal never extends it.
    if (
      rows.some(
        (row) =>
          !(Date.parse(row.expiresAt) <= now + QA_CI_MAX_TTL_SECONDS * 1000)
      )
    )
      return refuse(403, 'ttl');
    // Every account the run ever held counts, as the ledger's own caps do.
    if (rows.length + input.count > QA_CI_MAX_ACCOUNTS_PER_RUN)
      return refuse(403, 'count');
    const staff = rows.filter((row) => row.staff).length;
    if (input.staff && staff + input.count > QA_CI_MAX_STAFF_PER_RUN)
      return refuse(403, 'staff');
    return null;
  }

  if (input.purpose !== QA_CI_PURPOSE) return refuse(403, 'purpose');
  const recent = await recentCiRuns(store, operatorId, now);
  if (typeof recent !== 'number') return recent;
  if (recent >= QA_CI_MAX_RUNS_PER_DAY) return refuse(429, 'daily_runs');
  return null;
}

/**
 * Session and delete targets: the immutable service-owned marker must name
 * this operator and the `upskii-e2e` purpose. The database refuses any later
 * change to `qa_*` keys, so the marker matches the ledger run.
 */
export async function admitCiTarget(
  admin: Pick<TypedSupabaseClient, 'auth'>,
  userId: string,
  operatorId: string
): Promise<QaCiRefusal | null> {
  const { data, error } = await admin.auth.admin
    .getUserById(userId)
    .catch(() => ({ data: { user: null }, error: { status: 503 } }));
  if (error)
    return error.status === 404
      ? refuse(404, 'target_unknown')
      : refuse(503, 'target_lookup');
  const marker = data.user?.app_metadata;
  if (!data.user || data.user.id !== userId)
    return refuse(404, 'target_unknown');
  if (
    marker?.qa_test !== true ||
    marker.qa_owner !== operatorId ||
    marker.qa_purpose !== QA_CI_PURPOSE
  )
    return refuse(403, 'target_foreign');
  return null;
}

/** Only a run the CI principal owns, never the global expired sweep. */
export async function admitCiCleanup(
  store: Pick<QaStore, 'listUsers'>,
  operatorId: string,
  body: { runId: string } | { expired: true }
): Promise<{ userIds: string[] } | QaCiRefusal> {
  if (!('runId' in body)) return refuse(403, 'global_cleanup');
  const rows = await ownedRunRows(store, body.runId, operatorId);
  if (!Array.isArray(rows)) return rows;
  return {
    userIds: rows
      .filter((row) => row.state !== 'deleted')
      .map((row) => row.userId),
  };
}

/** Structured audit line for every CI call. Never the token or credentials. */
export function auditCi(
  operation: QaCiOperation,
  claims: QaCiClaims,
  detail: Record<string, unknown>,
  level: 'info' | 'warn' = 'info'
) {
  console[level]('[qa-ci-operator] call', {
    operation,
    repository: claims.repository,
    githubRunId: claims.runId,
    runAttempt: claims.runAttempt,
    sha: claims.sha,
    eventName: claims.eventName,
    actor: claims.actor,
    ...detail,
  });
}

export function ciRefusalBody(refusal: QaCiRefusal) {
  return {
    error:
      refusal.status === 404
        ? 'Not found'
        : refusal.status === 429
          ? 'QA CI operator limit reached'
          : refusal.status === 503
            ? 'QA test users unavailable'
            : 'Refused by the QA CI operator policy',
    reason: refusal.reason,
  };
}
