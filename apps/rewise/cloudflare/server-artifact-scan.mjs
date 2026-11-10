import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function assertServerArtifact(serverDirectory) {
  const entries = await readdir(serverDirectory, {
    recursive: true,
    withFileTypes: true,
  });
  const files = entries.filter((entry) => entry.isFile());
  assert.ok(files.length > 0, 'The emitted server must contain files');
  for (const file of files) {
    const path = join(file.parentPath, file.name);
    const source = await readFile(path, 'utf8');
    let inspected = source;
    if (file.name.endsWith('.map')) {
      const map = JSON.parse(source);
      assert.ok(
        map?.version === 3 &&
          Array.isArray(map.sources) &&
          typeof map.mappings === 'string',
        `Invalid source map: ${path}`
      );
      // Original sources retain environment branches removed from the executable.
      // Decode JSON escapes so source-map secrets cannot evade the prefix check.
      inspected += JSON.stringify(map);
    } else {
      assert.doesNotMatch(source, /process\.env\.NODE_ENV/u, path);
    }
    assert.ok(!inspected.includes('tuturuuu-local-development'), path);
  }
}
