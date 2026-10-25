import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../../..');
const sourceRoot = resolve(root, 'apps/web/src/app/api');

async function files(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const children = await Promise.all(
    entries.map((entry) =>
      entry.isDirectory()
        ? files(resolve(directory, entry.name))
        : [resolve(directory, entry.name)]
    )
  );
  return children.flat().filter((file) => file.endsWith('/route.ts'));
}

export async function retainedInventory() {
  return Promise.all(
    (await files(sourceRoot)).sort().map(async (file) => {
      const source = await readFile(file, 'utf8');
      const path = `/api/${relative(sourceRoot, file)
        .replace(/\/route\.ts$/, '')
        .replace(/\[\[\.\.\.([^\]]+)\]\]/g, '{...$1?}')
        .replace(/\[\.\.\.([^\]]+)\]/g, '{...$1}')
        .replace(/\[([^\]]+)\]/g, '{$1}')}`;
      return {
        path,
        source: relative(root, file),
        sourceSha256: createHash('sha256').update(source).digest('hex'),
        runtime: 'retained-next' as const,
        policy: 'retained-next-proxy',
        reason: 'Unflipped; preserve existing Next handler and proxy guards',
      };
    })
  );
}
