/**
 * The badge on each hosting card. It states only facts that cannot go stale:
 * the deployed commit's own date, or that no commit was reported. A count of
 * commits behind main is not shown: it is true only at the moment of the
 * build-time probe and silently drifts as main and the apps move on.
 */
export type HostBadge = { kind: 'build'; at: string } | { kind: 'unknown' };

export function hostBadge(host: {
  commit: string | null;
  commitAt: string | null;
}): HostBadge | null {
  if (!host.commit) return { kind: 'unknown' };
  if (host.commitAt) return { kind: 'build', at: host.commitAt };
  return null;
}
