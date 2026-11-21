// Project documented fields from T3 server.getConfig and
// server.getUsageSummary. Never persist either raw response.
import { createHash } from 'node:crypto';
import { fleetText } from './scrub.mjs';

const ACCOUNT_MAX = 32;
const BUCKET_MAX = 384;
const WINDOW_KINDS = ['session', 'weekly'];
const ACCOUNT_EMAIL =
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i;
const PLAN_LABEL =
  /^(?:ChatGPT|Claude|Cursor|OpenCode|Grok|Antigravity) [a-z0-9][a-z0-9 ()+-]{0,42}$/i;
const ISO_TIME =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

function isoTime(value) {
  if (typeof value !== 'string' || !ISO_TIME.test(value)) return null;
  const at = Date.parse(value);
  return Number.isFinite(at) ? new Date(at).toISOString() : null;
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

function normalizeWindows(limits) {
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
    const highest = candidates.sort(
      (a, b) =>
        b.usedPercent - a.usedPercent ||
        (Date.parse(b.resetsAt) || 0) - (Date.parse(a.resetsAt) || 0)
    )[0];
    return highest
      ? [
          {
            kind,
            usedPercent: highest.usedPercent,
            resetsAt: isoTime(highest.resetsAt),
          },
        ]
      : [];
  });
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
  if (row.availability === 'unavailable' || !windows.length) {
    return unknown('unavailable');
  }
  return { kind: 'available' };
}

function normalizeAccount(row) {
  if (typeof row?.instanceId !== 'string' || !row.instanceId.length)
    return null;
  const provider = fleetText(row.driver, 48);
  if (!provider) return null;
  const authenticated = row.auth?.status === 'authenticated';
  const windows = normalizeWindows(row.usageLimits);
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
    windows,
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
    !DAY.test(row?.day ?? '') ||
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

export function normalizeT3Accounting(summary) {
  const observedAt = isoTime(summary?.readAt);
  if (
    !observedAt ||
    !Array.isArray(summary?.buckets) ||
    !Array.isArray(summary?.sources)
  ) {
    return { accounting: { kind: 'unavailable' }, buckets: [] };
  }
  const buckets = summary.buckets.map(normalizedBucket).filter(Boolean);
  buckets.sort((a, b) => b.day.localeCompare(a.day));
  return {
    accounting: {
      kind:
        buckets.length !== summary.buckets.length ||
        buckets.length > BUCKET_MAX ||
        !summary.sources.length ||
        summary.sources.some(
          (source) => source?.status !== 'ok' || source.refreshing
        )
          ? 'partial'
          : 'complete',
      observedAt,
    },
    buckets: buckets.slice(0, BUCKET_MAX),
  };
}
