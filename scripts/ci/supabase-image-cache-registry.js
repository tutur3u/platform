const { createHash } = require('node:crypto');
const { setTimeout: sleep } = require('node:timers/promises');

const ACCEPT = [
  'application/vnd.oci.image.index.v1+json',
  'application/vnd.docker.distribution.manifest.list.v2+json',
  'application/vnd.oci.image.manifest.v1+json',
  'application/vnd.docker.distribution.manifest.v2+json',
].join(', ');
const SERVICES = new Set([
  'postgres',
  'kong',
  'mailpit',
  'postgrest',
  'postgres-meta',
  'studio',
  'imgproxy',
  'gotrue',
  'realtime',
  'storage-api',
]);

async function get(url, headers = {}) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(30000),
    });
    if (response.ok) return Buffer.from(await response.arrayBuffer());
    await response.body?.cancel();
    if (![429, 500, 502, 503, 504].includes(response.status) || attempt === 2)
      throw new Error(`Registry metadata HTTP ${response.status}`);
    await sleep(2000 * (attempt + 1));
  }
}

function manifestPin(indexBytes, platformBytes) {
  const digest = (bytes) =>
    `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  const index = digest(indexBytes);
  const document = JSON.parse(indexBytes);
  const amd64 = document.manifests
    ? document.manifests.find(
        (entry) =>
          entry.platform?.os === 'linux' &&
          entry.platform?.architecture === 'amd64'
      )?.digest
    : index;
  if (!amd64) throw new Error('Missing linux/amd64 registry manifest');
  const bytes = platformBytes || indexBytes;
  if (digest(bytes) !== amd64)
    throw new Error('Registry manifest digest mismatch');
  const config = JSON.parse(bytes).config?.digest;
  if (!/^sha256:[a-f0-9]{64}$/.test(config))
    throw new Error('Missing registry config digest');
  return { index, amd64, config };
}

async function registryPin(host, repository, tag) {
  const auth = JSON.parse(
    await get(
      `https://${host}/token?service=${host}&scope=repository:${repository}:pull`
    )
  );
  const headers = {
    Authorization: `Bearer ${auth.token || auth.access_token}`,
    Accept: ACCEPT,
  };
  const base = `https://${host}/v2/${repository}/manifests/`;
  const bytes = await get(`${base}${tag}`, headers);
  const document = JSON.parse(bytes);
  const platform = document.manifests?.find(
    (entry) =>
      entry.platform?.os === 'linux' && entry.platform?.architecture === 'amd64'
  );
  return manifestPin(
    bytes,
    platform ? await get(`${base}${platform.digest}`, headers) : undefined
  );
}

function sameContent(canonical, alternate) {
  return (
    canonical.amd64 === alternate.amd64 && canonical.config === alternate.config
  );
}

function seedImages(dockerfile) {
  const images = new Map();
  for (const match of dockerfile.matchAll(
    /^FROM [\w/-]+\/([\w-]+):([\w.-]+) AS (\w+)/gm
  )) {
    if (!SERVICES.has(match[1]) || ['pg14', 'pg15'].includes(match[3]))
      continue;
    if (images.has(match[1]))
      throw new Error('Duplicate seed service metadata');
    images.set(match[1], `supabase/${match[1]}:${match[2]}`);
  }
  if (images.size !== SERVICES.size)
    throw new Error('Incomplete seed service metadata');
  return [...images.values()];
}

async function main() {
  const images = new Set();
  for (const version of ['2.117.0', '2.121.0']) {
    const dockerfile = await get(
      `https://raw.githubusercontent.com/supabase/cli/v${version}/apps/cli-go/pkg/config/templates/Dockerfile`
    );
    for (const image of seedImages(dockerfile.toString())) images.add(image);
  }
  const results = [];
  for (const image of [...images].sort()) {
    const [repository, tag] = image.split(':');
    const result = { image: `public.ecr.aws/${image}` };
    for (const host of ['public.ecr.aws', 'ghcr.io']) {
      try {
        result[host] = await registryPin(host, repository, tag);
      } catch (error) {
        result[host] = { error: error.message };
      }
    }
    result.qualified =
      !result['public.ecr.aws'].error &&
      !result['ghcr.io'].error &&
      sameContent(result['public.ecr.aws'], result['ghcr.io']);
    results.push(result);
  }
  console.log(JSON.stringify(results, null, 2));
  if (results.some((result) => !result.qualified)) process.exitCode = 1;
}

if (require.main === module)
  main().catch(() => {
    console.error('Registry metadata qualification failed');
    process.exitCode = 1;
  });

module.exports = { manifestPin, sameContent, seedImages };
