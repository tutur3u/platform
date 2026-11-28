import { createHash, randomUUID } from 'node:crypto';
import { link, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { writeFileAtomically } from './atomic-file';

// A per-machine read-through cache for GitHub REST reads shared by every agent
// lane on the host. One upstream request per key at a time (in-process promise
// map plus a cross-process O_EXCL lock file), ETag revalidation so unchanged
// answers return free 304s, per-resource TTLs, and a shared rate ledger that
// stops upstream calls below a reserve floor and serves stale data instead.

export interface CacheEntry {
  key: string;
  body: unknown;
  etag?: string;
  fetchedAt: number;
  ttlMs: number;
}

export interface RateLedger {
  remaining?: number;
  limit?: number;
  /** Epoch ms at which the core bucket resets. */
  resetAt?: number;
  /** Epoch ms before which no budgeted upstream call may run. */
  blockedUntil?: number;
  observedAt?: number;
}

export interface UpstreamResponse {
  status: number;
  headers: Headers;
  body?: unknown;
}

export type Upstream = (
  url: string,
  init: { etag?: string }
) => Promise<UpstreamResponse>;

export type CacheSource = 'cache' | 'revalidated' | 'fetched' | 'stale';

export interface CachedResult<T = unknown> {
  body: T;
  source: CacheSource;
  stale: boolean;
  fetchedAt: number;
  /** Why a stale entry was served instead of fresh data. */
  staleReason?: string;
  resetAt?: number;
}

export class RateBudgetError extends Error {
  readonly exitCode = 75;
  constructor(
    message: string,
    readonly resetAt?: number
  ) {
    super(message);
    this.name = 'RateBudgetError';
  }
}

export interface CiCacheOptions {
  dir?: string;
  upstream: Upstream;
  now?: () => number;
  /** Minimum remaining core requests reserved for humans/releases. */
  floor?: number;
  lockStaleMs?: number;
  lockWaitMs?: number;
  lockPollMs?: number;
  sleep?: (ms: number) => Promise<void>;
  isAlive?: (pid: number) => boolean;
}

export interface GetOptions {
  /** TTL for the stored body; receives the (new or revalidated) body. */
  ttl: (body: unknown) => number;
  /** Endpoint does not count against the rate limit (e.g. /rate_limit). */
  free?: boolean;
}

export const DEFAULT_RATE_FLOOR = 300;

export function ciCacheHome(env: NodeJS.ProcessEnv = process.env) {
  return resolve(
    env.TTR_CI_CACHE_HOME || join(homedir(), '.tuturuuu', 'ci-cache')
  );
}

export function rateFloor(env: NodeJS.ProcessEnv = process.env) {
  const raw = env.TTR_CI_RATE_FLOOR;
  const value = raw === undefined ? Number.NaN : Number(raw);
  return Number.isInteger(value) && value >= 0 ? value : DEFAULT_RATE_FLOOR;
}

function processAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

async function readJson<T>(path: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T;
  } catch {
    return undefined;
  }
}

