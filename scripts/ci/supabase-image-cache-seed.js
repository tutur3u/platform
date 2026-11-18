const { spawnSync } = require('node:child_process');
const data = require('./supabase-image-cache-seed-data.json');
const DIGEST = /^sha256:[a-f0-9]{64}$/;

// Official GHCR publications are qualified against canonical ECR content.
// Regenerate metadata with supabase-image-cache-registry.js; see the CI runbook.
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

function verifyPinnedContent(
  image,
  pin,
  { spawn = spawnSync, deadline, now = Date.now }
) {
  if (!/^sha256:[a-f0-9]{64}$/.test(pin?.config || ''))
    throw new Error('Invalid seed content pin');
  if (pin.index !== undefined && !DIGEST.test(pin.index || ''))
    throw new Error('Invalid seed content pin');
  const remaining = deadline - now();
  if (remaining <= 0) throw new Error('Seed deadline exhausted');
  const result = spawn('docker', ['image', 'inspect', image], {
    encoding: 'utf8',
    timeout: Math.min(10_000, remaining),
    maxBuffer: 1024 * 1024,
  });
  if (result.status !== 0) throw new Error('Seed image inspection failed');
  const [local] = JSON.parse(result.stdout);
  // The config digest binds runtime settings and uncompressed filesystem layers.
  // The classic image store reports it as Id; the containerd image store reports
  // the pinned index digest, which is content-addressed over the same config.
  if (
    local?.Os !== 'linux' ||
    local?.Architecture !== 'amd64' ||
    ![pin.config, pin.index].filter(Boolean).includes(local?.Id)
  )
    throw new Error('Seed platform digest mismatch');
  return local;
}

function verifyPinned(image, pin, options) {
  const local = verifyPinnedContent(image, pin, options);
  const expected = [digestReference(image, pin)];
  const repository = image.split('@')[0].replace(/:[^/]+$/, '');
  if (pin.index) expected.push(`${repository}@${pin.index}`);
  const alternate =
    Object.hasOwn(data.fallbacks, image) && data.fallbacks[image];
  if (
    alternate &&
    alternate.amd64 === pin.amd64 &&
    alternate.config === pin.config
  ) {
    expected.push(`${alternate.repository}@${alternate.amd64}`);
    if (alternate.index && alternate.index === pin.index)
      expected.push(`${alternate.repository}@${alternate.index}`);
  }
  if (!local?.RepoDigests?.some((ref) => expected.includes(ref)))
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
  verifyPinnedContent,
  verifyPinned,
  tagPinned,
};
