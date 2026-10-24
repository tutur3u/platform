const { createHash } = require('node:crypto');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { setTimeout: sleep } = require('node:timers/promises');
const {
  seedCatalog,
  catalogPin,
  fallbackPin,
  digestReference,
  verifyPinned,
  tagPinned,
} = require('./supabase-image-cache-seed.js');

// CLI embeds pkg/config/templates/Dockerfile. `services` omits these images.
// https://github.com/supabase/cli/blob/v2.117.0/apps/cli-go/pkg/config/templates/Dockerfile
const SUPPLEMENTAL = {
  version: '2.117.0',
  images: { kong: '2.8.1', mailpit: 'v1.30.2', imgproxy: 'v3.8.0' },
};
const MAX_ARCHIVE_BYTES = 6 * 1024 ** 3;
const PROFILES = {
  contract: ['postgres', 'postgres-meta', 'gotrue', 'realtime', 'storage-api'],
  'contract-http': [
    'postgres',
    'postgres-meta',
    'gotrue',
    'kong',
    'postgrest',
    'realtime',
    'storage-api',
  ],
};

function enabled(config, section) {
  const body = config.split(`[${section}]`)[1]?.split(/^[ \t]*\[/m)[0];
  const value = body?.match(/^enabled\s*=\s*(true|false)\s*(?:#.*)?$/m)?.[1];
  if (!value)
    throw new Error(`Missing explicit service configuration: ${section}`);
  return value === 'true';
}

function imageList({ services, cliVersion, registry, profile, config = '' }) {
  if (!['public.ecr.aws', 'ghcr.io'].includes(registry))
    throw new Error('Unsupported Supabase image registry');
  if (cliVersion !== SUPPLEMENTAL.version)
    throw new Error(
      'Review supplemental image pins for the installed Supabase CLI'
    );
  let names = PROFILES[profile];
  if (profile === 'full') {
    names = ['postgres', 'postgres-meta'];
    for (const [section, images] of [
      ['api', ['kong', 'postgrest']],
      ['auth', ['gotrue']],
      ['realtime', ['realtime']],
      ['studio', ['studio']],
      ['inbucket', ['mailpit']],
      ['storage', ['storage-api', 'imgproxy']],
    ])
      if (enabled(config, section)) names.push(...images);
    // These profiles intentionally exclude edge runtime, analytics and pooling.
    for (const section of ['edge_runtime', 'analytics', 'db.pooler'])
      if (enabled(config, section))
        throw new Error(`Uncached service enabled: ${section}`);
  }
  if (!names) throw new Error('Unknown Supabase image profile');
  const versions = new Map(Object.entries(SUPPLEMENTAL.images));
  for (const service of services) {
    if (
      !/^[a-z0-9-]+\/[a-z0-9-]+$/.test(service.name) ||
      !/^[\w.-]+$/.test(service.local)
    )
      throw new Error('Invalid CLI image metadata');
    const name = service.name.split('/').at(-1);
    if (versions.has(name)) throw new Error('Duplicate CLI image metadata');
    versions.set(name, service.local);
  }
  return [...new Set(names)].sort().map((name) => {
    const tag = versions.get(name);
    if (!tag) throw new Error(`Missing CLI image metadata: ${name}`);
    // GetRegistryImageUrl rewrites even postgrest/postgrest to /supabase/.
    return `${registry}/supabase/${name}:${tag}`;
  });
}

function cacheKey({ images, registry, platform, arch }) {
  if (!images.length || !registry || !platform || !arch)
    throw new Error('Missing image cache identity');
  return `supabase-images-v1-${createHash('sha256')
    .update(
      JSON.stringify({
        images: [...new Set(images)].sort(),
        registry,
        platform,
        arch,
      })
    )
    .digest('hex')}`;
}

function subsetImages(options) {
  const images = imageList(options);
  const contract = imageList({ ...options, profile: 'contract' });
  return contract.length < images.length &&
    contract.every((image) => images.includes(image))
    ? contract
    : [];
}

function missingImages(images, inspect = spawnSync) {
  return images.filter(
    (image) =>
      inspect('docker', ['image', 'inspect', image], {
        stdio: 'ignore',
        timeout: 10_000,
      }).status !== 0
  );
}

function trustedSave(eventName, ref) {
  return (
    ref === 'refs/heads/main' &&
    ['push', 'workflow_dispatch'].includes(eventName)
  );
}

function pullBudget(seconds, eventName, ref) {
  if (seconds === '600' && trustedSave(eventName, ref)) return 600_000;
  if (seconds !== undefined && seconds !== '120')
    throw new Error('Extended pull budget requires a trusted main run');
  return 120_000;
}
function output(name, value) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}
function command(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 120_000,
    maxBuffer: 4 * 1024 * 1024,
    ...options,
  }).trim();
}
function archiveSize(file) {
  const size = fs.statSync(file).size;
  if (size <= 0 || size > MAX_ARCHIVE_BYTES)
    throw new Error('Image archive exceeds 6 GiB bound or is empty');
}
async function pullImage(
  image,
  {
    deadline,
    budget,
    now = Date.now,
    spawn = spawnSync,
    retryOptions = {},
    stderr = process.stderr,
    seedContext = {},
    pin,
  }
) {
  const {
    retryImagePull,
    imagePullFailureMessage,
    isTransientImagePullFailure,
    imagePullIdentity,
  } = await import(
    pathToFileURL(
      path.resolve(
        __dirname,
        '../../apps/database/scripts/run-supabase-image-retry.js'
      )
    )
  );
  let attempts = 0;
  let diagnostic = '';
  const alternate = fallbackPin(image, seedContext);
  let useAlternate = false;
  const result = await retryImagePull(
    async () => {
      const remaining = deadline - now();
      if (remaining <= 0)
        return { code: 1, signal: 'SIGTERM', stderr: diagnostic };
      attempts++;
      if (
        useAlternate &&
        pin &&
        (pin.amd64 !== alternate.amd64 || pin.config !== alternate.config)
      ) {
        diagnostic = 'Seed alternate differs from canonical image content';
        return { code: 1, stderr: diagnostic };
      }
      const activePin = useAlternate ? alternate : pin;
      const source = useAlternate
        ? `${alternate.repository}@${alternate.amd64}`
        : pin
          ? digestReference(image, pin)
          : image;
      const pull = spawn(
        'docker',
        ['pull', ...(activePin ? ['--platform', 'linux/amd64'] : []), source],
        {
          encoding: 'utf8',
          timeout: Math.min(90_000, remaining),
          maxBuffer: 1024 * 1024,
        }
      );
      diagnostic = `failed to pull docker image ${image}: ${pull.stderr ?? ''}`;
      if (pull.status === 0 && activePin) {
        try {
          const options = { spawn, deadline, now };
          verifyPinned(source, activePin, options);
          tagPinned(source, image, options);
        } catch {
          diagnostic = 'Seed image verification or canonical tagging failed';
          return { code: 1, stderr: diagnostic };
        }
      }
      if (useAlternate) {
        // The fallback occupies one existing retry slot and is never retried.
        if (pull.status !== 0) diagnostic = 'Official seed transport failed';
      } else if (
        pull.status !== 0 &&
        alternate &&
        isTransientImagePullFailure(diagnostic) &&
        /toomanyrequests|too many requests|rate exceeded|\b(?:HTTP(?: status)?[: ]+)?429\b/i.test(
          pull.stderr ?? ''
        )
      )
        useAlternate = true;
      return {
        code: pull.status ?? 1,
        signal: pull.signal,
        stderr: diagnostic,
      };
    },
    {
      maxAttempts: budget > 120_000 ? 7 : 3,
      baseDelayMs: budget > 120_000 ? 10000 : 2000,
      maxDelayMs: budget > 120_000 ? 120000 : 5000,
      stderr: { write() {} },
      ...retryOptions,
      sleepMs: (milliseconds) =>
        (retryOptions.sleepMs || sleep)(
          Math.min(milliseconds, Math.max(0, deadline - now()))
        ),
    }
  );
  if (result.code !== 0) {
    stderr.write(
      isTransientImagePullFailure(diagnostic) || result.signal
        ? imagePullFailureMessage(diagnostic, attempts, image)
        : `Supabase image pull failed${imagePullIdentity(image)}.\n`
    );
    stderr.write(
      'Supabase image cache miss could not be filled. Seed from a trusted main run with registry access.\n'
    );
  }
  return result;
}

