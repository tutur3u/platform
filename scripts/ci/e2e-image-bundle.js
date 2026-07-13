#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const {
  buildBlueGreenServices,
  buildNativeWebArtifacts,
  buildNativeWebRuntimeImages,
  getBlueGreenDeploymentBuildServices,
} = require('../docker-web/blue-green.js');
const {
  PROD_COMPOSE_FILE,
  runCommand: runDockerCommand,
} = require('../docker-web/compose.js');
const { createLocalE2EProcessEnv } = require('../e2e-local-environment.js');
const {
  DEFAULT_ENV_FILE,
  ensureLocalE2EEnvFile,
  runCommand,
  runCommandForOutput,
} = require('../run-web-e2e-docker.js');
const {
  BUNDLE_TAG_PATTERN,
  DEFAULT_REPOSITORY,
  DEFAULT_STALE_HOURS,
  cleanupBundle,
  deletePackageVersion,
  githubRequest,
  listPackageVersions,
  parsePackageRepository,
  selectPackageVersions,
  validateRepository,
  verifyPackageVisibility,
} = require('./e2e-image-bundle-ghcr.js');
const {
  createBakeMetadataRunner,
  promoteRegistryImage,
  readBuildDigest,
  SOURCE_REPOSITORY_ANNOTATION,
  writeRegistryBakeDefinition,
} = require('./e2e-image-bundle-registry.js');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const DEFAULT_WAIT_SECONDS = 360;
const DEFAULT_POLL_MS = 10_000;
const DEFAULT_PUBLISH_CONCURRENCY = 3;
const CACHE_TAG_PREFIX = 'cache-';
const SENTINEL_TAG = 'sentinel';
const BUNDLE_FRONTENDS = new Set(['both', 'next', 'tanstack']);
const STABLE_BUILD_METADATA = Object.freeze({
  PLATFORM_BUILD_BUILT_AT: '2000-01-01T00:00:00.000Z',
  PLATFORM_BUILD_COMMIT_HASH: '0000000000000000000000000000000000000000',
  PLATFORM_BUILD_COMMIT_MESSAGE: 'E2E image bundle',
  PLATFORM_BUILD_COMMIT_SHORT_HASH: '0000000',
  PLATFORM_BUILD_ENVIRONMENT: 'e2e',
  PLATFORM_BUILD_REF_NAME: 'e2e-image-bundle',
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getOptionValue(argv, name, fallback) {
  const exactIndex = argv.indexOf(name);

  if (exactIndex !== -1) {
    const value = argv[exactIndex + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`${name} requires a value.`);
    }
    return value;
  }

  const prefix = `${name}=`;
  const inline = argv.find((arg) => arg.startsWith(prefix));
  return inline ? inline.slice(prefix.length) : fallback;
}

function parsePositiveNumber(value, name) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive number.`);
  }

  return parsed;
}

function validateTagPrefix(tagPrefix) {
  const normalized = String(tagPrefix ?? '')
    .trim()
    .toLowerCase();

  if (!/^\d+-\d+-[0-9a-f]{7,40}$/u.test(normalized)) {
    throw new Error(
      'E2E image bundle tag prefix must be <run-id>-<run-attempt>-<commit-sha>.'
    );
  }

  return normalized;
}

function validateProjectName(projectName, name) {
  const normalized = String(projectName ?? '')
    .trim()
    .toLowerCase();

  if (!/^[a-z0-9][a-z0-9_-]{0,62}$/u.test(normalized)) {
    throw new Error(`${name} must be a safe Docker Compose project name.`);
  }

  return normalized;
}

function validateBundleFrontend(frontend) {
  const normalized = String(frontend ?? '')
    .trim()
    .toLowerCase();

  if (!BUNDLE_FRONTENDS.has(normalized)) {
    throw new Error(
      'E2E image bundle frontend must be next, tanstack, or both.'
    );
  }

  return normalized;
}

function parseArgs(argv = process.argv.slice(2), env = process.env) {
  const command = argv[0];

  if (!['cleanup', 'publish', 'pull'].includes(command)) {
    throw new Error(
      'Usage: e2e-image-bundle.js <publish|pull|cleanup> [options]'
    );
  }

  const repository = validateRepository(
    getOptionValue(
      argv,
      '--repository',
      env.E2E_IMAGE_BUNDLE_REPOSITORY ?? DEFAULT_REPOSITORY
    )
  );
  const rawTagPrefix = getOptionValue(
    argv,
    '--tag-prefix',
    env.E2E_IMAGE_BUNDLE_TAG_PREFIX
  );
  const tagPrefix = rawTagPrefix ? validateTagPrefix(rawTagPrefix) : null;

  if (command !== 'cleanup' && !tagPrefix) {
    throw new Error('publish and pull require an E2E image bundle tag prefix.');
  }

  const waitSeconds = parsePositiveNumber(
    getOptionValue(
      argv,
      '--wait-seconds',
      env.E2E_IMAGE_BUNDLE_WAIT_SECONDS ?? DEFAULT_WAIT_SECONDS
    ),
    '--wait-seconds'
  );
  const staleHoursValue = getOptionValue(
    argv,
    '--stale-hours',
    command === 'cleanup' && !tagPrefix
      ? (env.E2E_IMAGE_BUNDLE_STALE_HOURS ?? DEFAULT_STALE_HOURS)
      : null
  );

  return {
    command,
    consumerProject:
      command === 'pull'
        ? validateProjectName(
            getOptionValue(
              argv,
              '--consumer-project',
              env.DOCKER_WEB_COMPOSE_PROJECT_NAME ?? env.COMPOSE_PROJECT_NAME
            ),
            '--consumer-project'
          )
        : null,
    frontend:
      command === 'pull'
        ? validateBundleFrontend(
            getOptionValue(
              argv,
              '--frontend',
              env.E2E_IMAGE_BUNDLE_FRONTEND ?? 'both'
            )
          )
        : 'both',
    producerProject:
      command === 'publish'
        ? validateProjectName(
            getOptionValue(
              argv,
              '--producer-project',
              env.DOCKER_WEB_COMPOSE_PROJECT_NAME ??
                `ttr-e2e-bundle-${env.GITHUB_RUN_ID ?? process.pid}`
            ),
            '--producer-project'
          )
        : null,
    repository,
    staleHours: staleHoursValue
      ? parsePositiveNumber(staleHoursValue, '--stale-hours')
      : null,
    tagPrefix,
    waitSeconds,
  };
}

function getBundleServices(env = {}, frontend = 'both') {
  const selectedFrontend = validateBundleFrontend(frontend);
  const baseEnv = {
    ...env,
    DOCKER_SUPERMEMORY_ENABLED: 'false',
    DOCKER_WEB_CRON_RUNNER_ENABLED: '0',
    SUPERMEMORY_ENABLED: 'false',
  };
  const frontends =
    selectedFrontend === 'both' ? ['next', 'tanstack'] : [selectedFrontend];
  const services = frontends.flatMap((plannedFrontend) =>
    getBlueGreenDeploymentBuildServices({
      env: { ...baseEnv, DOCKER_WEB_FRONTEND: plannedFrontend },
      forceBuildSupportServices: true,
      targetColor: 'blue',
    })
  );

  return [...new Set(services)].sort();
}

function getConsumerTargets(service, consumerProject) {
  if (service === 'web-blue') {
    return [`${consumerProject}-web-blue`, `${consumerProject}-web-green`];
  }

  if (service === 'tanstack-web-blue') {
    return [
      `${consumerProject}-tanstack-web`,
      `${consumerProject}-tanstack-web-blue`,
      `${consumerProject}-tanstack-web-green`,
    ];
  }

  if (service === 'hive-blue') {
    return [`${consumerProject}-hive-blue`, `${consumerProject}-hive-green`];
  }

  return [`${consumerProject}-${service}`];
}

function getRemoteImage(repository, tagPrefix, suffix) {
  const tag = `${tagPrefix}-${suffix}`;

  if (tag.length > 128 || !BUNDLE_TAG_PATTERN.test(tag)) {
    throw new Error(`Invalid E2E image bundle tag: ${tag}`);
  }

  return `${repository}:${tag}`;
}

function createBundleManifest({
  consumerProject,
  env = {},
  frontend = 'both',
  producerProject,
  repository,
  tagPrefix,
}) {
  return getBundleServices(env, frontend).map((service) => ({
    remote: getRemoteImage(repository, tagPrefix, service),
    service,
    source: producerProject ? `${producerProject}-${service}` : null,
    targets: consumerProject
      ? getConsumerTargets(service, consumerProject)
      : [],
  }));
}

function getReadyImage(repository, tagPrefix) {
  return getRemoteImage(repository, tagPrefix, 'ready');
}

function getCacheImage(repository, service) {
  if (!/^[a-z0-9][a-z0-9.-]*$/u.test(service)) {
    throw new Error(`Invalid E2E image cache service: ${service}`);
  }

  return `${repository}:${CACHE_TAG_PREFIX}${service}`;
}

function createBundleBuildEnv({
  baseEnv = process.env,
  envFilePath = DEFAULT_ENV_FILE,
  producerProject,
  rootDir = ROOT_DIR,
} = {}) {
  ensureLocalE2EEnvFile(envFilePath);

  return {
    ...createLocalE2EProcessEnv(baseEnv, { envFilePath, rootDir }),
    ...STABLE_BUILD_METADATA,
    COMPOSE_PARALLEL_LIMIT: baseEnv.COMPOSE_PARALLEL_LIMIT ?? '1',
    COMPOSE_PROJECT_NAME: producerProject,
    DOCKER_SUPERMEMORY_ENABLED: 'false',
    DOCKER_WEB_BUILDKIT_PRUNE_AFTER_BUILD: '0',
    DOCKER_WEB_COMPOSE_PROJECT_NAME: producerProject,
    DOCKER_WEB_CRON_RUNNER_ENABLED: '0',
    DOCKER_WEB_FRONTEND: 'next',
    DOCKER_WEB_NATIVE_BUILD: baseEnv.E2E_DOCKER_NATIVE_BUILD ?? '1',
    DOCKER_WEB_NATIVE_RUNNER_BUILDX: '1',
    DOCKER_WEB_NATIVE_SUPPORT_BUILD:
      baseEnv.E2E_DOCKER_NATIVE_SUPPORT_BUILD ?? '1',
    DOCKER_WEB_NATIVE_SUPPORT_BUILDX: '1',
    SUPERMEMORY_ENABLED: 'false',
  };
}

async function runWithConcurrency(items, limit, operation) {
  const queue = [...items];
  const workers = Array.from(
    { length: Math.min(limit, queue.length) },
    async () => {
      while (queue.length > 0) {
        const item = queue.shift();
        if (item) await operation(item);
      }
    }
  );

  await Promise.all(workers);
}

async function publishBundle(
  options,
  {
    buildRun = runDockerCommand,
    buildServices = buildBlueGreenServices,
    buildNativeArtifacts = buildNativeWebArtifacts,
    buildNativeImages = buildNativeWebRuntimeImages,
    env = process.env,
    getBuildDigest = readBuildDigest,
    remoteImageExists = imageExists,
    run = runCommand,
    verifyVisibility = verifyPackageVisibility,
  } = {}
) {
  const buildEnv = createBundleBuildEnv({
    baseEnv: env,
    producerProject: options.producerProject,
  });
  const manifest = createBundleManifest({
    env: buildEnv,
    producerProject: options.producerProject,
    repository: options.repository,
    tagPrefix: options.tagPrefix,
  });
  const registryEntries = manifest.map((entry) => ({
    ...entry,
    cacheImage: getCacheImage(options.repository, entry.service),
  }));
  fs.mkdirSync(path.join(ROOT_DIR, 'tmp'), { recursive: true });
  const tempDir = fs.mkdtempSync(path.join(ROOT_DIR, 'tmp', 'e2e-bundle-'));

  try {
    const nativeEntry = registryEntries.find(
      (entry) => entry.service === 'web-blue'
    );
    const bakeEntries = registryEntries.filter(
      (entry) => entry !== nativeEntry
    );
    const bakeFile = writeRegistryBakeDefinition(bakeEntries, tempDir);
    const bakeMetadata = createBakeMetadataRunner({
      directory: tempDir,
      run: buildRun,
      services: bakeEntries.map((entry) => entry.service),
    });
    const nativeMetadataFile = path.join(tempDir, 'web-blue.metadata.json');

    if (nativeEntry) {
      await buildNativeArtifacts({
        env: buildEnv,
        rootDir: ROOT_DIR,
        runCommand: buildRun,
      });
      await buildNativeImages({
        composeGlobalArgs: ['--project-name', options.producerProject],
        env: buildEnv,
        imageTagResolver: () => nativeEntry.cacheImage,
        labels: [SOURCE_REPOSITORY_ANNOTATION],
        metadataFileResolver: () => nativeMetadataFile,
        output: 'registry',
        rootDir: ROOT_DIR,
        runCommand: buildRun,
        services: [nativeEntry.service],
      });
    }

    await buildServices({
      bakeFile,
      buildStrategy: 'bake',
      composeFile: PROD_COMPOSE_FILE,
      composeGlobalArgs: ['--project-name', options.producerProject],
      env: buildEnv,
      rootDir: ROOT_DIR,
      runCommand: bakeMetadata.run,
      services: bakeEntries.map((entry) => entry.service),
    });

    const digests = new Map(
      registryEntries.map((entry) => [
        entry.service,
        getBuildDigest(
          entry.service,
          entry === nativeEntry
            ? nativeMetadataFile
            : bakeMetadata.metadataFiles.get(entry.service)
        ),
      ])
    );
    const promote = (entry, targetImage, bundleLabel) =>
      promoteRegistryImage(
        {
          bundleLabel,
          digest: digests.get(entry.service),
          sourceImage: entry.cacheImage,
          targetImage,
        },
        { env: buildEnv, run }
      );

    const sentinelImage = `${options.repository}:${SENTINEL_TAG}`;
    if (!(await remoteImageExists(sentinelImage, { env: buildEnv }))) {
      await promote(registryEntries[0], sentinelImage, SENTINEL_TAG);
    }
    await verifyVisibility(options.repository, env);

    await runWithConcurrency(
      registryEntries,
      DEFAULT_PUBLISH_CONCURRENCY,
      (entry) =>
        promote(entry, entry.remote, `${options.tagPrefix}-${entry.service}`)
    );

    const readyImage = getReadyImage(options.repository, options.tagPrefix);
    await promote(registryEntries[0], readyImage, `${options.tagPrefix}-ready`);
    process.stdout.write(
      `Published ${manifest.length} E2E images and ready marker ${readyImage}.\n`
    );
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
}

async function imageExists(image, { env = process.env, runForOutput } = {}) {
  const execute = runForOutput ?? runCommandForOutput;

  try {
    await execute('docker', ['manifest', 'inspect', image], { env });
    return true;
  } catch {
    return false;
  }
}

async function waitForReadyImage(
  image,
  {
    env = process.env,
    now = Date.now,
    pollMs = DEFAULT_POLL_MS,
    runForOutput,
    sleep: sleepImpl = sleep,
    waitSeconds = DEFAULT_WAIT_SECONDS,
  } = {}
) {
  const deadline = now() + waitSeconds * 1000;

  while (now() <= deadline) {
    if (await imageExists(image, { env, runForOutput })) return true;
    if (now() >= deadline) break;
    await sleepImpl(Math.min(pollMs, Math.max(0, deadline - now())));
  }

  return false;
}

function appendGitHubEnv(values, env = process.env) {
  if (!env.GITHUB_ENV) return;

  const content = Object.entries(values)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  fs.appendFileSync(env.GITHUB_ENV, `${content}\n`);
}

async function pullBundle(
  options,
  { env = process.env, run = runCommand, runForOutput, sleep: sleepImpl } = {}
) {
  const readyImage = getReadyImage(options.repository, options.tagPrefix);
  const ready = await waitForReadyImage(readyImage, {
    env,
    runForOutput,
    sleep: sleepImpl,
    waitSeconds: options.waitSeconds,
  });

  if (!ready) {
    process.stdout.write(
      `::notice title=E2E image bundle unavailable::${readyImage} was not ready after ${options.waitSeconds}s; using local cache-backed builds.\n`
    );
    return false;
  }

  const manifest = createBundleManifest({
    consumerProject: options.consumerProject,
    env,
    frontend: options.frontend,
    repository: options.repository,
    tagPrefix: options.tagPrefix,
  });

  try {
    await runWithConcurrency(manifest, 3, (entry) =>
      run('docker', ['pull', entry.remote], { env })
    );

    for (const entry of manifest) {
      for (const target of entry.targets) {
        await run('docker', ['tag', entry.remote, target], { env });
      }
    }
  } catch (error) {
    process.stdout.write(
      `::notice title=E2E image bundle incomplete::${
        error instanceof Error ? error.message : String(error)
      }; using local cache-backed builds.\n`
    );
    return false;
  }

  appendGitHubEnv(
    {
      DOCKER_WEB_REUSED_SUPPORT_IMAGE_TARGETS: manifest
        .filter((entry) => !entry.service.includes('web-blue'))
        .flatMap((entry) => entry.targets)
        .join(','),
      DOCKER_WEB_REUSED_WEB_IMAGE_SOURCE: readyImage,
      DOCKER_WEB_REUSED_WEB_IMAGE_TARGETS: manifest
        .filter((entry) => entry.service.includes('web-blue'))
        .flatMap((entry) => entry.targets)
        .join(','),
      DOCKER_WEB_SKIP_BLUE_GREEN_SUPPORT_BUILD: '1',
      DOCKER_WEB_SKIP_BLUE_GREEN_WEB_BUILD: '1',
      E2E_IMAGE_BUNDLE_READY: '1',
    },
    env
  );
  process.stdout.write(`Reused ${manifest.length} E2E images from GHCR.\n`);
  return true;
}

async function main() {
  const options = parseArgs();

  if (options.command === 'publish') {
    await publishBundle(options);
    return;
  }

  if (options.command === 'pull') {
    await pullBundle(options);
    return;
  }

  await cleanupBundle(options);
}

if (require.main === module) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}

module.exports = {
  BUNDLE_TAG_PATTERN,
  CACHE_TAG_PREFIX,
  DEFAULT_PUBLISH_CONCURRENCY,
  DEFAULT_REPOSITORY,
  DEFAULT_STALE_HOURS,
  DEFAULT_WAIT_SECONDS,
  SENTINEL_TAG,
  STABLE_BUILD_METADATA,
  appendGitHubEnv,
  cleanupBundle,
  createBundleBuildEnv,
  createBundleManifest,
  deletePackageVersion,
  getBundleServices,
  getCacheImage,
  getConsumerTargets,
  getReadyImage,
  githubRequest,
  imageExists,
  listPackageVersions,
  parseArgs,
  parsePackageRepository,
  publishBundle,
  pullBundle,
  runWithConcurrency,
  selectPackageVersions,
  validateProjectName,
  validateBundleFrontend,
  validateRepository,
  validateTagPrefix,
  verifyPackageVisibility,
  waitForReadyImage,
};