function headerNumber(headers: Headers, name: string) {
  const raw = headers.get(name);
  if (raw === null || raw.trim() === '') return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

export function createCiCache(options: CiCacheOptions) {
  const dir = resolve(options.dir ?? ciCacheHome());
  const now = options.now ?? Date.now;
  const floor = options.floor ?? rateFloor();
  const lockStaleMs = options.lockStaleMs ?? 30_000;
  const lockWaitMs = options.lockWaitMs ?? 45_000;
  const lockPollMs = options.lockPollMs ?? 250;
  const sleep =
    options.sleep ??
    ((ms: number) => new Promise<void>((done) => setTimeout(done, ms)));
  const isAlive = options.isAlive ?? processAlive;
  const inflight = new Map<string, Promise<CachedResult>>();
  const ledgerPath = join(dir, 'rate.json');
  const ledgerKey = 'internal:rate-ledger';

  const ensureDir = () => mkdir(dir, { recursive: true, mode: 0o700 });
  const hash = (key: string) =>
    createHash('sha256').update(key).digest('hex').slice(0, 40);
  const entryPath = (key: string) => join(dir, `${hash(key)}.json`);
  const lockPath = (key: string) => join(dir, `${hash(key)}.lock`);

  const readEntry = async (key: string) => {
    const entry = await readJson<CacheEntry>(entryPath(key));
    return entry && entry.key === key ? entry : undefined;
  };
  const writeEntry = (entry: CacheEntry) =>
    writeFileAtomically(entryPath(entry.key), JSON.stringify(entry), {
      mode: 0o600,
    });
  const fresh = (entry: CacheEntry) => now() - entry.fetchedAt < entry.ttlMs;

  const readLedger = async () => (await readJson<RateLedger>(ledgerPath)) ?? {};

  const recordLedger = async (update: RateLedger) => {
    const previous = await readLedger();
    const sameWindow =
      update.resetAt === undefined || previous.resetAt === update.resetAt;
    const next: RateLedger = {
      ...previous,
      remaining:
        update.remaining === undefined
          ? previous.remaining
          : sameWindow && previous.remaining !== undefined
            ? Math.min(previous.remaining, update.remaining)
            : update.remaining,
      limit: update.limit ?? previous.limit,
      resetAt: update.resetAt ?? previous.resetAt,
      observedAt: now(),
    };
    // A block only ever extends until it passes; a fresh header never lifts it.
    const blocks = [previous.blockedUntil, update.blockedUntil].filter(
      (value): value is number => typeof value === 'number' && value > now()
    );
    next.blockedUntil = blocks.length ? Math.max(...blocks) : undefined;
    await writeFileAtomically(ledgerPath, JSON.stringify(next), {
      mode: 0o600,
    });
    return next;
  };

  const recordHeaders = (headers: Headers) => {
    const remaining = headerNumber(headers, 'x-ratelimit-remaining');
    const limit = headerNumber(headers, 'x-ratelimit-limit');
    const reset = headerNumber(headers, 'x-ratelimit-reset');
    if (remaining === undefined && reset === undefined) return undefined;
    return recordLedger({
      remaining,
      limit,
      resetAt: reset === undefined ? undefined : reset * 1000,
    });
  };

  /** 'open' | 'conditional-only' | 'blocked' for a budgeted upstream call. */
  const budget = (ledger: RateLedger) => {
    const t = now();
    if (ledger.blockedUntil && ledger.blockedUntil > t)
      return { state: 'blocked' as const, resetAt: ledger.blockedUntil };
    const live = ledger.resetAt === undefined || ledger.resetAt > t;
    if (live && ledger.remaining !== undefined) {
      if (ledger.remaining <= 0)
        return { state: 'blocked' as const, resetAt: ledger.resetAt };
      if (ledger.remaining < floor)
        return { state: 'conditional-only' as const, resetAt: ledger.resetAt };
    }
    return { state: 'open' as const, resetAt: undefined };
  };

  const stale = (
    entry: CacheEntry,
    reason: string,
    resetAt?: number
  ): CachedResult => ({
    body: entry.body,
    source: 'stale',
    stale: true,
    fetchedAt: entry.fetchedAt,
    staleReason: reason,
    resetAt,
  });

  const tryLock = async (key: string, token: string) => {
    const temporary = `${lockPath(key)}.${token}.tmp`;
    try {
      await writeFile(
        temporary,
        JSON.stringify({ pid: process.pid, token, createdAt: now() }),
        { flag: 'wx', mode: 0o600 }
      );
      await link(temporary, lockPath(key));
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false;
      throw error;
    } finally {
      await rm(temporary, { force: true });
    }
  };

  const releaseLock = async (key: string, token: string) => {
    const lock = await readJson<{ token?: string }>(lockPath(key));
    if (lock?.token === token) await rm(lockPath(key), { force: true });
  };

  const breakStaleLock = async (key: string) => {
    const lock = await readJson<{ pid?: number; createdAt?: number }>(
      lockPath(key)
    );
    if (!lock) return false;
    const abandoned =
      typeof lock.pid === 'number'
        ? lock.pid !== process.pid && !isAlive(lock.pid)
        : typeof lock.createdAt === 'number' &&
          now() - lock.createdAt > lockStaleMs;
    if (abandoned) await rm(lockPath(key), { force: true });
    return abandoned;
  };

  const withLedgerLock = async <T>(operation: () => Promise<T>): Promise<T> => {
    const token = randomUUID();
    const deadline = Date.now() + lockWaitMs;
    while (!(await tryLock(ledgerKey, token))) {
      if (Date.now() >= deadline)
        throw new RateBudgetError(
          'Timed out waiting for the GitHub rate budget'
        );
      if (!(await breakStaleLock(ledgerKey))) await sleep(lockPollMs);
    }
    try {
      return await operation();
    } finally {
      await releaseLock(ledgerKey, token);
    }
  };

  const fetchUpstream = async (
    key: string,
    url: string,
    entry: CacheEntry | undefined,
    get: GetOptions
  ): Promise<CachedResult> => {
    let response: UpstreamResponse;
    try {
      response = await options.upstream(url, { etag: entry?.etag });
    } catch (error) {
      if (entry) return stale(entry, `upstream error: ${String(error)}`);
      throw error;
    }
    const headers = get.free
      ? undefined
      : await recordHeaders(response.headers);
    const ledger = headers ?? (await readLedger());
    if (
      !get.free &&
      response.status !== 304 &&
      headerNumber(response.headers, 'x-ratelimit-remaining') === undefined &&
      ledger.remaining !== undefined &&
      (ledger.resetAt ?? Infinity) > now()
    ) {
      await recordLedger({ remaining: Math.max(0, ledger.remaining - 1) });
    }
    const t = now();
    if (response.status === 304 && entry) {
      const next = { ...entry, fetchedAt: t, ttlMs: get.ttl(entry.body) };
      await writeEntry(next);
      return {
        body: next.body,
        source: 'revalidated',
        stale: false,
        fetchedAt: t,
      };
    }
    if (response.status >= 200 && response.status < 300) {
      const next: CacheEntry = {
        key,
        body: response.body,
        etag: response.headers.get('etag') ?? undefined,
        fetchedAt: t,
        ttlMs: get.ttl(response.body),
      };
      await writeEntry(next);
      return { body: next.body, source: 'fetched', stale: false, fetchedAt: t };
    }
    if (response.status === 403 || response.status === 429) {
      const retryAfter = headerNumber(response.headers, 'retry-after');
      const exhausted =
        headerNumber(response.headers, 'x-ratelimit-remaining') === 0;
      if (retryAfter !== undefined || exhausted || response.status === 429) {
        const blockedUntil =
          retryAfter !== undefined
            ? t + retryAfter * 1000
            : (ledger?.resetAt ?? t + 60_000);
        if (get.free)
          await withLedgerLock(() => recordLedger({ blockedUntil }));
        else await recordLedger({ blockedUntil });
        if (entry) return stale(entry, 'rate limited', blockedUntil);
        throw new RateBudgetError(
          `GitHub rate limit reached; retry after ${new Date(blockedUntil).toISOString()}`,
          blockedUntil
        );
      }
    }
    if (entry && response.status >= 500)
      return stale(entry, `upstream HTTP ${response.status}`);
    throw new Error(`GitHub request failed: HTTP ${response.status} ${url}`);
  };

  const load = async (
    key: string,
    url: string,
    get: GetOptions
  ): Promise<CachedResult> => {
    await ensureDir();
    const token = randomUUID();
    const started = now();
    for (;;) {
      const entry = await readEntry(key);
      if (entry && fresh(entry))
        return {
          body: entry.body,
          source: 'cache',
          stale: false,
          fetchedAt: entry.fetchedAt,
        };
      if (await tryLock(key, token)) {
        try {
          // Another process may have finished between our read and the lock.
          const current = await readEntry(key);
          if (current && fresh(current))
            return {
              body: current.body,
              source: 'cache',
              stale: false,
              fetchedAt: current.fetchedAt,
            };
          if (get.free) return await fetchUpstream(key, url, current, get);
          return await withLedgerLock(async () => {
            const gate = budget(await readLedger());
            const allowed =
              gate.state === 'open' ||
              (gate.state === 'conditional-only' && !!current?.etag);
            if (!allowed) {
              const reason =
                gate.state === 'blocked'
                  ? 'rate limit exhausted'
                  : `rate budget below reserve floor ${floor}`;
              if (current) return stale(current, reason, gate.resetAt);
              throw new RateBudgetError(
                `${reason}; no cached answer${gate.resetAt ? `; resets ${new Date(gate.resetAt).toISOString()}` : ''}`,
                gate.resetAt
              );
            }
            return fetchUpstream(key, url, current, get);
          });
        } finally {
          await releaseLock(key, token);
        }
      }
      if (now() - started > lockWaitMs) {
        if (entry) return stale(entry, 'timed out waiting for peer fetch');
        throw new Error(`Timed out waiting for a peer fetch of ${url}`);
      }
      if (!(await breakStaleLock(key))) await sleep(lockPollMs);
    }
  };

  return {
    dir,
    readLedger,
    recordLedger: (update: RateLedger) =>
      withLedgerLock(() => recordLedger(update)),
    get<T = unknown>(key: string, url: string, get: GetOptions) {
      const running = inflight.get(key);
      if (running) return running as Promise<CachedResult<T>>;
      const promise = load(key, url, get).finally(() => inflight.delete(key));
      inflight.set(key, promise);
      return promise as Promise<CachedResult<T>>;
    },
  };
}

export type CiCache = ReturnType<typeof createCiCache>;
