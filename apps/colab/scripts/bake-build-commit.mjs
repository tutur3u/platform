import { realpathSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function bakedBuildCommitSource(sha) {
  if (!/^[a-f0-9]{40}$/.test(sha)) {
    throw new Error('GITHUB_SHA must be 40 lowercase hex');
  }
  return (
    '// Public commit baked by scripts/bake-build-commit.mjs. Public commit only.\n' +
    `export const COLAB_BUILD_COMMIT = ${JSON.stringify(sha)};\n`
  );
}

export function bakeBuildCommit(sha, target) {
  const path = resolve(target ?? 'src/server/build-commit.ts');
  if (basename(path) !== 'build-commit.ts') {
    throw new Error('bake target must be named build-commit.ts');
  }
  const source = bakedBuildCommitSource(sha);
  writeFileSync(path, source, { encoding: 'utf8', mode: 0o644 });
  return path;
}

function invokedDirectly() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === pathToFileURL(realpathSync(entry)).href;
  } catch {
    return false;
  }
}

if (invokedDirectly()) {
  try {
    bakeBuildCommit(process.env.GITHUB_SHA ?? '', process.argv[2]);
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : 'bake failed'}\n`
    );
    process.exit(1);
  }
}
