import { publicEvidenceUrl } from './public-evidence-url.ts';
export const stages = [
  'planned',
  'rolling_out',
  'waiting_for_merge',
  'waiting_for_production_sync',
  'live',
] as const;
export type MigrationStage = (typeof stages)[number];
export const publicProducts = [
  'ai',
  'calendar',
  'chat',
  'contacts',
  'drive',
  'finance',
  'forms',
  'hive',
  'inventory',
  'mail',
  'meet',
  'storefront',
  'tasks',
  'track',
] as const;
export type ProductId = (typeof publicProducts)[number];
export type PullEvidence = {
  url: string;
  scope: 'migration_completion';
  state: 'open' | 'merged' | 'closed';
  headSha: string;
  draft: boolean;
  review: 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' | 'UNKNOWN';
  reviewedHeadSha: string | null;
  observedAt: string;
  requiredChecks: string[];
  checks: {
    name: string;
    headSha: string;
    conclusion: 'SUCCESS' | 'FAILURE' | 'SKIPPED' | 'PENDING' | 'UNKNOWN';
  }[];
  merge: { sha: string; at: string } | null;
};
export type ProductionEvidence = {
  kind: 'production_readback';
  url: string;
  receiptUrl: string;
  deployedSha: string;
  responseSha: string;
  accepted: boolean;
  observedAt: string;
};
export type MigrationEvidence = {
  pr: PullEvidence | null;
  production: ProductionEvidence | null;
};
export const emptyEvidence: MigrationEvidence = { pr: null, production: null };
const DAY = 86_400_000;
export function isSnapshotStale(at: string, now: number) {
  return (
    !Number.isFinite(Date.parse(at)) ||
    now < Date.parse(at) ||
    now - Date.parse(at) > DAY
  );
}
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Require an evidence object');
  return Object.fromEntries(Object.entries(value));
}
export function keys(value: Record<string, unknown>, allowed: string[]) {
  if (
    Object.keys(value).some((key) => !allowed.includes(key)) ||
    allowed.some((key) => !(key in value))
  )
    throw new Error('Unknown or missing evidence field');
}
export function text(value: unknown): string {
  if (typeof value !== 'string' || !value || value.length > 500)
    throw new Error('Invalid evidence string');
  return value;
}
export function sha(value: unknown) {
  const result = text(value);
  if (!/^[a-f0-9]{40}$/.test(result)) throw new Error('Invalid source SHA');
  return result;
}
export function timestamp(value: unknown) {
  const result = text(value);
  if (
    !/^\d{4}-\d{2}-\d{2}T/.test(result) ||
    !Number.isFinite(Date.parse(result))
  )
    throw new Error('Invalid observation time');
  return result;
}
function boolean(value: unknown) {
  if (typeof value !== 'boolean') throw new Error('Invalid evidence boolean');
  return value;
}
function choice<T extends string>(value: unknown, choices: readonly T[]): T {
  for (const candidate of choices) if (candidate === value) return candidate;
  throw new Error('Unknown evidence value');
}
export function immutableUrl(value: unknown) {
  const result = text(value);
  const url = publicEvidenceUrl(result, 'github.com');
  if (!/^\/tutur3u\/platform\/blob\/[a-f0-9]{40}\/.+/.test(url.pathname))
    throw new Error('Require immutable public repository proof');
  return result;
}

