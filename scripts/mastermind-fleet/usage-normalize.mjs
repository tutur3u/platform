// Project documented fields from T3 server.getConfig and
// server.getUsageSummary. Never persist either raw response.
import { createHash } from 'node:crypto';
import { fleetText } from './scrub.mjs';

const ACCOUNT_MAX = 32;
const BUCKET_MAX = 384;
const WINDOW_KINDS = ['session', 'weekly', 'monthly'];
// Clients released before monthly windows accept at most two rows.
const WINDOW_MAX = 2;
// A source with no provider store has nothing to count; it does not leave a gap.
const COMPLETE_SOURCE = new Set(['ok', 'missing']);
const ACCOUNT_EMAIL =
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i;
const PLAN_LABEL =
  /^(?:ChatGPT|Claude|Cursor|OpenCode|Grok|Antigravity) [a-z0-9][a-z0-9 ()+-]{0,42}$/i;
const ISO_TIME =
  /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

function isoTime(value) {
  if (
    typeof value !== 'string' ||
    !ISO_TIME.test(value) ||
    !validDay(value.slice(0, 10))
  )
    return null;
  const at = Date.parse(value);
  return Number.isFinite(at) ? new Date(at).toISOString() : null;
}

function validDay(value) {
  if (typeof value !== 'string' || !DAY.test(value)) return false;
  const at = new Date(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(at.getTime()) && at.toISOString().slice(0, 10) === value
  );
}

function safeEmail(value) {
  if (
    typeof value !== 'string' ||
    value.length > 254 ||
    !ACCOUNT_EMAIL.test(value) ||
    value.startsWith('.') ||
    value.includes('..')
  )
    return null;
  return value;
}

function accountId(instanceId) {
  return createHash('sha256').update(instanceId).digest('hex').slice(0, 24);
}

function accountWindows(limits) {
  if (!Array.isArray(limits?.windows)) return [];
  return WINDOW_KINDS.flatMap((kind) => {
    // Model-specific windows cannot establish that the entire account is capped.
    const candidates = limits.windows.filter(
      (row) =>
        row?.kind === kind &&
        !row.modelIds?.length &&
        !row.providerIds?.length &&
        Number.isFinite(row.usedPercent) &&
        row.usedPercent >= 0 &&
        row.usedPercent <= 100
    );
    const highest = candidates
      .map((window) => ({
        usedPercent: window.usedPercent,
        resetsAt: isoTime(window.resetsAt),
      }))
      .sort(
        (a, b) =>
          b.usedPercent - a.usedPercent ||
          (b.resetsAt ? Date.parse(b.resetsAt) : -Number.MAX_VALUE) -
            (a.resetsAt ? Date.parse(a.resetsAt) : -Number.MAX_VALUE)
      )[0];
    return highest
      ? [
          {
            kind,
            usedPercent: highest.usedPercent,
            resetsAt: highest.resetsAt,
          },
        ]
      : [];
  });
}

/** Keeps exhausted windows first, then the shortest, in canonical order. */
function publishedWindows(windows) {
  if (windows.length <= WINDOW_MAX) return windows;
  const rank = (window) => WINDOW_KINDS.indexOf(window.kind);
  return [...windows]
    .sort(
      (a, b) =>
        Number(b.usedPercent >= 100) - Number(a.usedPercent >= 100) ||
        rank(a) - rank(b)
    )
    .slice(0, WINDOW_MAX)
    .sort((a, b) => rank(a) - rank(b));
}

function statusFor(row, windows) {
  const unknown = (reason) => ({ kind: 'unknown', reason });
  if (!row.enabled || !row.installed) return unknown('disabled');
  if (row.auth?.status !== 'authenticated') {
    return unknown(
      row.auth?.status === 'unauthenticated'
        ? 'not_authenticated'
        : 'unavailable'
    );
  }
  const limits = row.usageLimits;
  if (limits?.unavailable?.reason === 'unsupported')
    return unknown('unsupported');
  if (limits?.unavailable) return unknown('unavailable');
  if (limits?.zeroSpendCap) return { kind: 'limited', reason: 'provider' };
  const exhausted = windows.find((window) => window.usedPercent >= 100);
  if (exhausted) return { kind: 'limited', reason: exhausted.kind };
  if (row.availability === 'unavailable') return unknown('unavailable');
  // Signed in, but the provider has not returned an account-wide window.
  if (!windows.length) return unknown('not_reported');
  return { kind: 'available' };
}

