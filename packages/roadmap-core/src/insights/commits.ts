/**
 * Commits to main: the shipping flow once work lands on main directly instead
 * of through pull requests. scripts/generate-roadmap-data.mjs reads the
 * build checkout's own git history (no token, no API) and this module turns
 * it into public counts per Vietnam day and product.
 *
 * Only counts leave the build: never commit subjects, authors or file paths.
 * A commit is "in production" when the production branch or an observed
 * production build contains it. Pure and portable.
 */
import {
  OTHER_TRACK,
  SCOPE_TRACKS,
  classifyTitle,
  isNoise,
} from '../history/classify.ts';

/** One first-parent commit on main, as the build's git log reports it. */
export type CommitFact = {
  sha: string;
  /** Committer time, ISO. */
  at: string;
  subject: string;
  authorName: string;
  authorEmail: string;
  files: readonly string[];
  inProduction: boolean;
};

/** [Vietnam day, commits, via a pull request, in production now] */
export type CommitDay = [string, number, number, number];

/** [Vietnam day, index into `tracks`, commits touching that product] */
export type CommitProduct = [string, number, number];

export type ProductionLag = {
  /** The production branch tip this build saw. */
  commit: string;
  /** Commits on main that production does not contain yet. */
  waiting: number;
  /** Committer time of the oldest of them, or null when none wait. */
  oldestWaitingAt: string | null;
};

export type CommitWindow = {
  /** First and last Vietnam day covered, inclusive. */
  from: string;
  to: string;
  tracks: string[];
  days: CommitDay[];
  products: CommitProduct[];
  production: ProductionLag | null;
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const SHA = /^[a-f0-9]{40}$/;
const TRACK = /^[a-z][a-z0-9-]{0,31}$/;
const MAX_DAYS = 120;
const MAX_PRODUCTS = MAX_DAYS * 40;
const VIA_PULL_REQUEST = /\(#\d+\)\s*$|^Merge pull request #\d+/;
const PULL_REQUEST_MERGE = /^Merge pull request #\d+/;
/** Paths that are tooling and docs rather than a product. */
const TOOLING = /^(\.github|scripts|plugins|docs|docs-internal|apps\/docs)\//;

const count = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0;

/** Bots, release and dependency chores are not shipped work. */
export function isNoiseCommit(
  commit: Pick<CommitFact, 'subject' | 'authorName' | 'authorEmail'>
) {
  if (/\[bot\]/i.test(commit.authorEmail)) return true;
  // A merge commit on main's first-parent line is how a pull request landed.
  if (PULL_REQUEST_MERGE.test(commit.subject)) return false;
  if (/^chore\((main|release)\):\s*release\b/i.test(commit.subject))
    return true;
  return isNoise(commit.subject, { login: commit.authorName });
}

export function viaPullRequest(subject: string) {
  return VIA_PULL_REQUEST.test(subject);
}

/**
 * The public products a commit touches: `apps/<dir>/` paths first (a
 * conventional scope or a track id), then the subject's scope, then tooling
 * paths as developer tools; anything else is "other". A commit touching
 * several products counts once for each.
 */
export function commitTracks(
  files: readonly string[],
  subject: string,
  known: ReadonlySet<string>
): string[] {
  const found = new Set<string>();
  for (const file of files) {
    const dir = /^apps\/([^/]+)\//.exec(file)?.[1];
    if (!dir || dir === 'docs') continue;
    const track = SCOPE_TRACKS[dir] ?? dir;
    if (known.has(track)) found.add(track);
  }
  if (found.size) return [...found].sort();
  const titled = classifyTitle(subject, known, new Set()).track;
  if (titled !== OTHER_TRACK) return [titled];
  if (known.has('dx') && files.length && files.every((f) => TOOLING.test(f)))
    return ['dx'];
  return [OTHER_TRACK];
}

/** Vietnam calendar day of an instant (UTC+7, no daylight saving). */
function vnDay(ms: number) {
  return new Date(ms + 7 * 3_600_000).toISOString().slice(0, 10);
}

/** Aggregate the build's commits into the public window. */
export function commitWindow(
  commits: readonly CommitFact[],
  input: {
    now: number;
    days: number;
    trackIds: readonly string[];
    production: ProductionLag | null;
  }
): CommitWindow {
  const tracks = [...new Set([...input.trackIds, OTHER_TRACK])];
  const known = new Set(tracks);
  const index = new Map(tracks.map((track, i) => [track, i]));
  const to = vnDay(input.now);
  const from = vnDay(input.now - (input.days - 1) * 86_400_000);
  const byDay = new Map<string, CommitDay>();
  const byProduct = new Map<string, CommitProduct>();
  for (const commit of commits) {
    const at = Date.parse(commit.at);
    if (!Number.isFinite(at) || at > input.now + 60_000) continue;
    const day = vnDay(at);
    if (day < from || day > to || isNoiseCommit(commit)) continue;
    const row = byDay.get(day) ?? [day, 0, 0, 0];
    row[1] += 1;
    if (viaPullRequest(commit.subject)) row[2] += 1;
    if (commit.inProduction) row[3] += 1;
    byDay.set(day, row);
    for (const track of commitTracks(commit.files, commit.subject, known)) {
      const i = index.get(track) ?? index.get(OTHER_TRACK) ?? 0;
      const key = `${day}:${i}`;
      const product = byProduct.get(key) ?? [day, i, 0];
      product[2] += 1;
      byProduct.set(key, product);
    }
  }
  return {
    from,
    to,
    tracks,
    days: [...byDay.values()].sort((a, b) => b[0].localeCompare(a[0])),
    products: [...byProduct.values()].sort(
      (a, b) => b[0].localeCompare(a[0]) || a[1] - b[1]
    ),
    production: input.production,
  };
}

function parseProduction(value: unknown): ProductionLag | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.commit !== 'string' || !SHA.test(raw.commit)) return null;
  if (!count(raw.waiting)) return null;
  const oldest =
    typeof raw.oldestWaitingAt === 'string' &&
    Number.isFinite(Date.parse(raw.oldestWaitingAt))
      ? new Date(raw.oldestWaitingAt).toISOString()
      : null;
  if (raw.waiting > 0 && !oldest) return null;
  return { commit: raw.commit, waiting: raw.waiting, oldestWaitingAt: oldest };
}

