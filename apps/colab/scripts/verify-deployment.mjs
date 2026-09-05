import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';

const origin = 'https://colab.tuturuuu.com';
async function get(path) {
  const response = await fetch(`${origin}${path}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 ColabDeploymentVerifier/1.0' },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response;
}
const health = await (await get('/api/health')).json();
if (health.app !== 'colab' || health.status !== 'ok' || !health.sandbox)
  throw new Error('Unexpected Colab health response');
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
for (const name of await readdir('dist/assets')) {
  const expected = digest(await readFile(`dist/assets/${name}`));
  const actual = digest(
    Buffer.from(await (await get(`/assets/${name}`)).arrayBuffer())
  );
  if (actual !== expected) throw new Error(`Asset mismatch: ${name}`);
}
console.log('Canonical Colab health and all built asset hashes verified.');
