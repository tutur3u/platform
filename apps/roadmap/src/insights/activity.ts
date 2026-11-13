/**
 * Build-time activity: what production runs and what merged, observed by
 * scripts/generate-roadmap-data.mjs into the untracked
 * .generated/activity.json and embedded by Vite (like hosting.json).
 *
 * - deploys: each app's production build-info (commit and build time),
 *   probed from the build machine. Only the build serving now is known, never
 *   earlier deploys.
 * - merged: every merged pull request in tutur3u/platform over the build's
 *   search window, without bots and dependency updates (the same rule as the
 *   timeline history), as [number, Vietnam day, track index]. Null when the
 *   build could not read GitHub. `complete` is false when the search hit its
 *   page cap, so counts may be low.
 *
 * Anything this build did not observe is "not available", never a value
 * from an earlier build. Pure and portable.
 */

export type DeployFact = { app: string; commit: string; builtAt: string };

/** [PR number, Vietnam day, index into `tracks`] */
export type ActivityEntry = [number, string, number];

export type MergedWindow = {
  /** First and last Vietnam day the search covered, inclusive. */
  from: string;
  to: string;
  complete: boolean;
  tracks: string[];
  entries: ActivityEntry[];
};

export type ActivitySnapshot = {
  schema: 1;
  checkedAt: string | null;
  mode: 'observed' | 'offline' | 'missing';
  deploys: DeployFact[];
  merged: MergedWindow | null;
};

export const MISSING_ACTIVITY: ActivitySnapshot = {
  schema: 1,
  checkedAt: null,
  mode: 'missing',
  deploys: [],
  merged: null,
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const SHA = /^[a-f0-9]{40}$/;
const APP = /^[a-z][a-z0-9-]{0,31}$/;
const MAX_ENTRIES = 5_000;

function time(value: unknown) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
    ? new Date(value).toISOString()
    : null;
}

function parseMerged(value: unknown): MergedWindow | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.from !== 'string' || !DAY.test(raw.from)) return null;
  if (typeof raw.to !== 'string' || !DAY.test(raw.to) || raw.to < raw.from)
    return null;
  if (typeof raw.complete !== 'boolean') return null;
  if (
    !Array.isArray(raw.tracks) ||
    !raw.tracks.every((id) => typeof id === 'string' && APP.test(id))
  )
    return null;
  if (!Array.isArray(raw.entries) || raw.entries.length > MAX_ENTRIES)
    return null;
  const tracks = raw.tracks as string[];
  const entries: ActivityEntry[] = [];
  for (const entry of raw.entries) {
    if (!Array.isArray(entry) || entry.length !== 3) return null;
    const [number, day, track] = entry as unknown[];
    if (
      typeof number !== 'number' ||
      !Number.isInteger(number) ||
      number < 1 ||
      typeof day !== 'string' ||
      !DAY.test(day) ||
      typeof track !== 'number' ||
      !Number.isInteger(track) ||
      track < 0 ||
      track >= tracks.length
    )
      return null;
    entries.push([number, day, track]);
  }
  return {
    from: raw.from,
    to: raw.to,
    complete: raw.complete,
    tracks,
    entries,
  };
}

/** Validate a snapshot; anything malformed reads as missing. */
export function parseActivity(value: unknown): ActivitySnapshot {
  if (!value || typeof value !== 'object') return MISSING_ACTIVITY;
  const raw = value as Record<string, unknown>;
  const checkedAt = time(raw.checkedAt);
  if (raw.schema !== 1 || !checkedAt) return MISSING_ACTIVITY;
  if (raw.mode !== 'observed' && raw.mode !== 'offline')
    return MISSING_ACTIVITY;
  if (raw.mode === 'offline')
    return { ...MISSING_ACTIVITY, checkedAt, mode: 'offline' };
  const deploys = (Array.isArray(raw.deploys) ? raw.deploys : []).flatMap(
    (entry): DeployFact[] => {
      const item = entry as Record<string, unknown> | null;
      const builtAt = time(item?.builtAt);
      return typeof item?.app === 'string' &&
        APP.test(item.app) &&
        typeof item.commit === 'string' &&
        SHA.test(item.commit) &&
        builtAt
        ? [{ app: item.app, commit: item.commit, builtAt }]
        : [];
    }
  );
  return {
    schema: 1,
    checkedAt,
    mode: 'observed',
    deploys,
    merged: parseMerged(raw.merged),
  };
}

/** What an offline build writes: this build's time, nothing observed. */
export function offlineActivity(now: number): ActivitySnapshot {
  return {
    ...MISSING_ACTIVITY,
    checkedAt: new Date(now).toISOString(),
    mode: 'offline',
  };
}

/** The longest a snapshot may predate the build that embeds it. */
export const ACTIVITY_MAX_AGE_MS = 60 * 60_000;

/** A snapshot written for this build, else null (shown as not available). */
export function activityForBuild(value: unknown, buildTime: number): unknown {
  const snapshot = parseActivity(value);
  if (!snapshot.checkedAt) return null;
  const age = buildTime - Date.parse(snapshot.checkedAt);
  return age >= -60_000 && age <= ACTIVITY_MAX_AGE_MS ? value : null;
}

/** A production build-info body's build time, when it reports one. */
export function builtAtFrom(body: string): string | null {
  try {
    const parsed = JSON.parse(body) as Record<string, unknown> | null;
    return time(parsed?.builtAt);
  } catch {
    return null;
  }
}

/**
 * The merged window from the build's search results: every merged PR that is
 * not noise (bots were dropped by the search reader), classified into a
 * public track like the history. The search starts at UTC midnight
 * `searchSince`, which is 07:00 in Vietnam, so that Vietnam day is partial
 * and the window starts the day after.
 */
export function mergedWindow(
  prs: readonly { number: number; title: string; mergedAt: string | null }[],
  input: {
    searchSince: string;
    now: number;
    complete: boolean;
    trackIds: readonly string[];
    isNoise: (title: string) => boolean;
    classify: (title: string, known: ReadonlySet<string>) => { track: string };
    localDay: (iso: string) => string;
  }
): MergedWindow {
  const tracks = [...new Set([...input.trackIds, 'other'])];
  const known = new Set(tracks);
  const index = new Map(tracks.map((track, i) => [track, i]));
  const from = new Date(
    Date.parse(`${input.searchSince}T00:00:00Z`) + 86_400_000
  )
    .toISOString()
    .slice(0, 10);
  const to = input.localDay(new Date(input.now).toISOString());
  const entries: ActivityEntry[] = [];
  for (const pr of prs) {
    if (!pr.mergedAt || Date.parse(pr.mergedAt) > input.now) continue;
    const day = input.localDay(pr.mergedAt);
    if (day < from || day > to || input.isNoise(pr.title)) continue;
    const track = input.classify(pr.title, known).track;
    entries.push([pr.number, day, index.get(track) ?? index.get('other') ?? 0]);
  }
  entries.sort((a, b) => b[1].localeCompare(a[1]) || b[0] - a[0]);
  return { from, to, complete: input.complete, tracks, entries };
}