/** Validate a commit window; anything malformed reads as not available. */
export function parseCommits(value: unknown): CommitWindow | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const { from, to } = raw;
  if (typeof from !== 'string' || !DAY.test(from)) return null;
  if (typeof to !== 'string' || !DAY.test(to) || to < from) return null;
  if (
    !Array.isArray(raw.tracks) ||
    !raw.tracks.every((id) => typeof id === 'string' && TRACK.test(id))
  )
    return null;
  const tracks = raw.tracks as string[];
  if (!Array.isArray(raw.days) || raw.days.length > MAX_DAYS) return null;
  if (!Array.isArray(raw.products) || raw.products.length > MAX_PRODUCTS)
    return null;
  const inRange = (day: unknown): day is string =>
    typeof day === 'string' && DAY.test(day) && day >= from && day <= to;
  const days: CommitDay[] = [];
  for (const entry of raw.days) {
    if (!Array.isArray(entry) || entry.length !== 4) return null;
    const [day, total, viaPr, live] = entry as unknown[];
    if (!inRange(day) || !count(total) || !count(viaPr) || !count(live))
      return null;
    if (viaPr > total || live > total) return null;
    days.push([day, total, viaPr, live]);
  }
  const products: CommitProduct[] = [];
  for (const entry of raw.products) {
    if (!Array.isArray(entry) || entry.length !== 3) return null;
    const [day, track, total] = entry as unknown[];
    if (
      !inRange(day) ||
      !count(track) ||
      track >= tracks.length ||
      !count(total)
    )
      return null;
    products.push([day, track, total]);
  }
  return {
    from,
    to,
    tracks,
    days,
    products,
    production: parseProduction(raw.production),
  };
}
