import { createHash } from 'node:crypto';
import { lstatSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const source = process.argv[2];
if (!/^[a-f0-9]{40}$/.test(source ?? '')) throw new Error('Supply the exact build source SHA');
const root = new URL('../', import.meta.url).pathname;
const files = [];
let totalBytes = 0;
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) throw new Error('Artifact symlinks are not admitted');
    if (stat.isDirectory()) { walk(path); continue; }
    if (!stat.isFile()) throw new Error('Non-regular artifact file');
    totalBytes += stat.size;
    if (files.length >= 10000 || totalBytes > 100 * 1024 * 1024) throw new Error('Artifact size bound exceeded');
    const data = readFileSync(path);
    files.push({ path: relative(root, path), bytes: stat.size, sha256: createHash('sha256').update(data).digest('hex') });
  }
}
walk(join(root, 'dist'));
const configs = files.filter((file) => /(?:^|\/)wrangler\.json$/.test(file.path));
if (configs.length !== 1) throw new Error('Require one actual emitted JSON Worker configuration');
const config = JSON.parse(readFileSync(join(root, configs[0].path), 'utf8'));
if (config.name !== 'tuturuuu-roadmap' || !config.main || !config.assets) throw new Error('Unexpected emitted Worker identity or assets');
if (config.assets.base_path !== '/roadmap') throw new Error('Emitted asset mount must equal /roadmap');
if (!files.some((file) => file.path.startsWith('dist/client/') && file.path.endsWith('.js'))) throw new Error('Client assets are missing');
if (!files.some((file) => /\.[cm]?js$/.test(file.path) && readFileSync(join(root, file.path), 'utf8').includes(source))) throw new Error('Source identity missing from emitted code');
writeFileSync(join(root, 'roadmap-artifact.json'), JSON.stringify({ source, worker: config.name, basePath: '/roadmap', emittedConfig: configs[0].path, files }, null, 2) + '\n');
console.log(`Sealed ${files.length} emitted files for ${source}; this does not attest runtime or deployment`);
