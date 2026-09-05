import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export async function waitForDeployment(
  check,
  {
    attempts = 12,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  } = {}
) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await check();
    } catch (error) {
      if (attempt >= attempts) throw error;
      console.log(
        `Waiting for Cloudflare rollout (${attempt}/${attempts}): ${error.message}`
      );
      await sleep(5000);
    }
  }
}

async function verifyDeployment() {
  const origin = 'https://colab.tuturuuu.com';
  async function get(path) {
    const response = await fetch(`${origin}${path}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 ColabDeploymentVerifier/1.0' },
      cache: 'no-store',
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
    return response;
  }
  const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
  const assets = await Promise.all(
    (await readdir('dist/assets')).map(async (name) => ({
      name,
      expected: digest(await readFile(`dist/assets/${name}`)),
    }))
  );
  await waitForDeployment(async () => {
    const health = await (await get('/api/health')).json();
    if (health.app !== 'colab' || health.status !== 'ok' || !health.sandbox)
      throw new Error('Unexpected Colab health response');
    for (const { name, expected } of assets) {
      const actual = digest(
        Buffer.from(await (await get(`/assets/${name}`)).arrayBuffer())
      );
      if (actual !== expected) throw new Error(`Asset mismatch: ${name}`);
    }
  });
  console.log('Canonical Colab health and all built asset hashes verified.');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await verifyDeployment();
