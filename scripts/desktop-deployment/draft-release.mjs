import { execFileSync } from 'node:child_process';

// Drafts can exist without a public tag lookup. Resolve the authenticated CLI's
// database ID, then verify the REST release before making any package public.
export function readDraftRelease(tag, execute = execFileSync) {
  const options = {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 30000,
    maxBuffer: 1024 * 1024,
  };
  try {
    const { databaseId } = JSON.parse(
      execute(
        'gh',
        [
          'release',
          'view',
          tag,
          '--repo',
          'tutur3u/platform',
          '--json',
          'databaseId',
        ],
        options
      )
    );
    if (!Number.isSafeInteger(databaseId) || databaseId <= 0)
      throw new Error('Invalid draft release ID');
    const release = JSON.parse(
      execute(
        'gh',
        ['api', `repos/tutur3u/platform/releases/${databaseId}`],
        options
      )
    );
    return { release, databaseId };
  } catch {
    throw new Error(
      'GitHub draft lookup failed; no public release was created'
    );
  }
}

export function verifyDraftRelease(
  { release, databaseId },
  { tag, source, files }
) {
  if (
    release?.id !== databaseId ||
    release?.tag_name !== tag ||
    release?.target_commitish !== source ||
    release?.draft !== true ||
    release?.prerelease !== true ||
    !Array.isArray(release?.assets) ||
    release.assets.length !== files.length ||
    files.some(
      ({ name, sha256 }) =>
        !release.assets.some(
          (asset) =>
            asset?.name === name &&
            asset?.state === 'uploaded' &&
            asset?.digest === `sha256:${sha256}`
        )
    )
  )
    throw new Error(
      'GitHub draft identity or asset verification failed; no public release was created'
    );
}
