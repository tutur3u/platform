/**
 * Commits to main as delivery evidence. Work also lands on main without a
 * pull request, so a curated deliverable can cite the commits that deliver
 * it (`commits` in content/tracks/*.ts). The build reads its own git history
 * (scripts/commit-log.mjs) and records, for each cited commit it finds on
 * main, when it landed. Nothing else about a commit leaves the build.
 *
 * A cited commit proves the work is merged, never that it is deployed: no
 * public probe ties a commit to what each service serves, so a commit-cited
 * deliverable reads as merged with an unverified deploy and is never live
 * (status.ts). Pure and portable.
 */
import { SNAPSHOT_MAX_AGE_MS } from './hosting.ts';
import { isoTime } from './model.ts';
import type { Track } from './status.ts';

export type CommitEvidence = {
  sha: string;
  /** Committer time on main, ISO. */
  at: string;
};

export type EvidenceSnapshot = {
  schema: 1;
  checkedAt: string;
  /** The checkout's HEAD the history was read from. */
  head: string;
  commits: CommitEvidence[];
};

const SHA = /^[a-f0-9]{40}$/;
const MAX_COMMITS = 2000;

/** Every commit a curated deliverable cites. */
export function citedCommits(tracks: readonly Track[]): Set<string> {
  return new Set(
    tracks.flatMap((track) =>
      track.milestones.flatMap((milestone) =>
        milestone.deliverables.flatMap((item) => item.commits ?? [])
      )
    )
  );
}

/**
 * A strict read of the generated file: anything malformed or unknown is no
 * evidence at all, so a deliverable falls back to its curated status instead
 * of claiming a merge. The build passes its clock and its immutable source
 * commit and takes only a snapshot read from that commit's history within
 * SNAPSHOT_MAX_AGE_MS (the hosting snapshot's bound), so a file left behind
 * by another build or source is ignored. The page reads the build's checked
 * value without them (a Worker's clock reads 0 while a module evaluates).
 */
export function parseEvidence(
  value: unknown,
  build?: { time: number; source: string | undefined }
): EvidenceSnapshot | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  try {
    if (Object.keys(raw).sort().join(',') !== 'checkedAt,commits,head,schema')
      return null;
    if (raw.schema !== 1 || !Array.isArray(raw.commits)) return null;
    if (raw.commits.length > MAX_COMMITS) return null;
    if (typeof raw.head !== 'string' || !SHA.test(raw.head)) return null;
    const checkedAt = isoTime(raw.checkedAt, 'evidence');
    if (build) {
      const age = build.time - Date.parse(checkedAt);
      if (age < -60_000 || age > SNAPSHOT_MAX_AGE_MS) return null;
      if (raw.head !== build.source) return null;
    }
    const commits = raw.commits.map((entry: unknown) => {
      if (!entry || typeof entry !== 'object') throw new Error('entry');
      const commit = entry as Record<string, unknown>;
      if (Object.keys(commit).sort().join(',') !== 'at,sha')
        throw new Error('fields');
      if (typeof commit.sha !== 'string' || !SHA.test(commit.sha))
        throw new Error('sha');
      const at = isoTime(commit.at, 'commit');
      if (Date.parse(at) > Date.parse(checkedAt) + 60_000)
        throw new Error('future');
      return { sha: commit.sha, at };
    });
    if (new Set(commits.map((commit) => commit.sha)).size !== commits.length)
      return null;
    return { schema: 1, checkedAt, head: raw.head, commits };
  } catch {
    return null;
  }
}
