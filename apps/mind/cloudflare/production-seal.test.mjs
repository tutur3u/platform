import { prepareServerArtifact } from './prepare-server-artifact.mjs';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { assertServerArtifact } from './server-artifact-scan.mjs';

test('production removes server source maps before doctor/seal and keeps executable scanning', async (t) => {
  const workflow = await readFile(
    new URL('../../../.github/workflows/mind-cloudflare.yaml', import.meta.url),
    'utf8'
  );
  const removal = workflow.match(
    /(find apps\/mind\/dist\/server -name '\*\.map' -type f -delete)/u
  );
  assert.ok(removal);
  assert.ok(
    removal.index <
      workflow.indexOf(
        '- name: Validate, seal and pack the final production output'
      )
  );
  const root = await mkdtemp(join(tmpdir(), 'mind-production-seal-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const server = join(root, 'apps/mind/dist/server');
  const client = join(root, 'apps/mind/dist/client');
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

test('build preparation strips maps and retains executable scanning', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'mind-build-preparation-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, 'index.mjs'), 'export default "production";');
  await writeFile(join(root, 'index.mjs.map'), 'process.env.NODE_ENV');
  await assert.rejects(assertServerArtifact(root), /index\.mjs\.map/u);
  await prepareServerArtifact(root);
  await assertServerArtifact(root);
  await writeFile(join(root, 'index.mjs'), 'process.env.NODE_ENV');
  await assert.rejects(prepareServerArtifact(root), /index\.mjs/u);
});
