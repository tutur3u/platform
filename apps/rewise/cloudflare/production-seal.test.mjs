import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { assertServerArtifact } from './server-artifact-scan.mjs';

test('production removes server source maps before doctor/seal and keeps executable scanning', async (t) => {
  const workflow = await readFile(
    new URL(
      '../../../.github/workflows/rewise-cloudflare.yaml',
      import.meta.url
    ),
    'utf8'
  );
  const removal = workflow.match(
    /- name: Remove production server source maps\n\s+run: ([^\n]+)/u
  );
  assert.ok(removal);
  assert.ok(removal.index < workflow.indexOf('- name: Pre-seal doctor'));
  assert.ok(removal.index < workflow.indexOf('- name: Seal and pack Worker'));
  const root = await mkdtemp(join(tmpdir(), 'rewise-production-seal-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const server = join(root, 'apps/rewise/dist/server');
  const client = join(root, 'apps/rewise/dist/client');
  await mkdir(join(server, 'assets'), { recursive: true });
  await mkdir(client, { recursive: true });
  const sourceMap = JSON.stringify({
    version: 3,
    sources: ['original.ts'],
    mappings: '',
    sourcesContent: ['tuturuuu-local-development-synthetic-only'],
  });
  await writeFile(join(server, 'index.mjs'), 'export default "production";');
  await writeFile(join(server, 'index.mjs.map'), sourceMap);
  await writeFile(join(server, 'assets/chunk.mjs.map'), sourceMap);
  await writeFile(join(client, 'client.js.map'), sourceMap);
  await assert.rejects(assertServerArtifact(server), /\.map/u);
  execFileSync('sh', ['-c', removal[1]], { cwd: root });
  await assertServerArtifact(server);
  assert.equal(
    await readFile(join(client, 'client.js.map'), 'utf8'),
    sourceMap
  );
  await writeFile(
    join(server, 'index.mjs'),
    'export default "tuturuuu-local-development-synthetic-only";'
  );
  await assert.rejects(assertServerArtifact(server), /index\.mjs/u);
});
