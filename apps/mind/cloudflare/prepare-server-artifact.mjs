import { readdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { assertServerArtifact } from './server-artifact-scan.mjs';

export async function prepareServerArtifact(directory) {
  const files = await readdir(directory, {
    recursive: true,
    withFileTypes: true,
  });
  for (const file of files) {
    if (file.isFile() && file.name.endsWith('.map')) {
      await unlink(join(file.parentPath, file.name));
    }
  }
  await assertServerArtifact(directory);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await prepareServerArtifact(new URL('../dist/server', import.meta.url));
}
