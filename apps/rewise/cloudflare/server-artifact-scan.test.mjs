import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { assertServerArtifact } from './server-artifact-scan.mjs';

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'rewise-artifact-scan-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test('rejects a development secret prefix in a nested non-mjs file', async (t) => {
  const directory = await fixture(t);
  await writeFile(join(directory, 'index.mjs'), 'export default {};');
  await mkdir(join(directory, 'assets'));
  await writeFile(
    join(directory, 'assets', 'worker.js'),
    'tuturuuu-local-development-synthetic-secret'
  );
  await assert.rejects(assertServerArtifact(directory), /worker\.js/u);
});

test('rejects an empty emitted server including empty subdirectories', async (t) => {
  const directory = await fixture(t);
  await assert.rejects(assertServerArtifact(directory), /must contain files/u);
  await mkdir(join(directory, 'assets'));
  await assert.rejects(assertServerArtifact(directory), /must contain files/u);
});

test('rejects a non-inlined NODE_ENV in a non-mjs file', async (t) => {
  const directory = await fixture(t);
  await writeFile(join(directory, 'worker.js'), 'process.env.NODE_ENV');
  await assert.rejects(assertServerArtifact(directory), /worker\.js/u);
});

test('accepts clean emitted files across extensions and subdirectories', async (t) => {
  const directory = await fixture(t);
  await mkdir(join(directory, 'assets'));
  await writeFile(join(directory, 'index.mjs'), 'export default {};');
  await writeFile(join(directory, 'assets', 'worker.js'), '"production"');
  await writeFile(join(directory, 'assets', 'config.json'), '{}');
  await assertServerArtifact(directory);
});
