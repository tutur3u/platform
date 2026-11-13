import { type Changelog, parseChangelog } from './schema.ts';

/** The most releases a build embeds; older ones stay in the pipeline file. */
export const MAX_EMBEDDED_RELEASES = 8;

/**
 * The changelog a build embeds: a valid file trimmed to its newest releases,
 * else null (the page then hides Patch notes). Never invented content.
 */
export function changelogForBuild(raw: unknown): Changelog | null {
  const changelog = parseChangelog(raw);
  if (!changelog || !changelog.releases.length) return null;
  return {
    ...changelog,
    releases: [...changelog.releases]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, MAX_EMBEDDED_RELEASES),
  };
}

/** The embedded changelog, parsed again on read; null hides the section. */
export function readChangelog(embedded: unknown): Changelog | null {
  return changelogForBuild(embedded);
}
