const { spawnSync } = require('node:child_process');
const data = require('./supabase-image-cache-seed-data.json');

// Official GoTrue publications have identical OCI indexes on ECR and GHCR.
// https://github.com/supabase/auth/blob/master/.github/workflows/publish.yml
// Catalog tags: CLI v2.121.0 pkg/config/templates/Dockerfile.
// Index/platform/config digests were resolved by anonymous manifest GETs.
function seedCatalog(
  name,
  { trusted, budget, registry, platform, arch, profile }
) {
  if (!name || name === 'current') return null;
  if (
    !trusted ||
    budget !== 600_000 ||
    registry !== 'public.ecr.aws' ||
    platform !== 'linux' ||
    arch !== 'x64' ||
    !Object.hasOwn(data.catalogs, name) ||
    !Object.hasOwn(data.catalogs[name].profiles, profile)
  )
    throw new Error('Unsupported or untrusted seed catalog');
  return [...data.catalogs[name].profiles[profile]];
}

function catalogPin(name, image) {
  const catalog = Object.hasOwn(data.catalogs, name) && data.catalogs[name];
  if (!catalog || !Object.hasOwn(catalog.images, image))
    throw new Error('Image is outside the fixed seed catalog');
  return catalog.images[image];
}

function fallbackPin(image, { trusted, budget, platform, arch }) {
  if (!trusted || budget !== 600_000 || platform !== 'linux' || arch !== 'x64')
    return null;
  return Object.hasOwn(data.fallbacks, image) ? data.fallbacks[image] : null;
}

function digestReference(image, pin) {
  return `${image.split('@')[0].replace(/:[^/]+$/, '')}@${pin.amd64}`;
}

function verifyPinned(
  image,
  pin,
  { spawn = spawnSync, deadline, now = Date.now }
) {
  const remaining = deadline - now();
  if (remaining <= 0) throw new Error('Seed deadline exhausted');
  const result = spawn('docker', ['image', 'inspect', image], {
    encoding: 'utf8',
    timeout: Math.min(10_000, remaining),
    maxBuffer: 1024 * 1024,
  });
  if (result.status !== 0) throw new Error('Seed image inspection failed');
  const [local] = JSON.parse(result.stdout);
  const expected = [digestReference(image, pin)];
  const alternate =
    Object.hasOwn(data.fallbacks, image) && data.fallbacks[image];
  if (
    alternate &&
    alternate.amd64 === pin.amd64 &&
    alternate.config === pin.config
  )
    expected.push(`${alternate.repository}@${alternate.amd64}`);
  if (
    local?.Os !== 'linux' ||
    local?.Architecture !== 'amd64' ||
    local?.Id !== pin.config ||
    !local?.RepoDigests?.some((ref) => expected.includes(ref))
  )
    throw new Error('Seed platform digest mismatch');
}

function tagPinned(source, image, options) {
  const remaining = options.deadline - (options.now || Date.now)();
  if (remaining <= 0) throw new Error('Seed deadline exhausted');
  const result = (options.spawn || spawnSync)(
    'docker',
    ['tag', source, image],
    {
      encoding: 'utf8',
      timeout: Math.min(10_000, remaining),
      maxBuffer: 1024 * 1024,
    }
  );
  if (result.status !== 0) throw new Error('Seed canonical image tag failed');
}

module.exports = {
  seedCatalog,
  catalogPin,
  fallbackPin,
  digestReference,
  verifyPinned,
  tagPinned,
};
