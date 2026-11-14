import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { assertServerArtifact } from './server-artifact-scan.mjs';

const STRIP = 'scripts/ci/strip-server-source-maps.sh';
const repo = fileURLToPath(new URL('../../../', import.meta.url));

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
  assert.equal(removal[1], `${STRIP} apps/rewise/dist/server`);
  assert.match(workflow, /^\s+strip-server-source-maps: true$/mu);
  const native = await readFile(
    new URL(
      '../../../.github/workflows/native-start-app.yaml',
      import.meta.url
    ),
    'utf8'
  );
  assert.ok(
    native.includes(`run: ${STRIP} "$APP_DIR/dist/server"`),
    'the native path strips with the same script'
  );
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
  await writeFile(
    join(server, 'index.mjs'),
    'export default "production";\n//# sourceMappingURL=index.mjs.map\n'
  );
  await writeFile(
    join(server, 'assets/chunk.mjs'),
    'export const chunk = 1;\n//# sourceMappingURL=chunk.mjs.map'
  );
  await writeFile(join(server, 'index.mjs.map'), sourceMap);
  await writeFile(join(server, 'assets/chunk.mjs.map'), sourceMap);
  await writeFile(join(client, 'client.js.map'), sourceMap);
  await assert.rejects(assertServerArtifact(server), /\.map/u);
  execFileSync(join(repo, STRIP), [server]);
  await assertServerArtifact(server);
  // The deploy bundler resolves every remaining reference.
  for (const name of ['index.mjs', 'assets/chunk.mjs'])
    assert.doesNotMatch(
      await readFile(join(server, name), 'utf8'),
      /sourceMappingURL/u,
      name
    );
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
