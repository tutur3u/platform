import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateInventory, routeManifest } from './inventory';

const repo = fileURLToPath(new URL('../../../', import.meta.url));
const out = fileURLToPath(
  new URL('../start-route-manifest.json', import.meta.url)
);
const inventory = generateInventory(repo);
const content = execFileSync(
  resolve(repo, 'node_modules/.bin/biome'),
  ['format', '--stdin-file-path', out],
  {
    input: JSON.stringify(routeManifest(inventory)),
    encoding: 'utf8',
    cwd: repo,
    maxBuffer: 16 * 1024 * 1024,
  }
);
if (process.argv.includes('--check')) {
  if (readFileSync(out, 'utf8') !== content)
    throw new Error(
      'Web route inventory is stale. Run bun apps/web/cloudflare/generate-inventory.ts'
    );
} else writeFileSync(out, content);
const artifact = process.argv.indexOf('--artifact');
if (artifact !== -1) {
  const path = process.argv[artifact + 1];
  if (!path || path.startsWith('--'))
    throw new Error('--artifact requires an output path');
  writeFileSync(resolve(path), `${JSON.stringify(inventory, null, 2)}\n`);
}
console.log(JSON.stringify(inventory.summary));
