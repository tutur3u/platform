/* biome-ignore-all lint/suspicious/noUndeclaredEnvVars: standalone CI-only release cleanup */
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { readDraftRelease } from './draft-release.mjs';
import { desktopReleaseTag } from './release-version.mjs';

export function cleanupDraft(
  { tag, version, source, run },
  execute = execFileSync
) {
  if (
    tag !== desktopReleaseTag(version) ||
    !/^[a-f0-9]{40}$/u.test(source ?? '') ||
    !/^\d+$/u.test(run ?? '')
  )
    throw new Error('Invalid failed draft identity');
  const { release, databaseId } = readDraftRelease(tag, execute);
  const marker = `<!-- tuturuuu-desktop-release ${JSON.stringify({ version, tag, source, run })} -->`;
  if (
    release.id !== databaseId ||
    release.tag_name !== tag ||
    release.target_commitish !== source ||
    release.draft !== true ||
    !release.body?.includes(marker)
  )
    throw new Error('Refusing to delete a published or unowned release');
  execute(
    'gh',
    [
      'api',
      '--method',
      'DELETE',
      `repos/tutur3u/platform/releases/${databaseId}`,
    ],
    { stdio: 'inherit', timeout: 30000 }
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  if (
    process.env.GITHUB_REF !== 'refs/heads/production' ||
    process.env.GITHUB_REPOSITORY !== 'tutur3u/platform'
  )
    throw new Error('Draft cleanup requires the production repository');
  cleanupDraft({
    tag: process.env.DESKTOP_DRAFT_TAG,
    version: process.env.DESKTOP_VERSION,
    source: process.env.GITHUB_SHA,
    run: process.env.GITHUB_RUN_ID,
  });
}
