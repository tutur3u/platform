const fs = require('node:fs');
const path = require('node:path');

const IMAGE_DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const SOURCE_REPOSITORY_URL = 'https://github.com/tutur3u/platform';
const SOURCE_REPOSITORY_ANNOTATION = `org.opencontainers.image.source=${SOURCE_REPOSITORY_URL}`;

function validateImageDigest(digest) {
  const normalized = String(digest ?? '')
    .trim()
    .toLowerCase();

  if (!IMAGE_DIGEST_PATTERN.test(normalized)) {
    throw new Error(`Invalid E2E image digest: ${normalized || '<empty>'}`);
  }

  return normalized;
}

function createRegistryBakeDefinition(entries) {
  return {
    target: Object.fromEntries(
      entries.map(({ cacheImage, service }) => [
        service,
        {
          labels: {
            'org.opencontainers.image.source': SOURCE_REPOSITORY_URL,
          },
          output: ['type=registry'],
          tags: [cacheImage],
        },
      ])
    ),
  };
}

function writeRegistryBakeDefinition(entries, directory) {
  const filePath = path.join(directory, 'registry-output.json');
  fs.writeFileSync(
    filePath,
    `${JSON.stringify(createRegistryBakeDefinition(entries), null, 2)}\n`
  );
  return filePath;
}

function createBakeMetadataRunner({ directory, run, services }) {
  const serviceSet = new Set(services);
  const metadataFiles = new Map();

  return {
    metadataFiles,
    run: async (command, args, options) => {
      if (command !== 'docker' || args[0] !== 'buildx' || args[1] !== 'bake') {
        return run(command, args, options);
      }

      const targets = args.filter((arg) => serviceSet.has(arg));
      if (targets.length === 0) {
        throw new Error('E2E registry Bake command has no planned target.');
      }

      const metadataFile = path.join(
        directory,
        `${targets.slice().sort().join('--')}.metadata.json`
      );
      fs.rmSync(metadataFile, { force: true });
      for (const target of targets) metadataFiles.set(target, metadataFile);

      const firstTargetIndex = args.findIndex((arg) => serviceSet.has(arg));
      const registryArgs = [
        ...args.slice(0, firstTargetIndex),
        '--metadata-file',
        metadataFile,
        ...args.slice(firstTargetIndex),
      ];
      return run(command, registryArgs, options);
    },
  };
}

function readBuildDigest(service, metadataFile) {
  if (!metadataFile) {
    throw new Error(`Missing Buildx metadata file for ${service}.`);
  }

  const metadata = JSON.parse(fs.readFileSync(metadataFile, 'utf8'));
  return validateImageDigest(
    metadata?.[service]?.['containerimage.digest'] ??
      metadata?.['containerimage.digest']
  );
}

async function promoteRegistryImage(
  { bundleLabel, digest, sourceImage, targetImage },
  { env = process.env, run }
) {
  const normalizedDigest = validateImageDigest(digest);
  if (!/^[a-z0-9][a-z0-9.-]*$/u.test(bundleLabel)) {
    throw new Error(`Invalid E2E registry bundle label: ${bundleLabel}`);
  }

  await run(
    'docker',
    [
      'buildx',
      'imagetools',
      'create',
      '--annotation',
      `index:io.tuturuuu.e2e-image-bundle=${bundleLabel}`,
      '--annotation',
      `index:${SOURCE_REPOSITORY_ANNOTATION}`,
      '--tag',
      targetImage,
      `${sourceImage}@${normalizedDigest}`,
    ],
    { env }
  );
}

module.exports = {
  IMAGE_DIGEST_PATTERN,
  SOURCE_REPOSITORY_ANNOTATION,
  SOURCE_REPOSITORY_URL,
  createBakeMetadataRunner,
  createRegistryBakeDefinition,
  promoteRegistryImage,
  readBuildDigest,
  validateImageDigest,
  writeRegistryBakeDefinition,
};
