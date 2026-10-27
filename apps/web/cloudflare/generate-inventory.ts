import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateInventory } from './inventory';

const repo = fileURLToPath(new URL('../../../', import.meta.url));
const out = fileURLToPath(
  new URL('../start-route-manifest.json', import.meta.url)
);
const inventory = generateInventory(repo);
const content = execFileSync(
  resolve(repo, 'node_modules/.bin/biome'),
  ['format', '--stdin-file-path', out],
  {
    input: JSON.stringify(inventory),
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
console.log(JSON.stringify(inventory.summary));
