/**
 * Public live facts behind the roadmap. Everything here comes from public
 * sources: the public GitHub REST API and each app's public build-info probe.
 * The validator is strict so a broken payload falls back to the last good
 * data instead of rendering partial or invented status.
 */

export const REPO = 'tutur3u/platform';
export const REPO_URL = `https://github.com/${REPO}`;

export type Platform = 'workers' | 'vercel' | 'store' | 'unknown';

export type PrFact = {
  number: number;
  title: string;
  state: 'open' | 'merged' | 'closed';
  draft: boolean;
  approved: boolean;
  mergedAt: string | null;
};

export type HostFact = {
  app: string;
  platform: Platform;
  /** Deployed commit (Workers/Vercel build-info) or latest store release tag. */
  commit: string | null;
  /** Committer date of that commit on main, when known. */
  commitAt: string | null;
  /** Commits on main not yet in the deployed build. */
  behindBy: number | null;
};

export type LiveData = {
  schema: 1;
  /** When these facts were observed. Never later than now. */
  generatedAt: string;
  /** build: generated with the deploy; live: refreshed in this browser. */
  source: 'build' | 'live';
  main: { sha: string; at: string } | null;
  prs: PrFact[];
  hosts: HostFact[];
};

const SHA = /^[a-f0-9]{40}$/;
const APP = /^[a-z][a-z0-9-]{0,31}$/;
const MAX_PRS = 2000;
const MAX_HOSTS = 64;

function record(value: unknown, what: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`Invalid ${what}`);
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  keys: string[],
  what: string
) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  )
    throw new Error(`Unexpected fields in ${what}`);
}

export function isoTime(value: unknown, what: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value))
    throw new Error(`Invalid ${what} time`);
  const time = Date.parse(value);
  if (!Number.isFinite(time)) throw new Error(`Invalid ${what} time`);
  return new Date(time).toISOString();
}

function nullableTime(value: unknown, what: string) {
  return value === null ? null : isoTime(value, what);
}

function nullableSha(value: unknown, what: string) {
  if (value === null) return null;
  if (typeof value !== 'string' || !SHA.test(value))
    throw new Error(`Invalid ${what} commit`);
  return value;
}

function bool(value: unknown, what: string) {
  if (typeof value !== 'boolean') throw new Error(`Invalid ${what}`);
  return value;
}

export function parsePr(value: unknown): PrFact {
  const pr = record(value, 'pull request');
  exactKeys(
    pr,
    ['number', 'title', 'state', 'draft', 'approved', 'mergedAt'],
    'pull request'
  );
  if (
    typeof pr.number !== 'number' ||
    !Number.isInteger(pr.number) ||
    pr.number < 1
  )
    throw new Error('Invalid pull request number');
  if (typeof pr.title !== 'string' || !pr.title.trim() || pr.title.length > 300)
    throw new Error('Invalid pull request title');
  if (pr.state !== 'open' && pr.state !== 'merged' && pr.state !== 'closed')
    throw new Error('Invalid pull request state');
  const mergedAt = nullableTime(pr.mergedAt, 'merge');
  if ((pr.state === 'merged') !== (mergedAt !== null))
    throw new Error('Merge time must match merged state');
  return {
    number: pr.number,
    title: pr.title,
    state: pr.state,
    draft: bool(pr.draft, 'draft flag'),
    approved: bool(pr.approved, 'approval flag'),
    mergedAt,
  };
}

export function parseHost(value: unknown): HostFact {
  const host = record(value, 'host');
  exactKeys(
    host,
    ['app', 'platform', 'commit', 'commitAt', 'behindBy'],
    'host'
  );
  if (typeof host.app !== 'string' || !APP.test(host.app))
    throw new Error('Invalid host app');
  if (
    !['workers', 'vercel', 'store', 'unknown'].includes(host.platform as string)
  )
    throw new Error('Invalid host platform');
  const behindBy = host.behindBy;
  if (
    behindBy !== null &&
    (typeof behindBy !== 'number' ||
      !Number.isInteger(behindBy) ||
      behindBy < 0)
  )
    throw new Error('Invalid behind count');
  const commit = nullableSha(host.commit, 'host');
  const commitAt = nullableTime(host.commitAt, 'host commit');
  if (commit === null && (commitAt !== null || behindBy !== null))
    throw new Error('Host commit facts need a commit');
  return {
    app: host.app,
    platform: host.platform as Platform,
    commit,
    commitAt,
    behindBy: behindBy as number | null,
  };
}

export function parseLiveData(value: unknown, now = Date.now()): LiveData {
  const data = record(value, 'live data');
  exactKeys(
    data,
    ['schema', 'generatedAt', 'source', 'main', 'prs', 'hosts'],
    'live data'
  );
  if (data.schema !== 1) throw new Error('Unsupported live data schema');
  if (data.source !== 'build' && data.source !== 'live')
    throw new Error('Invalid live data source');
  const generatedAt = isoTime(data.generatedAt, 'observation');
  // A clock a few minutes ahead is tolerated; a future snapshot is not.
  if (Date.parse(generatedAt) > now + 10 * 60_000)
    throw new Error('Observation time is in the future');
  let main: LiveData['main'] = null;
  if (data.main !== null) {
    const raw = record(data.main, 'main');
    exactKeys(raw, ['sha', 'at'], 'main');
    const sha = nullableSha(raw.sha, 'main');
    if (!sha) throw new Error('Invalid main commit');
    main = { sha, at: isoTime(raw.at, 'main') };
  }
  if (!Array.isArray(data.prs) || data.prs.length > MAX_PRS)
    throw new Error('Invalid pull request list');
  if (!Array.isArray(data.hosts) || data.hosts.length > MAX_HOSTS)
    throw new Error('Invalid host list');
  const prs = data.prs.map(parsePr);
  const hosts = data.hosts.map(parseHost);
  if (new Set(prs.map((pr) => pr.number)).size !== prs.length)
    throw new Error('Duplicate pull request');
  if (new Set(hosts.map((host) => host.app)).size !== hosts.length)
    throw new Error('Duplicate host');
  return {
    schema: 1,
    generatedAt,
    source: data.source,
    main,
    prs,
    hosts,
  };
}

/**
 * Merge a newer observation over an older one. Newer PR and host facts win;
 * facts only the older set knows about (older merged PRs, store releases)
 * are kept so a narrow live refresh never erases history.
 */
export function mergeLiveData(older: LiveData, newer: LiveData): LiveData {
  const prs = new Map(older.prs.map((pr) => [pr.number, pr]));
  for (const pr of newer.prs) prs.set(pr.number, pr);
  const hosts = new Map(older.hosts.map((host) => [host.app, host]));
  for (const host of newer.hosts) {
    const previous = hosts.get(host.app);
    // A failed probe (unknown, no commit) never erases a known observation,
    // and a conflicting platform is ambiguous: keep the earlier, authoritative
    // classification instead of flipping an app between Workers and Vercel.
    if (
      previous &&
      previous.platform !== 'unknown' &&
      (host.platform === 'unknown' ||
        host.platform !== previous.platform ||
        // A commit-less answer is ambiguous too: never erase a known commit.
        (previous.commit !== null && host.commit === null))
    )
      continue;
    hosts.set(host.app, host);
  }
  return {
    schema: 1,
    generatedAt: newer.generatedAt,
    source: newer.source,
    main: newer.main ?? older.main,
    prs: [...prs.values()].sort((a, b) => b.number - a.number),
    hosts: [...hosts.values()].sort((a, b) => a.app.localeCompare(b.app)),
  };
}