function normalizeAccount(row) {
  if (typeof row?.instanceId !== 'string' || !row.instanceId.length)
    return null;
  const provider = fleetText(row.driver, 48);
  if (!provider) return null;
  const authenticated = row.auth?.status === 'authenticated';
  const windows = accountWindows(row.usageLimits);
  return {
    id: accountId(row.instanceId),
    provider,
    instance: fleetText(row.displayName, 64) || provider,
    email: authenticated ? safeEmail(row.auth.email) : null,
    plan:
      authenticated && PLAN_LABEL.test(row.auth.label ?? '')
        ? fleetText(row.auth.label, 48) || null
        : null,
    checkedAt: isoTime(row.usageLimits?.checkedAt),
    status: statusFor(row, windows),
    windows: publishedWindows(windows),
  };
}

export function normalizeT3Quota(config, now) {
  if (!Array.isArray(config?.providers)) {
    return { quota: { kind: 'unavailable' }, accounts: [] };
  }
  const rows = new Map();
  for (const provider of config.providers) {
    const account = normalizeAccount(provider);
    if (account) rows.set(account.id, account);
  }
  return {
    quota: {
      kind:
        rows.size < config.providers.length || rows.size > ACCOUNT_MAX
          ? 'partial'
          : 'complete',
      observedAt: now.toISOString(),
    },
    accounts: [...rows.values()].slice(0, ACCOUNT_MAX),
  };
}

function normalizedBucket(row) {
  const provider = fleetText(row?.provider, 48);
  const model = fleetText(row?.model, 96);
  const {
    uncachedInputTokens,
    cachedInputTokens,
    cacheCreationTokens,
    outputTokens,
  } = row?.totals ?? {};
  const count = (value) => Number.isSafeInteger(value) && value >= 0;
  if (
    !provider ||
    !model ||
    !validDay(row?.day) ||
    ![
      uncachedInputTokens,
      cachedInputTokens,
      cacheCreationTokens,
      outputTokens,
      row.unpricedRecords,
    ].every(count)
  )
    return null;
  return {
    day: row.day,
    provider,
    model,
    // The summary is by provider/model, and a current login cannot identify
    // which account incurred historical usage.
    accountId: null,
    uncachedInputTokens,
    cachedInputTokens,
    cacheCreationTokens,
    outputTokens,
    unpricedRecords: row.unpricedRecords,
    costUsd:
      row.costSource !== 'unpriced' &&
      Number.isFinite(row.costUsd) &&
      row.costUsd >= 0
        ? row.costUsd
        : null,
  };
}

function physicalSourceKey(row, sources) {
  const candidates = sources
    .map((source) => source?.fingerprint)
    .filter((source) => source?.provider === row.provider);
  const source = row.sourcePath
    ? candidates.find((item) => item.resolvedHomePath === row.sourcePath)
    : candidates.length === 1
      ? candidates[0]
      : undefined;
  if (
    typeof source?.physicalSourceId !== 'string' ||
    !source.physicalSourceId ||
    source.physicalSourceId.length > 512
  )
    return null;
  return createHash('sha256')
    .update(JSON.stringify([row.provider, source.physicalSourceId]))
    .digest('hex');
}

export function normalizeT3Accounting(summary, { trackSources = false } = {}) {
  const observedAt = isoTime(summary?.readAt);
  if (
    !observedAt ||
    !Array.isArray(summary?.buckets) ||
    !Array.isArray(summary?.sources)
  ) {
    return { accounting: { kind: 'unavailable' }, buckets: [] };
  }
  const rows = summary.buckets.flatMap((raw) => {
    const bucket = normalizedBucket(raw);
    return bucket ? [{ bucket, raw }] : [];
  });
  rows.sort((a, b) => b.bucket.day.localeCompare(a.bucket.day));
  const selected = rows.slice(0, BUCKET_MAX);
  return {
    accounting: {
      kind:
        rows.length !== summary.buckets.length ||
        rows.length > BUCKET_MAX ||
        !summary.sources.length ||
        // A missing store is a provider that is not installed. A source still
        // refreshing may add records, so its totals are partial.
        summary.sources.some(
          (source) =>
            !COMPLETE_SOURCE.has(source?.status) || source?.refreshing === true
        )
          ? 'partial'
          : 'complete',
      observedAt,
    },
    buckets: selected.map(({ bucket }) => bucket),
    ...(trackSources
      ? {
          bucketSourceIds: selected.map(({ raw }) =>
            physicalSourceKey(raw, summary.sources)
          ),
        }
      : {}),
  };
}
