#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = path.resolve(__dirname, '..');
const WEB_DOCKERFILE_PATH = path.join(ROOT_DIR, 'apps', 'web', 'Dockerfile');
const WEB_COMPOSE_FILE_PATH = path.join(ROOT_DIR, 'docker-compose.web.yml');
const WORKSPACE_DIRS = ['apps', 'packages'];

function listWorkspacePackageJsonPaths(rootDir = ROOT_DIR, fsImpl = fs) {
  return WORKSPACE_DIRS.flatMap((workspaceDir) => {
    const absoluteWorkspaceDir = path.join(rootDir, workspaceDir);

    if (!fsImpl.existsSync(absoluteWorkspaceDir)) {
      return [];
    }

    return fsImpl
      .readdirSync(absoluteWorkspaceDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.posix.join(workspaceDir, entry.name, 'package.json'))
      .filter((relativePath) =>
        fsImpl.existsSync(path.join(rootDir, relativePath))
      );
  }).sort();
}

function getStageContent(dockerfileContent, stageName) {
  const startPattern = new RegExp(`^FROM .* AS ${stageName}$`, 'm');
  const startMatch = dockerfileContent.match(startPattern);

  if (!startMatch || startMatch.index === undefined) {
    return null;
  }

  const startIndex = startMatch.index;
  const nextStageIndex = dockerfileContent
    .slice(startIndex + startMatch[0].length)
    .search(/^FROM /m);

  if (nextStageIndex === -1) {
    return dockerfileContent.slice(startIndex);
  }

  return dockerfileContent.slice(
    startIndex,
    startIndex + startMatch[0].length + nextStageIndex
  );
}

function getCopiedWorkspaceManifestPaths(stageContent) {
  return stageContent
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .map((line) =>
      line.match(
        /^COPY ((?:apps|packages)\/[^/]+\/package\.json) \.\/((?:apps|packages)\/[^/]+\/package\.json)$/
      )
    )
    .filter(Boolean)
    .map((match) => {
      if (match[1] !== match[2]) {
        throw new Error(`Mismatched Docker manifest copy: ${match[0]}`);
      }

      return match[1];
    })
    .sort();
}

