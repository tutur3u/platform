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

function sourceMap(source) {
  return JSON.stringify({
    version: 3,
    sources: ['original.ts'],
    sourcesContent: [source],
    names: [],
    mappings: '',
  });
}

test('accepts original NODE_ENV text in a valid source map', async (t) => {
  const directory = await fixture(t);
  await writeFile(join(directory, 'index.mjs'), 'export default "production";');
  await writeFile(
    join(directory, 'index.mjs.map'),
    sourceMap('process.env.NODE_ENV')
  );
  await assertServerArtifact(directory);
});

test('a source map cannot hide executable NODE_ENV', async (t) => {
  const directory = await fixture(t);
  await writeFile(
    join(directory, 'index.mjs.map'),
    sourceMap('process.env.NODE_ENV')
  );
  await writeFile(
    join(directory, 'index.mjs'),
    'export default process.env.NODE_ENV;'
  );
  await assert.rejects(assertServerArtifact(directory), /index\.mjs/u);
});

test('rejects development secrets in source maps including JSON escapes', async (t) => {
  const directory = await fixture(t);
  await writeFile(join(directory, 'index.mjs'), 'export default {};');
  for (const escaped of [false, true]) {
    let map = sourceMap('tuturuuu-local-development-synthetic-secret');
    if (escaped) map = map.replace('tuturuuu', String.raw`\u0074uturuuu`);
    await writeFile(join(directory, 'index.mjs.map'), map);
    await assert.rejects(assertServerArtifact(directory), /index\.mjs\.map/u);
  }
});

test('rejects invalid or disguised source maps', async (t) => {
  const directory = await fixture(t);
  for (const content of ['process.env.NODE_ENV', '{}', '{"version":3}']) {
    await writeFile(join(directory, 'index.mjs.map'), content);
    await assert.rejects(assertServerArtifact(directory));
  }
});
