import { readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectServerArtifact } from './server-artifact.mjs';

export async function prepareServerArtifact(root) {
  for (const name of await readdir(root, { recursive: true })) {
    const path = join(root, name);
    if (name.endsWith('.map')) await rm(path);
    else if (/\.(?:m?js)$/u.test(name)) {
      const source = await readFile(path, 'utf8');
      const clean = source.replace(
        /^\/\/# sourceMappingURL=.*(?:\r?\n|$)/gmu,
        ''
      );
      if (clean !== source) await writeFile(path, clean);
    }
  }
  return inspectServerArtifact(root);
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  console.log(
    JSON.stringify(await prepareServerArtifact(resolve('dist/server')))
  );
}
