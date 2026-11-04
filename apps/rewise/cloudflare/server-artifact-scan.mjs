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
    assert.doesNotMatch(source, /process\.env\.NODE_ENV/u, path);
    assert.ok(!source.includes('tuturuuu-local-development'), path);
  }
}
