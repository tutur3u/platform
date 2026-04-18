#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = path.resolve(__dirname, '..');
const WEB_DOCKERFILE_PATH = path.join(ROOT_DIR, 'apps', 'web', 'Dockerfile');
const WEB_COMPOSE_FILE_PATH = path.join(ROOT_DIR, 'docker-compose.web.yml');
const WORKSPACE_DIRS = ['apps', 'packages'];
const PACKAGE_JSON_DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
];

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
  const escapedStageName = stageName.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const startPattern = new RegExp(`^FROM .* AS ${escapedStageName}$`, 'm');
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
  return getCopiedRelativePaths(stageContent)
    .filter((relativePath) =>
      /^(?:apps|packages)\/[^/]+\/package\.json$/u.test(relativePath)
    )
    .sort();
}

function getCopiedRelativePaths(stageContent) {
  return stageContent
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .map((line) =>
      line.match(
        /^COPY(?:\s+--\S+)*\s+((?:apps|packages)\/\S+)\s+\.\/((?:apps|packages)\/\S+)$/u
      )
    )
    .filter(Boolean)
    .map((match) => {
      if (match[1] !== match[2]) {
        throw new Error(`Mismatched Docker copy: ${match[0]}`);
      }

      return match[1];
    });
}

function listFileDependencyPaths(rootDir = ROOT_DIR, fsImpl = fs) {
  const packageJsonPaths = [
    'package.json',
    ...listWorkspacePackageJsonPaths(rootDir, fsImpl),
  ];
  const fileDependencyPaths = [];

  for (const packageJsonPath of packageJsonPaths) {
    const packageJson = JSON.parse(
      fsImpl.readFileSync(path.join(rootDir, packageJsonPath), 'utf8')
    );
    const packageDir = path.posix.dirname(packageJsonPath);

    for (const fieldName of PACKAGE_JSON_DEPENDENCY_FIELDS) {
      const dependencies = packageJson[fieldName] ?? {};

      for (const dependencySpec of Object.values(dependencies)) {
        if (
          typeof dependencySpec !== 'string' ||
          !dependencySpec.startsWith('file:')
        ) {
          continue;
        }

        fileDependencyPaths.push(
          path.posix.normalize(
            path.posix.join(packageDir, dependencySpec.slice(5))
          )
        );
      }
    }
  }

  return [...new Set(fileDependencyPaths)].sort();
}

function validateDockerfile({
  dockerfileContent,
  workspacePackageJsonPaths,
  fileDependencyPaths,
}) {
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

  const copiedRelativePaths = getCopiedRelativePaths(depsStage);
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

  const missingFileDependencyPaths = fileDependencyPaths.filter(
    (relativePath) => !copiedRelativePaths.includes(relativePath)
  );

  if (missingFileDependencyPaths.length > 0) {
    errors.push(
      `apps/web/Dockerfile deps stage is missing file-backed dependencies required by package manifests: ${missingFileDependencyPaths.join(
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

function validateDockerCompose(
  composeContent,
  { workspacePackageJsonPaths = listWorkspacePackageJsonPaths() } = {}
) {
  const errors = [];
  const dockerInternalSupabaseSnippet =
    '      SUPABASE_SERVER_URL: ' +
    '${' +
    'DOCKER_INTERNAL_SUPABASE_URL:-http://host.docker.internal:8001' +
    '}';
  const packageWorkspaceDirs = workspacePackageJsonPaths
    .filter((relativePath) => relativePath.startsWith('packages/'))
    .map((relativePath) => path.posix.dirname(relativePath))
    .sort();
  const requiredSnippets = [
    'services:',
    '  web:',
    '      target: dev',
    '      - .:/workspace',
    '      - platform-bun-install:/root/.bun/install/cache',
    dockerInternalSupabaseSnippet,
    '      - "host.docker.internal:host-gateway"',
    '    init: true',
  ];

  for (const packageWorkspaceDir of packageWorkspaceDirs) {
    const packageName = path.posix.basename(packageWorkspaceDir);
    requiredSnippets.push(
      `      - platform-web-${packageName}-node_modules:/workspace/${packageWorkspaceDir}/node_modules`,
      `      - platform-web-${packageName}-dist:/workspace/${packageWorkspaceDir}/dist`
    );
  }

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
  dockerfileContent = fsImpl.readFileSync(
    path.join(rootDir, 'apps', 'web', 'Dockerfile'),
    'utf8'
  ),
  composeContent = fsImpl.readFileSync(
    path.join(rootDir, 'docker-compose.web.yml'),
    'utf8'
  ),
  workspacePackageJsonPaths = listWorkspacePackageJsonPaths(rootDir, fsImpl),
  fileDependencyPaths = listFileDependencyPaths(rootDir, fsImpl),
} = {}) {
  return [
    ...validateDockerfile({
      dockerfileContent,
      fileDependencyPaths,
      workspacePackageJsonPaths,
    }),
    ...validateDockerCompose(composeContent, { workspacePackageJsonPaths }),
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
  getCopiedRelativePaths,
  getCopiedWorkspaceManifestPaths,
  getStageContent,
  listFileDependencyPaths,
  listWorkspacePackageJsonPaths,
  validateDockerCompose,
  validateDockerfile,
};
