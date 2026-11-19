import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { inspectServerArtifact } from './server-artifact.mjs';
import { prepareServerArtifact } from './prepare-server-artifact.mjs';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'infra-scan-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, 'index.mjs'), 'export default {};');
  return root;
}
test('measures executable and source map bytes', async (t) => {
  const root = await fixture(t);
  const map = JSON.stringify({
    version: 3,
    sources: ['source.ts'],
    mappings: '',
    sourcesContent: ['process.env.NODE_ENV'],
  });
  await writeFile(join(root, 'index.mjs.map'), map);
  const result = await inspectServerArtifact(root);
  assert.equal(result.scriptBytes, 18);
  assert.equal(result.sourcemapBytes, Buffer.byteLength(map));
  assert.ok(result.scriptGzipBytes > 0);
});
test('rejects executable development branches and JSON-escaped map secrets', async (t) => {
  const root = await fixture(t);
  await writeFile(join(root, 'index.mjs'), 'process.env.NODE_ENV');
  await assert.rejects(inspectServerArtifact(root), /index.mjs/);
  await writeFile(join(root, 'index.mjs'), 'export default {};');
  const map = JSON.stringify({
    version: 3,
    sources: [],
    mappings: '',
    sourcesContent: ['tuturuuu-local-development-secret'],
  }).replace('tuturuuu', '\\u0074uturuuu');
  await writeFile(join(root, 'index.mjs.map'), map);
  await assert.rejects(inspectServerArtifact(root), /index.mjs.map/);
});

test('preparation removes server maps and references idempotently', async (t) => {
  const root = await fixture(t);
  await writeFile(
    join(root, 'index.mjs'),
    'export default {};\n//# sourceMappingURL=index.mjs.map\n'
  );
  await writeFile(
    join(root, 'index.mjs.map'),
    JSON.stringify({ sourcesContent: ['tuturuuu-local-development-secret'] })
  );
  const first = await prepareServerArtifact(root);
  assert.equal(first.sourcemapBytes, 0);
  assert.equal(first.scriptBytes, 19);
  assert.deepEqual(await prepareServerArtifact(root), first);
});