async function main(mode) {
  const root = path.resolve(__dirname, '../..');
  const database = path.resolve(
    root,
    // biome-ignore lint/suspicious/noUndeclaredEnvVars: Direct composite action input, outside Turbo.
    process.env.IMAGE_DATABASE || 'apps/database'
  );
  const directory = path.join(process.env.RUNNER_TEMP, 'supabase-images');
  const manifest = path.join(directory, 'images.json');
  const archive = path.join(directory, 'images.tar');
  if (mode === 'key') {
    const cli = (...args) =>
      command(
        process.execPath,
        [path.join(database, 'scripts/run-supabase.js'), ...args],
        { cwd: database }
      );
    // biome-ignore lint/suspicious/noUndeclaredEnvVars: Direct composite action input, outside Turbo.
    const registry = process.env.SUPABASE_INTERNAL_IMAGE_REGISTRY;
    // biome-ignore lint/suspicious/noUndeclaredEnvVars: Direct composite action input, outside Turbo.
    const profile = process.env.IMAGE_PROFILE;
    const trusted = trustedSave(
      process.env.GITHUB_EVENT_NAME,
      process.env.GITHUB_REF
    );
    // biome-ignore lint/suspicious/noUndeclaredEnvVars: Direct composite action input, outside Turbo.
    const catalog = process.env.IMAGE_SEED_CATALOG;
    // biome-ignore lint/suspicious/noUndeclaredEnvVars: Direct composite action input, outside Turbo.
    const seedBudget = process.env.IMAGE_PULL_BUDGET_SECONDS;
    const fixed = seedCatalog(catalog, {
      trusted,
      budget: pullBudget(
        seedBudget,
        process.env.GITHUB_EVENT_NAME,
        process.env.GITHUB_REF
      ),
      registry,
      platform: process.platform,
      arch: process.arch,
      profile,
    });
    const options = fixed
      ? null
      : {
          services: JSON.parse(cli('services', '-o', 'json')),
          cliVersion: cli('--version'),
          registry,
          profile,
          config: fs.readFileSync(
            path.join(database, 'supabase/config.toml'),
            'utf8'
          ),
        };
    const images = fixed || imageList(options);
    const subset = fixed
      ? seedCatalog(catalog, {
          trusted,
          budget: 600_000,
          registry,
          platform: process.platform,
          arch: process.arch,
          profile: 'contract',
        }).filter(() => profile !== 'contract')
      : subsetImages(options);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(manifest, JSON.stringify(images));
    output(
      'key',
      cacheKey({
        images,
        registry,
        platform: process.platform,
        arch: process.arch,
      })
    );
    if (subset.length) {
      fs.writeFileSync(
        path.join(directory, 'subset.json'),
        JSON.stringify(subset)
      );
      output(
        'subset-key',
        cacheKey({
          images: subset,
          registry,
          platform: process.platform,
          arch: process.arch,
        })
      );
    }
    output(
      'save',
      String(trustedSave(process.env.GITHUB_EVENT_NAME, process.env.GITHUB_REF))
    );
    return;
  }
  const images = JSON.parse(fs.readFileSync(manifest, 'utf8'));
  if (mode === 'load' || mode === 'load-subset') {
    const loadedImages =
      mode === 'load'
        ? images
        : JSON.parse(
            fs.readFileSync(path.join(directory, 'subset.json'), 'utf8')
          );
    if (
      !loadedImages.length ||
      !loadedImages.every((image) => images.includes(image))
    )
      throw new Error('Invalid image subset');
    archiveSize(archive);
    command('docker', ['load', '--input', archive], { timeout: 180_000 });
    for (const image of loadedImages)
      command('docker', ['image', 'inspect', image]);
    console.log(
      `Loaded and verified ${loadedImages.length} cached Supabase images.`
    );
    return;
  }
  if (mode !== 'pull')
    throw new Error('Usage: supabase-image-cache.js key|load|load-subset|pull');
  const budget = pullBudget(
    // biome-ignore lint/suspicious/noUndeclaredEnvVars: Direct composite action input, outside Turbo.
    process.env.IMAGE_PULL_BUDGET_SECONDS,
    process.env.GITHUB_EVENT_NAME,
    process.env.GITHUB_REF
  );
  const deadline = Date.now() + budget;
  const trusted = trustedSave(
    process.env.GITHUB_EVENT_NAME,
    process.env.GITHUB_REF
  );
  const seedContext = {
    trusted,
    budget,
    platform: process.platform,
    arch: process.arch,
  };
  // biome-ignore lint/suspicious/noUndeclaredEnvVars: Direct composite action input, outside Turbo.
  const catalog = process.env.IMAGE_SEED_CATALOG;
  const fixed = seedCatalog(catalog, {
    ...seedContext,
    // biome-ignore lint/suspicious/noUndeclaredEnvVars: Direct composite action input, outside Turbo.
    profile: process.env.IMAGE_PROFILE,
    // biome-ignore lint/suspicious/noUndeclaredEnvVars: Direct composite action input, outside Turbo.
    registry: process.env.SUPABASE_INTERNAL_IMAGE_REGISTRY,
  });
  if (fixed && JSON.stringify(fixed) !== JSON.stringify(images))
    throw new Error('Seed image catalog changed between steps');
  const missing = fixed
    ? images.filter((image) => {
        try {
          verifyPinned(image, catalogPin(catalog, image), { deadline });
          return false;
        } catch {
          return true;
        }
      })
    : missingImages(images);
  for (const image of missing) {
    const result = await pullImage(image, {
      deadline,
      budget,
      seedContext,
      pin: fixed ? catalogPin(catalog, image) : undefined,
    });
    if (result.code !== 0) throw new Error('Supabase image cache miss');
  }
  if (fixed)
    for (const image of images)
      verifyPinned(image, catalogPin(catalog, image), { deadline });
  // biome-ignore lint/suspicious/noUndeclaredEnvVars: Direct composite action input, outside Turbo.
  if (process.env.IMAGE_SAVE !== 'true' || !trusted) return;
  const bytes = images.reduce(
    (sum, image) =>
      sum +
      Number(
        command('docker', ['image', 'inspect', '--format', '{{.Size}}', image])
      ),
    0
  );
  if (!Number.isFinite(bytes) || bytes > MAX_ARCHIVE_BYTES - 64 * 1024 ** 2)
    throw new Error('Supabase image set exceeds archive size budget');
  command('docker', ['save', '--output', archive, ...images], {
    timeout: 180_000,
  });
  archiveSize(archive);
}
function configurationDiagnostic(error) {
  if (!(error instanceof Error)) return undefined;
  const message = error.message;
  if (
    [
      'Unsupported Supabase image registry',
      'Review supplemental image pins for the installed Supabase CLI',
      'Unknown Supabase image profile',
      'Invalid CLI image metadata',
      'Duplicate CLI image metadata',
      'Missing image cache identity',
    ].includes(message) ||
    /^(?:Uncached service enabled|Missing explicit service configuration): (?:api|auth|realtime|studio|inbucket|storage|edge_runtime|analytics|db\.pooler)$/.test(
      message
    ) ||
    /^Missing CLI image metadata: (?:postgres|postgres-meta|kong|postgrest|gotrue|realtime|studio|mailpit|storage-api|imgproxy)$/.test(
      message
    )
  )
    return message;
  return undefined;
}

if (require.main === module)
  main(process.argv[2]).catch((error) => {
    const diagnostic = configurationDiagnostic(error);
    if (diagnostic) {
      console.error(
        `::warning::Supabase image cache configuration: ${diagnostic}`
      );
      // biome-ignore lint/suspicious/noUndeclaredEnvVars: GitHub Actions output file, outside Turbo.
      const summary = process.env.GITHUB_STEP_SUMMARY;
      if (summary) {
        try {
          fs.appendFileSync(
            summary,
            `- Supabase image cache configuration: ${diagnostic}\n`
          );
        } catch {
          console.error('Supabase image cache summary could not be written.');
        }
      }
    }
    // Never dump a child error: CLI startup can include credentials.
    console.error(
      'Supabase image cache preparation failed; inspect the fixed pull classification above.'
    );
    process.exitCode = 1;
  });
module.exports = {
  configurationDiagnostic,
  imageList,
  cacheKey,
  subsetImages,
  missingImages,
  trustedSave,
  pullBudget,
  pullImage,
  MAX_ARCHIVE_BYTES,
};
