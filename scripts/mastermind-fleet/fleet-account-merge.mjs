// The fleet account rule: remaining percent is taken once per provider account
// and window, from the newest eligible reading across hosts and aliases; lane
// counts add across hosts. This module is pure and dependency-free so the
// installed publisher can run it. Input contract and failure semantics:
// apps/docs/platform/features/mobile-mastermind.mdx#fleet-account-view

/**
 * The oldest eligible T3 `usageLimits` reading. It equals agent-quota's
 * `PROVIDER_USAGE_SNAPSHOT_MAX_AGE_MS`, which no provider TTL undercuts.
 */
export const FLEET_READING_MAX_AGE_MS = 5 * 60_000;
export const FLEET_MAX_HOSTS = 64;
export const FLEET_MAX_ROWS = 64;
export const FLEET_MAX_READINGS = 32;
const MAX_ID = 128;
const MAX_SCOPE_IDS = 128;

const HOST = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const PROVIDER = /^[a-z0-9][a-z0-9._-]{0,47}$/i;
const ACCOUNT_KEY = /^(?:acct|unidentified)-[a-f0-9]{32}$/;
const ZONED_TIME =
  /^(\d{4}-\d{2}-\d{2})T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?(?:Z|[+-](?:[01]\d|2[0-3]):?[0-5]\d)$/;
const UNSTARTED_ANTIGRAVITY = /^(?:gemini|3p)-(?:weekly|5h)$/;
const KINDS = new Set(['session', 'weekly', 'monthly', 'other', 'unknown']);

const KEYS = {
  input: ['v', 'coverage', 'hosts'],
  host: ['host', 'read', 'lanes', 'accounts'],
  account: ['accountKey', 'provider', 'instanceId', 'activeLanes', 'readings'],
  reading: [
    'windowId',
    'kind',
    'scope',
    'usedPercent',
    'resetsAt',
    'observedAt',
    'authoritative',
  ],
  scope: ['modelIds', 'providerIds'],
};

/** Milliseconds for a real timestamp with an explicit timezone, else null. */
export function zonedTime(value) {
  if (typeof value !== 'string') return null;
  const day = ZONED_TIME.exec(value)?.[1];
  if (!day) return null;
  const midnight = new Date(`${day}T00:00:00.000Z`);
  // Date.parse rolls an impossible day such as 30 February into the next month.
  if (
    !Number.isFinite(midnight.getTime()) ||
    midnight.toISOString().slice(0, 10) !== day
  )
    return null;
  const at = Date.parse(value);
  return Number.isFinite(at) ? at : null;
}

function hasCurrentReset(reading, now) {
  const { resetsAt, usedPercent, kind, windowId } = reading;
  // A session window that has not started carries no reset yet.
  if (resetsAt === undefined || resetsAt === null || resetsAt === '')
    return usedPercent === 0 && kind === 'session';
  const reset = zonedTime(resetsAt);
  if (reset === null) return false;
  if (reset === 0 && usedPercent === 0 && UNSTARTED_ANTIGRAVITY.test(windowId))
    return true;
  return reset > now.getTime();
}

/**
 * Whether a reading may supply the percentage: authoritative, a finite usage
 * in [0, 100], observed no later than `now` (no future skew) and within the
 * maximum age, and not past its reset.
 */
export function readingIsEligible(reading, now) {
  const { usedPercent } = reading;
  const observed = zonedTime(reading.observedAt);
  return (
    reading.authoritative === true &&
    Number.isFinite(usedPercent) &&
    usedPercent >= 0 &&
    usedPercent <= 100 &&
    observed !== null &&
    observed <= now.getTime() &&
    now.getTime() - observed <= FLEET_READING_MAX_AGE_MS &&
    hasCurrentReset(reading, now)
  );
}

const sortedIds = (ids) => [...new Set(ids ?? [])].sort();

/** One spelling per scope: key order, list order and repeats do not matter. */
export function normalizeScope(scope) {
  return {
    modelIds: sortedIds(scope?.modelIds),
    providerIds: sortedIds(scope?.providerIds),
  };
}

function windowKey(reading) {
  const { modelIds, providerIds } = normalizeScope(reading.scope);
  return JSON.stringify([
    reading.windowId,
    reading.kind,
    modelIds,
    providerIds,
  ]);
}

const compareText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Orders eligible candidates, best first: newest observation, then the higher
 * usage, then the later reset. Host and instance id make the choice
 * independent of input order.
 */
function compareCandidates(a, b) {
  return (
    zonedTime(b.reading.observedAt) - zonedTime(a.reading.observedAt) ||
    b.reading.usedPercent - a.reading.usedPercent ||
    (zonedTime(b.reading.resetsAt) ?? 0) -
      (zonedTime(a.reading.resetsAt) ?? 0) ||
    compareText(a.host, b.host) ||
    compareText(a.instanceId, b.instanceId)
  );
}

function check(condition) {
  if (!condition) throw new Error('fleet_input_invalid');
}

/** A plain object carrying only contract fields, so nothing else rides along. */
function checkShape(value, keys) {
  check(value !== null && typeof value === 'object' && !Array.isArray(value));
  check(Object.keys(value).every((key) => keys.includes(key)));
}

const isId = (value) =>
  typeof value === 'string' && value.length > 0 && value.length <= MAX_ID;

function checkList(value, max) {
  check(Array.isArray(value) && value.length <= max);
}

function checkReading(reading) {
  checkShape(reading, KEYS.reading);
  check(isId(reading.windowId) && KINDS.has(reading.kind));
  check(typeof reading.authoritative === 'boolean');
  if (reading.scope === undefined) return;
  checkShape(reading.scope, KEYS.scope);
  for (const ids of Object.values(reading.scope)) {
    checkList(ids, MAX_SCOPE_IDS);
    check(ids.every(isId));
  }
}

