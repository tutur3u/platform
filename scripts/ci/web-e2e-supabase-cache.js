const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { assertAdmission } = require('./hosted-web-e2e-admission');
const {
  imageList,
  cacheKey,
  verifyLoadedImages,
  pullImage,
  MAX_ARCHIVE_BYTES,
} = require('./supabase-image-cache');
const { catalogPin, tagPinned } = require('./supabase-image-cache-seed');
const data = require('./supabase-image-cache-seed-data.json');

const ROOT = path.resolve(__dirname, '../..');
const REGISTRY = 'public.ecr.aws';
const RESERVE = 512 * 1024 ** 2;
function stop(code) {
  throw new Error(`E2E_IMAGES_${code}`);
}
function saveAllowed(env) {
  return (
    env.GITHUB_EVENT_NAME === 'push' &&
    env.GITHUB_REF === 'refs/heads/main' &&
    env.GITHUB_REPOSITORY === 'tutur3u/platform' &&
    !!env.GITHUB_ACTOR &&
    env.GITHUB_ACTOR !== 'dependabot[bot]'
  );
}
function identity({ services, cliVersion, config, lock, platform, arch }) {
  const catalog = `cli-${cliVersion}`;
  const images = imageList({
    services,
    cliVersion,
    config,
    registry: REGISTRY,
    profile: 'full',
  });
  const pins = images.map((image) => ({
    image,
    ...catalogPin(catalog, image),
  }));
  const base = cacheKey({
    images,
    registry: REGISTRY,
    platform,
    arch,
    catalog,
  });
  const digest = createHash('sha256')
    .update(
      JSON.stringify({
        base,
        cliVersion,
        platform,
        arch,
        pins,
        lock: createHash('sha256').update(lock).digest('hex'),
        config: createHash('sha256').update(config).digest('hex'),
      })
    )
    .digest('hex');
  if (!/^[a-f0-9]{64}$/.test(digest)) stop('IDENTITY');
  return { catalog, images, digest };
}
function mirrorFor(image, pin) {
  const mirror = Object.hasOwn(data.fallbacks, image) && data.fallbacks[image];
  return mirror &&
    /^ghcr\.io\/supabase\/[a-z0-9-]+$/.test(mirror.repository) &&
    mirror.amd64 === pin.amd64 &&
    mirror.config === pin.config
    ? mirror
    : null;
}

