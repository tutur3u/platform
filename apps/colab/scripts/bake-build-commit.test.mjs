import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import {
  bakeBuildCommit,
  bakedBuildCommitSource,
} from './bake-build-commit.mjs';

const SHA = '0123456789abcdef0123456789abcdef01234567';

test('writes only the public commit constant', () => {
  const dir = mkdtempSync(join(tmpdir(), 'colab-bake-'));
  const target = join(dir, 'build-commit.ts');
  try {
    bakeBuildCommit(SHA, target);
    const source = readFileSync(target, 'utf8');
    assert.equal(source, bakedBuildCommitSource(SHA));
    assert.equal(source.includes('COLAB_SESSION_SECRET'), false);
    assert.equal(source.includes('CLOUDFLARE_API_TOKEN'), false);
    assert.equal(/@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(source), false);
    assert.match(source, /export const COLAB_BUILD_COMMIT = "[0-9a-f]{40}";/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('refuses a missing, upper-case, or short commit', () => {
  for (const sha of ['', SHA.toUpperCase(), SHA.slice(0, 39), `${SHA}\n`]) {
    assert.throws(() => bakedBuildCommitSource(sha), /40 lowercase hex/);
  }
});

test('the command exits without writing when GITHUB_SHA is empty', () => {
  const dir = mkdtempSync(join(tmpdir(), 'colab-bake-'));
  const target = join(dir, 'build-commit.ts');
  try {
    const result = spawnSync(
      process.execPath,
      [new URL('./bake-build-commit.mjs', import.meta.url).pathname, target],
      { env: { ...process.env, GITHUB_SHA: '' }, encoding: 'utf8' }
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /40 lowercase hex/);
    assert.throws(() => readFileSync(target, 'utf8'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