/**
 * Throws `fleet_input_invalid` unless `input` follows the private contract.
 * Percentages and times are not contract fields to reject: a bad value only
 * makes its reading ineligible.
 */
export function validateFleetInput(input) {
  checkShape(input, KEYS.input);
  check(input.v === 1 && ['complete', 'partial'].includes(input.coverage));
  checkList(input.hosts, FLEET_MAX_HOSTS);
  const hosts = new Set();
  const unidentified = new Set();
  for (const host of input.hosts) {
    checkShape(host, KEYS.host);
    check(typeof host.host === 'string' && HOST.test(host.host));
    check(!hosts.has(host.host));
    hosts.add(host.host);
    check(['ok', 'failed'].includes(host.read));
    check(['counted', 'unknown'].includes(host.lanes));
    checkList(host.accounts, FLEET_MAX_ROWS);
    if (host.read === 'failed')
      check(host.lanes === 'unknown' && host.accounts.length === 0);
    const instances = new Set();
    for (const account of host.accounts) {
      checkShape(account, KEYS.account);
      check(PROVIDER.test(account.provider ?? ''));
      check(ACCOUNT_KEY.test(account.accountKey ?? ''));
      check(isId(account.instanceId) && !instances.has(account.instanceId));
      instances.add(account.instanceId);
      // An unidentified key stands for one host instance and never merges.
      if (account.accountKey.startsWith('unidentified-')) {
        check(!unidentified.has(account.accountKey));
        unidentified.add(account.accountKey);
      }
      check(
        host.lanes === 'counted'
          ? Number.isSafeInteger(account.activeLanes) &&
              account.activeLanes >= 0
          : account.activeLanes === 'unknown'
      );
      checkList(account.readings, FLEET_MAX_READINGS);
      account.readings.forEach(checkReading);
    }
  }
}

function mergeWindows(members, now) {
  const windows = new Map();
  for (const { host, account } of members)
    for (const reading of account.readings) {
      const key = windowKey(reading);
      const entry = windows.get(key) ?? { reading, eligible: [] };
      if (readingIsEligible(reading, now))
        entry.eligible.push({
          host,
          instanceId: account.instanceId,
          reading,
        });
      windows.set(key, entry);
    }
  return [...windows]
    .sort(([a], [b]) => compareText(a, b))
    .map(([, { reading, eligible }]) => {
      const best = eligible.sort(compareCandidates)[0];
      return {
        windowId: reading.windowId,
        kind: reading.kind,
        scope: normalizeScope(reading.scope),
        fresh: Boolean(best),
        // An ineligible value is withheld, so no consumer can act on it.
        remainingPercent: best ? 100 - best.reading.usedPercent : null,
        resetsAt: best?.reading.resetsAt || null,
        observedAt: best?.reading.observedAt ?? null,
        source: best ? { host: best.host, instanceId: best.instanceId } : null,
      };
    });
}

function sumLanes(counts) {
  let total = 0;
  for (const count of counts) {
    if (count === 'unknown') return 'unknown';
    total += count;
    if (!Number.isSafeInteger(total)) return 'unknown';
  }
  return total;
}

function mergeAccount(members, { countable, now }) {
  const { accountKey, provider } = members[0].account;
  const windows = mergeWindows(members, now);
  const usable = windows.filter((window) => window.fresh);
  const rowsByHost = new Map();
  for (const { host, account } of members)
    rowsByHost.set(host, [
      ...(rowsByHost.get(host) ?? []),
      account.activeLanes,
    ]);
  const lanesByHost = [...rowsByHost]
    .sort(([a], [b]) => compareText(a, b))
    .map(([host, counts]) => [host, sumLanes(counts)]);
  return {
    accountKey,
    provider,
    identity: accountKey.startsWith('acct-') ? 'provider' : 'unestablished',
    instances: members
      .map(({ host, account }) => ({ host, instanceId: account.instanceId }))
      .sort(
        (a, b) =>
          compareText(a.host, b.host) || compareText(a.instanceId, b.instanceId)
      ),
    hosts: lanesByHost.map(([host]) => host),
    windows,
    /** The tightest eligible window, model-scoped windows included. */
    remainingPercent: usable.length
      ? Math.min(...usable.map((window) => window.remainingPercent))
      : null,
    /** True only when every window has an eligible reading. */
    fresh: windows.length > 0 && usable.length === windows.length,
    // A host that could not count may run lanes on any account, listed or not.
    activeCount: countable
      ? sumLanes(lanesByHost.map(([, count]) => count))
      : 'unknown',
    lanesByHost: Object.fromEntries(lanesByHost),
  };
}

/** Merges a validated private input into one entry per provider account. */
export function mergeFleetAccounts(input, now = new Date()) {
  validateFleetInput(input);
  // A failed read always carries unknown lanes (validated above).
  const countable =
    input.coverage === 'complete' &&
    input.hosts.every((host) => host.lanes === 'counted');
  const groups = new Map();
  for (const { host, accounts } of input.hosts)
    for (const account of accounts) {
      // Equal keys under different providers are different accounts.
      const key = JSON.stringify([account.provider, account.accountKey]);
      groups.set(key, [...(groups.get(key) ?? []), { host, account }]);
    }
  return {
    v: 1,
    generatedAt: now.toISOString(),
    coverage: input.coverage,
    hosts: input.hosts.map(({ host, read, lanes }) => ({ host, read, lanes })),
    accounts: [...groups]
      .sort(([a], [b]) => compareText(a, b))
      .map(([, members]) => mergeAccount(members, { countable, now })),
  };
}