async function execute(mode, options, progress) {
  const env = options.env || process.env;
  // Admission precedes filesystem, CLI, Docker and credential access.
  assertAdmission(env);
  progress.phase = 'context-validation';
  if (!['key', 'login', 'prepare', 'cleanup'].includes(mode)) stop('MODE');
  const io = options.fs || fs;
  const spawn = options.spawn || spawnSync;
  const now = options.now || Date.now;
  const pull = options.pullImage || pullImage;
  const platform = options.platform || process.platform;
  const arch = options.arch || process.arch;
  if (platform !== 'linux' || arch !== 'x64' || env.RUNNER_ARCH !== 'X64')
    stop('PLATFORM');
  if (
    !env.RUNNER_TEMP ||
    !path.isAbsolute(env.RUNNER_TEMP) ||
    /[\r\n\0]/.test(env.RUNNER_TEMP)
  )
    stop('TEMP');
  const directory = path.join(env.RUNNER_TEMP, 'web-e2e-supabase-images');
  const auth = path.join(env.RUNNER_TEMP, 'web-e2e-supabase-registry-auth');
  const archive = path.join(directory, 'images.tar');
  const manifest = path.join(directory, 'metadata.json');
  const budget = env.GITHUB_EVENT_NAME === 'schedule' ? 120_000 : 600_000;
  const deadline = now() + budget;
  const remaining = () => {
    const value = deadline - now();
    if (value <= 0) stop('DEADLINE');
    return value;
  };
  const command = (name, args, timeout = 10_000, extra = {}) => {
    const result = spawn(name, args, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: Math.min(timeout, remaining()),
      maxBuffer: 4 * 1024 ** 2,
      env: { ...env, DOCKER_CONFIG: auth },
      ...extra,
    });
    if (result.status !== 0) stop('COMMAND');
    return (result.stdout || '').trim();
  };
  const output = (name, value) =>
    io.appendFileSync(env.GITHUB_OUTPUT, `${name}=${value}\n`);
  const unlink = (file) => {
    if (io.existsSync(file)) io.unlinkSync(file);
  };
  if (mode === 'cleanup') {
    progress.phase = 'cleanup';
    unlink(archive);
    unlink(path.join(auth, 'config.json'));
    // Never recurse: unexpected files are retained and fail closed.
    if (io.existsSync(auth)) io.rmdirSync(auth);
    io.appendFileSync(env.GITHUB_ENV, 'DOCKER_CONFIG=\n');
    return;
  }
  if (mode === 'login') {
    progress.phase = 'registry-login';
    if (
      !env.GHCR_TOKEN ||
      !/^[a-zA-Z0-9-]+(?:\[bot\])?$/.test(env.GITHUB_ACTOR || '')
    )
      stop('LOGIN_INPUT');
    io.mkdirSync(auth, { mode: 0o700 });
    io.writeFileSync(path.join(auth, 'config.json'), '{}', {
      mode: 0o600,
      flag: 'wx',
    });
    try {
      command(
        'docker',
        [
          'login',
          'ghcr.io',
          '--username',
          env.GITHUB_ACTOR,
          '--password-stdin',
        ],
        30_000,
        {
          input: env.GHCR_TOKEN,
          env: { ...env, GHCR_TOKEN: '', DOCKER_CONFIG: auth },
        }
      );
      io.chmodSync(path.join(auth, 'config.json'), 0o600);
      io.appendFileSync(env.GITHUB_ENV, `DOCKER_CONFIG=${auth}\n`);
    } catch {
      stop('LOGIN');
    }
    return;
  }
  const database = path.join(ROOT, 'apps/database');
  progress.phase = 'identity';
  const cli = (...args) =>
    command(
      process.execPath,
      [path.join(database, 'scripts/run-supabase.js'), ...args],
      30_000,
      { cwd: database }
    );
  const current = identity({
    cliVersion: cli('--version'),
    services: JSON.parse(cli('services', '-o', 'json')),
    config: io.readFileSync(
      path.join(database, 'supabase/config.toml'),
      'utf8'
    ),
    lock: io.readFileSync(path.join(ROOT, 'bun.lock')),
    platform,
    arch,
  });
  if (mode === 'key') {
    io.mkdirSync(directory, { recursive: true, mode: 0o700 });
    io.writeFileSync(manifest, JSON.stringify(current), { mode: 0o600 });
    io.chmodSync(manifest, 0o600);
    output('digest', current.digest);
    return;
  }
  progress.phase = 'metadata-validation';
  if (io.readFileSync(manifest, 'utf8') !== JSON.stringify(current))
    stop('METADATA');
  output('archive-ready', 'false');
  const imageSpawn = (name, args, settings = {}) =>
    spawn(name, args, {
      ...settings,
      timeout: Math.min(settings.timeout || 10_000, remaining()),
      env: { ...env, GHCR_TOKEN: '', DOCKER_CONFIG: auth },
    });
  const verifyOptions = { spawn: imageSpawn, deadline, now };
  if (env.IMAGE_CACHE_HIT === 'true') {
    progress.phase = 'archive-restore';
    const size = io.statSync(archive).size;
    try {
      if (size <= 0 || size > MAX_ARCHIVE_BYTES) stop('ARCHIVE_SIZE');
      command('docker', ['load', '--input', archive], 180_000);
      verifyLoadedImages(current.images, current.catalog, verifyOptions);
    } finally {
      unlink(archive);
    }
    return;
  }
  // No seedContext override: generic trust and budget admission remain unchanged.
  progress.phase = 'image-pull';
  for (const image of current.images) {
    remaining();
    const pin = catalogPin(current.catalog, image);
    const mirror = mirrorFor(image, pin);
    let result;
    if (mirror) {
      const source = `${mirror.repository}:${image.slice(image.lastIndexOf(':') + 1)}`;
      result = await pull(source, {
        pin: mirror,
        deadline: Math.min(deadline, now() + 30_000),
        budget: 120_000,
        now,
        spawn: imageSpawn,
        stderr: { write() {} },
        retryOptions: { maxAttempts: 1 },
      });
      if (result.code === 0) tagPinned(source, image, verifyOptions);
    }
    if (!result || result.code !== 0) {
      remaining();
      result = await pull(image, {
        pin,
        deadline,
        budget: 120_000,
        now,
        spawn: imageSpawn,
        stderr: { write() {} },
        retryOptions: { maxAttempts: 2 },
      });
    }
    if (result.code !== 0) stop('PULL');
  }
  progress.phase = 'image-verification';
  verifyLoadedImages(current.images, current.catalog, verifyOptions);
  if (!saveAllowed(env)) return;
  try {
    progress.phase = 'archive-export';
    const bytes = current.images.reduce(
      (sum, image) =>
        sum +
        Number(
          command('docker', [
            'image',
            'inspect',
            '--format',
            '{{.Size}}',
            image,
          ])
        ),
      0
    );
    if (!Number.isFinite(bytes) || bytes <= 0) stop('IMAGE_SIZE');
    if (bytes > MAX_ARCHIVE_BYTES - RESERVE) return;
    const disk = io.statfsSync(directory);
    if (Number(disk.bavail) * Number(disk.bsize) < bytes + RESERVE) return;
    command(
      'docker',
      ['save', '--output', archive, ...current.images],
      180_000
    );
    const size = io.statSync(archive).size;
    if (size <= 0 || size > MAX_ARCHIVE_BYTES) {
      unlink(archive);
      return;
    }
    remaining();
    output('archive-ready', 'true');
  } catch {
    unlink(archive);
  }
}
async function main(mode, options = {}) {
  const progress = { phase: 'admission' };
  try {
    return await execute(mode, options, progress);
  } catch (error) {
    error.phase = progress.phase;
    throw error;
  }
}
if (require.main === module)
  main(process.argv[2]).catch((error) => {
    const code = /^E2E_IMAGES_[A-Z_]+$/.test(error.message)
      ? error.message
      : 'E2E_IMAGES_FAILED';
    console.error(JSON.stringify({ code, phase: error.phase || 'admission' }));
    process.exitCode = 1;
  });
module.exports = { main, identity, mirrorFor, saveAllowed };
