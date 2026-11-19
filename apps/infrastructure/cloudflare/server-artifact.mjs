import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

export async function inspectServerArtifact(root) {
  const files = (await readdir(root, { recursive: true })).sort();
  const scripts = [];
  let mapBytes = 0;
  for (const name of files) {
    if (!/\.(?:m?js|map)$/u.test(name)) continue;
    const bytes = await readFile(join(root, name));
    const source = bytes.toString('utf8');
    let inspected = source;
    if (name.endsWith('.map')) {
      mapBytes += bytes.length;
      const map = JSON.parse(source);
      assert.equal(map.version, 3, name);
      assert.ok(Array.isArray(map.sources), name);
      assert.equal(typeof map.mappings, 'string', name);
      inspected += JSON.stringify(map);
    } else {
      scripts.push(bytes);
      assert.doesNotMatch(source, /process\.env\.NODE_ENV/u, name);
    }
    assert.ok(!inspected.includes('tuturuuu-local-development'), name);
  }
  assert.ok(scripts.length > 0, 'Missing server JavaScript');
  assert.ok(mapBytes <= 60 * 1024 ** 2, 'Server sourcemaps exceed 60 MiB');
  const script = Buffer.concat(scripts);
  assert.ok(script.length <= 64 * 1024 ** 2, 'Worker exceeds 64 MiB');
  return {
    scriptBytes: script.length,
    scriptGzipBytes: gzipSync(script).length,
    sourcemapBytes: mapBytes,
  };
}
