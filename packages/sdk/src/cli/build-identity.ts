import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export function packageBuildIdentity(manifest: unknown) {
  if (!manifest || typeof manifest !== 'object' || !('version' in manifest))
    throw new Error(
      'SDK package version is missing. Reinstall the global package.'
    );
  const version = manifest.version;
  if (typeof version !== 'string')
    throw new Error(
      'SDK package version is invalid. Reinstall the global package.'
    );
  const build =
    'tuturuuuBuild' in manifest ? manifest.tuturuuuBuild : undefined;
  const sourceSha =
    build &&
    typeof build === 'object' &&
    'sourceSha' in build &&
    typeof build.sourceSha === 'string' &&
    /^[a-f0-9]{40}$/.test(build.sourceSha)
      ? build.sourceSha
      : null;
  return {
    version,
    channel: version.includes('-dev.') ? 'dev' : 'latest',
    sourceSha,
  };
}

export function installedBuildIdentity() {
  const manifest: unknown = JSON.parse(
    readFileSync(join(__dirname, '../../package.json'), 'utf8')
  );
  return packageBuildIdentity(manifest);
}
