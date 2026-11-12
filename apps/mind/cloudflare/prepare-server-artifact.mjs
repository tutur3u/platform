import { readdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { assertServerArtifact } from './server-artifact-scan.mjs';

export async function prepareServerArtifact(directory) {
  const files = await readdir(directory, {
    recursive: true,
    withFileTypes: true,
  });
  for (const file of files) {
    if (!file.isFile()) continue;
    const path = join(file.parentPath, file.name);
    if (/\.(?:m?js|cjs)$/u.test(file.name)) {
      const source = await readFile(path, 'utf8');
      const stripped = source
        .replace(
          /^[ \t]*\/\/[#@][ \t]*sourceMappingURL=[^\r\n]*(?:\r?\n|$)/gmu,
          ''
        )
        .replace(/\/\*[#@][ \t]*sourceMappingURL=[\s\S]*?\*\//gu, '');
      if (stripped !== source) await writeFile(path, stripped);
    }
    if (file.name.endsWith('.map')) {
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