function validateDockerfile({ dockerfileContent, workspacePackageJsonPaths }) {
  const errors = [];
  const depsStage = getStageContent(dockerfileContent, 'deps');
  const devStage = getStageContent(dockerfileContent, 'dev');
  const builderStage = getStageContent(dockerfileContent, 'builder');
  const runnerStage = getStageContent(dockerfileContent, 'runner');

  if (!depsStage) {
    errors.push('apps/web/Dockerfile is missing the deps stage.');
  }

  if (!devStage) {
    errors.push('apps/web/Dockerfile is missing the dev stage.');
  }

  if (!builderStage) {
    errors.push('apps/web/Dockerfile is missing the builder stage.');
  }

  if (!runnerStage) {
    errors.push('apps/web/Dockerfile is missing the runner stage.');
  }

  if (!depsStage) {
    return errors;
  }

  if (!depsStage.includes('COPY package.json bun.lock turbo.json ./')) {
    errors.push(
      'apps/web/Dockerfile deps stage must copy package.json, bun.lock, and turbo.json before bun install.'
    );
  }

  if (
    !depsStage.includes(
      'COPY scripts/install-git-hooks.js ./scripts/install-git-hooks.js'
    )
  ) {
    errors.push(
      'apps/web/Dockerfile deps stage must copy scripts/install-git-hooks.js before bun install.'
    );
  }

  if (
    !depsStage.includes(
      '--mount=type=cache,id=platform-web-bun-install,target=/root/.bun/install/cache'
    )
  ) {
    errors.push(
      'apps/web/Dockerfile deps stage must cache /root/.bun/install/cache during bun install.'
    );
  }

  const copiedWorkspacePackageJsonPaths =
    getCopiedWorkspaceManifestPaths(depsStage);
  const missingWorkspacePackageJsonPaths = workspacePackageJsonPaths.filter(
    (relativePath) => !copiedWorkspacePackageJsonPaths.includes(relativePath)
  );
  const unexpectedWorkspacePackageJsonPaths =
    copiedWorkspacePackageJsonPaths.filter(
      (relativePath) => !workspacePackageJsonPaths.includes(relativePath)
    );

  if (missingWorkspacePackageJsonPaths.length > 0) {
    errors.push(
      `apps/web/Dockerfile deps stage is missing workspace package manifests: ${missingWorkspacePackageJsonPaths.join(
        ', '
      )}`
    );
  }

  if (unexpectedWorkspacePackageJsonPaths.length > 0) {
    errors.push(
      `apps/web/Dockerfile deps stage copies non-existent workspace manifests: ${unexpectedWorkspacePackageJsonPaths.join(
        ', '
      )}`
    );
  }

  for (const [stageName, stageContent] of [
    ['dev', devStage],
    ['builder', builderStage],
  ]) {
    if (!stageContent) {
      continue;
    }

    if (!stageContent.includes('COPY --from=deps /workspace ./')) {
      errors.push(
        `apps/web/Dockerfile ${stageName} stage must reuse the deps stage workspace before copying source files.`
      );
    }

    if (!stageContent.includes('COPY . .')) {
      errors.push(
        `apps/web/Dockerfile ${stageName} stage must copy the repo source after restoring the deps stage workspace.`
      );
    }
  }

  if (builderStage) {
    if (
      !builderStage.includes(
        '--mount=type=cache,id=platform-web-turbo,target=/workspace/.turbo'
      )
    ) {
      errors.push(
        'apps/web/Dockerfile builder stage must cache /workspace/.turbo during the production build.'
      );
    }

    if (
      !builderStage.includes(
        '--mount=type=cache,id=platform-web-next-cache,target=/workspace/apps/web/.next/cache'
      )
    ) {
      errors.push(
        'apps/web/Dockerfile builder stage must cache /workspace/apps/web/.next/cache during the production build.'
      );
    }
  }

  return errors;
}

function validateDockerCompose(composeContent) {
  const errors = [];
  const dockerInternalSupabaseSnippet =
    '      SUPABASE_SERVER_URL: ' +
    '${' +
    'DOCKER_INTERNAL_SUPABASE_URL:-http://host.docker.internal:8001' +
    '}';
  const requiredSnippets = [
    'services:',
    '  web:',
    '      target: dev',
    '      - .:/workspace',
    '      - platform-bun-install:/root/.bun/install/cache',
    dockerInternalSupabaseSnippet,
    '    init: true',
  ];

  for (const snippet of requiredSnippets) {
    if (!composeContent.includes(snippet)) {
      errors.push(
        `docker-compose.web.yml is missing the expected snippet: ${snippet}`
      );
    }
  }

  return errors;
}

function checkDockerWebSetup({
  rootDir = ROOT_DIR,
  fsImpl = fs,
  dockerfileContent = fsImpl.readFileSync(WEB_DOCKERFILE_PATH, 'utf8'),
  composeContent = fsImpl.readFileSync(WEB_COMPOSE_FILE_PATH, 'utf8'),
  workspacePackageJsonPaths = listWorkspacePackageJsonPaths(rootDir, fsImpl),
} = {}) {
  return [
    ...validateDockerfile({
      dockerfileContent,
      workspacePackageJsonPaths,
    }),
    ...validateDockerCompose(composeContent),
  ];
}

function main() {
  const errors = checkDockerWebSetup();

  if (errors.length > 0) {
    for (const error of errors) {
      console.error(`- ${error}`);
    }

    process.exitCode = 1;
    return;
  }

  console.log('Docker web setup looks consistent.');
}

if (require.main === module) {
  main();
}

module.exports = {
  ROOT_DIR,
  WEB_COMPOSE_FILE_PATH,
  WEB_DOCKERFILE_PATH,
  checkDockerWebSetup,
  getCopiedWorkspaceManifestPaths,
  getStageContent,
  listWorkspacePackageJsonPaths,
  validateDockerCompose,
  validateDockerfile,
};
