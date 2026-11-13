#!/usr/bin/env node
/**
 * Normalizes the committed refresh outputs (src/generated/live.json and
 * history.json) with the repository's own oxfmt, so a refreshed snapshot
 * passes the same `oxfmt --check` as every other committed file.
 *
 * The generators serialize compactly (history.json writes one array per line),
 * which oxfmt rewrites. This step runs the root-pinned oxfmt with the root
 * .oxfmtrc.json; it refuses to run when the installed oxfmt is not the version
 * the root package.json pins, or when oxfmt is not installed.
 *
 * node scripts/format-generated.mjs          write the canonical form
 * node scripts/format-generated.mjs --check  fail when a file would change
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const defaultRepoRoot = resolve(appRoot, '../..');

export const GENERATED_FILES = [
  'src/generated/live.json',
  'src/generated/history.json',
];

function readJson(path, what) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`Cannot read ${what} at ${path}: ${error.message}`);
  }
}

/** Resolves the installed oxfmt entrypoint, proving it is the pinned version. */
export function resolveOxfmt(repoRoot = defaultRepoRoot) {
  const pinned = readJson(join(repoRoot, 'package.json'), 'root manifest')
    .devDependencies?.oxfmt;
  if (!pinned || !/^\d+\.\d+\.\d+$/.test(pinned)) {
    throw new Error(`Root package.json must pin an exact oxfmt, got ${pinned}`);
  }
  const packageDir = join(repoRoot, 'node_modules/oxfmt');
  const installed = readJson(
    join(packageDir, 'package.json'),
    'installed oxfmt (run bun install --frozen-lockfile)'
  );
  if (installed.version !== pinned) {
    throw new Error(
      `Installed oxfmt ${installed.version} does not match the pinned ${pinned}`
    );
  }
  const bin =
    typeof installed.bin === 'string' ? installed.bin : installed.bin?.oxfmt;
  if (!bin) throw new Error('Installed oxfmt declares no oxfmt binary');
  return { entry: join(packageDir, bin), version: installed.version };
}

export function formatGenerated({
  repoRoot = defaultRepoRoot,
  cwd = appRoot,
  files = GENERATED_FILES,
  check = false,
  stdio = 'inherit',
  spawn = spawnSync,
} = {}) {
  const { entry } = resolveOxfmt(repoRoot);
  const result = spawn(
    process.execPath,
    [
      entry,
      '--config',
      join(repoRoot, '.oxfmtrc.json'),
      check ? '--check' : '--write',
      '--threads',
      '2',
      ...files.map((file) => resolve(cwd, file)),
    ],
    { cwd: repoRoot, stdio }
  );
  if (result.error) throw result.error;
  return result.status ?? 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    process.exitCode = formatGenerated({
      check: process.argv.slice(2).includes('--check'),
    });
  } catch (error) {
    process.stderr.write(`[roadmap-format] ${error.message}\n`);
    process.exitCode = 1;
  }
}