function parsePull(value: unknown): PullEvidence | null {
  if (value === null) return null;
  const p = object(value);
  keys(p, [
    'url',
    'scope',
    'state',
    'headSha',
    'draft',
    'review',
    'reviewedHeadSha',
    'observedAt',
    'requiredChecks',
    'checks',
    'merge',
  ]);
  const url = text(p.url);
  publicEvidenceUrl(url, 'github.com');
  if (
    !/^https:\/\/github\.com\/tutur3u\/platform\/pull\/[1-9][0-9]*$/.test(url)
  )
    throw new Error('Require public first-party PR');
  if (
    !Array.isArray(p.requiredChecks) ||
    !Array.isArray(p.checks) ||
    p.requiredChecks.length > 100 ||
    p.checks.length > 100
  )
    throw new Error('Invalid bounded check set');
  const requiredChecks = p.requiredChecks.map(text);
  if (new Set(requiredChecks).size !== requiredChecks.length)
    throw new Error('Duplicate required check');
  const checks = p.checks.map((raw) => {
    const c = object(raw);
    keys(c, ['name', 'headSha', 'conclusion']);
    return {
      name: text(c.name),
      headSha: sha(c.headSha),
      conclusion: choice(c.conclusion, [
        'SUCCESS',
        'FAILURE',
        'SKIPPED',
        'PENDING',
        'UNKNOWN',
      ]),
    };
  });
  if (new Set(checks.map((c) => c.name)).size !== checks.length)
    throw new Error('Duplicate check');
  const m = p.merge === null ? null : object(p.merge);
  if (m) keys(m, ['sha', 'at']);
  const result = {
    url,
    scope: choice(p.scope, ['migration_completion']),
    state: choice(p.state, ['open', 'merged', 'closed']),
    headSha: sha(p.headSha),
    draft: boolean(p.draft),
    review: choice(p.review, [
      'APPROVED',
      'CHANGES_REQUESTED',
      'REVIEW_REQUIRED',
      'UNKNOWN',
    ]),
    reviewedHeadSha: p.reviewedHeadSha === null ? null : sha(p.reviewedHeadSha),
    observedAt: timestamp(p.observedAt),
    requiredChecks,
    checks,
    merge: m ? { sha: sha(m.sha), at: timestamp(m.at) } : null,
  };
  if ((result.state === 'merged') !== (result.merge !== null))
    throw new Error('PR merge identity mismatch');
  if (
    result.merge &&
    Date.parse(result.merge.at) > Date.parse(result.observedAt)
  )
    throw new Error('Merge postdates observation');
  return result;
}
export function parseEvidence(
  value: unknown,
  id: ProductId
): MigrationEvidence {
  const e = object(value);
  keys(e, ['pr', 'production']);
  const pr = parsePull(e.pr);
  let production: ProductionEvidence | null = null;
  if (e.production !== null) {
    const p = object(e.production);
    keys(p, [
      'kind',
      'url',
      'receiptUrl',
      'deployedSha',
      'responseSha',
      'accepted',
      'observedAt',
    ]);
    const url = text(p.url);
    publicEvidenceUrl(url, 'tuturuuu.com');
    if (url !== `https://tuturuuu.com/${id}/`)
      throw new Error('Require named public production URL');
    production = {
      kind: choice(p.kind, ['production_readback']),
      url,
      receiptUrl: immutableUrl(p.receiptUrl),
      deployedSha: sha(p.deployedSha),
      responseSha: sha(p.responseSha),
      accepted: boolean(p.accepted),
      observedAt: timestamp(p.observedAt),
    };
    if (
      !pr?.merge ||
      production.deployedSha !== pr.merge.sha ||
      production.responseSha !== production.deployedSha ||
      Date.parse(production.observedAt) < Date.parse(pr.merge.at)
    )
      throw new Error('Unsupported live claim');
  }
  return { pr, production };
}
export function deriveStage(
  workInSource: boolean,
  evidence: MigrationEvidence,
  observedAt: string,
  mergeIncluded: boolean
): MigrationStage {
  const now = Date.parse(observedAt);
  const { pr, production } = evidence;
  if (pr?.state === 'merged' && mergeIncluded) {
    if (production?.accepted && !isSnapshotStale(production.observedAt, now))
      return 'live';
    return 'waiting_for_production_sync';
  }
  if (pr?.state === 'open' && !isSnapshotStale(pr.observedAt, now)) {
    const green =
      pr.requiredChecks.length > 0 &&
      pr.checks.length > 0 &&
      pr.checks.every(
        (check) =>
          check.headSha === pr.headSha && check.conclusion === 'SUCCESS'
      ) &&
      pr.requiredChecks.every((name) =>
        pr.checks.some((check) => check.name === name)
      );
    if (
      !pr.draft &&
      pr.review === 'APPROVED' &&
      pr.reviewedHeadSha === pr.headSha &&
      green
    )
      return 'waiting_for_merge';
    return 'rolling_out';
  }
  return workInSource ? 'rolling_out' : 'planned';
}
export function parseEvidenceInputs(value: unknown) {
  const root = object(value);
  keys(root, ['schemaVersion', 'apps']);
  if (root.schemaVersion !== 1) throw new Error('Unsupported evidence schema');
  const apps = object(root.apps);
  return Object.entries(apps).map(([id, evidence]) => ({
    id: choice(id, publicProducts),
    evidence: parseEvidence(evidence, choice(id, publicProducts)),
  }));
}
