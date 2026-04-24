#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = path.resolve(__dirname, '..');
const WEB_DOCKERFILE_PATH = path.join(ROOT_DIR, 'apps', 'web', 'Dockerfile');
const WATCHER_DOCKERFILE_PATH = path.join(
  ROOT_DIR,
  'apps',
  'web',
  'docker',
  'blue-green-watcher.Dockerfile'
);
const MARKITDOWN_DOCKERFILE_PATH = path.join(
  ROOT_DIR,
  'apps',
  'discord',
  'Dockerfile.markitdown'
);
const WEB_COMPOSE_FILE_PATH = path.join(ROOT_DIR, 'docker-compose.web.yml');
const WEB_PROD_COMPOSE_FILE_PATH = path.join(
  ROOT_DIR,
  'docker-compose.web.prod.yml'
);
const WORKSPACE_DIRS = ['apps', 'packages'];
const PACKAGE_JSON_DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
];
const DRAIN_STATUS_HEALTHCHECK_PATTERN =
  /fetch\(`http:\/\/127\.0\.0\.1:\$\{process\.env\.PORT \|\| 7803\}\/__platform\/drain-status`\)/;

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

  if (!DRAIN_STATUS_HEALTHCHECK_PATTERN.test(runnerStage ?? '')) {
    errors.push(
      'apps/web/Dockerfile runner stage must health-check the internal /__platform/drain-status endpoint.'
    );
  }

  return errors;
}

function validateDockerCompose(
  composeContent,
  { workspacePackageJsonPaths = listWorkspacePackageJsonPaths() } = {}
) {
  const errors = [];
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
    '      - SUPABASE_SERVER_URL',
    '      - UPSTASH_REDIS_REST_TOKEN',
    '      - UPSTASH_REDIS_REST_URL',
    '      - "host.docker.internal:host-gateway"',
    '    init: true',
    '      SRH_TOKEN: ' +
      '${' +
      'UPSTASH_REDIS_REST_TOKEN:?UPSTASH_REDIS_REST_TOKEN must be set when enabling the redis profile' +
      '}',
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

function validateDockerProdCompose(composeContent) {
  const errors = [];
  const requiredSnippets = [
    'x-web-service: &web-service',
    '  web:',
    '  web-blue:',
    '  web-green:',
    '  web-blue-green-watcher:',
    '  markitdown:',
    '  storage-unzip-proxy:',
    '  web-proxy:',
    '      dockerfile: Dockerfile.markitdown',
    '      dockerfile: apps/web/docker/blue-green-watcher.Dockerfile',
    '      context: apps/storage-unzip-proxy',
    '      - PLATFORM_HOST_WORKSPACE_DIR',
    '      - .:' + '${' + 'PLATFORM_HOST_WORKSPACE_DIR' + '}',
    '      - /var/run/docker.sock:/var/run/docker.sock',
    '      - platform-bun-install:/root/.bun/install/cache',
    '      - platform-blue-green-watcher-node_modules:/workspace/node_modules',
    '      - platform-blue-green-watcher-node_modules:' +
      '${' +
      'PLATFORM_HOST_WORKSPACE_DIR' +
      '}' +
      '/node_modules',
    '    image: nginx:1.27-alpine',
    'http://127.0.0.1:7803/__platform/drain-status',
    'http://127.0.0.1:8000/health',
    '      - ./tmp/docker-web/prod/nginx.conf:/etc/nginx/conf.d/default.conf:ro',
    '      required: true',
    '    - DISCORD_APP_DEPLOYMENT_URL',
    '    - DRIVE_AUTO_EXTRACT_PROXY_TOKEN',
    '    - DRIVE_AUTO_EXTRACT_PROXY_URL',
    '    - INTERNAL_WEB_API_ORIGIN',
    '    - MARKITDOWN_ENDPOINT_SECRET',
    '    - MARKITDOWN_ENDPOINT_URL',
    '    - PLATFORM_BLUE_GREEN_COLOR',
    '    - PLATFORM_BLUE_GREEN_CONTROL_DIR=/app/runtime/docker-web-control',
    '    - PLATFORM_BLUE_GREEN_MONITORING_DIR=/app/runtime/docker-web',
    '    - PLATFORM_DEPLOYMENT_STAMP',
    '    - SUPABASE_SERVER_URL',
    '    - UPSTASH_REDIS_REST_TOKEN',
    '    - UPSTASH_REDIS_REST_URL',
    '    - ./tmp/docker-web/watch/control:/app/runtime/docker-web-control',
    '    - ./tmp/docker-web:/app/runtime/docker-web:ro',
    '      - DRIVE_UNZIP_PROXY_SHARED_TOKEN',
    '      SRH_TOKEN: ' +
      '${' +
      'UPSTASH_REDIS_REST_TOKEN:?UPSTASH_REDIS_REST_TOKEN must be set when enabling the redis profile' +
      '}',
  ];

  for (const snippet of requiredSnippets) {
    if (!composeContent.includes(snippet)) {
      errors.push(
        `docker-compose.web.prod.yml is missing the expected snippet: ${snippet}`
      );
    }
  }

  return errors;
}

function validateWatcherDockerfile(dockerfileContent) {
  const errors = [];
  const requiredSnippets = [
    'FROM oven/bun:1.3.13-alpine',
    'RUN apk add --no-cache docker-cli docker-cli-buildx docker-cli-compose git openssh-client',
    'COPY apps/web/docker/blue-green-watcher-entrypoint.js /usr/local/bin/blue-green-watcher-entrypoint.js',
    'CMD ["bun", "/usr/local/bin/blue-green-watcher-entrypoint.js"]',
  ];

  for (const snippet of requiredSnippets) {
    if (!dockerfileContent.includes(snippet)) {
      errors.push(
        `apps/web/docker/blue-green-watcher.Dockerfile is missing the expected snippet: ${snippet}`
      );
    }
  }

  return errors;
}

function validateMarkitdownDockerfile(dockerfileContent) {
  const errors = [];
  const requiredSnippets = [
    'FROM ghcr.io/astral-sh/uv:python3.13-bookworm-slim AS deps',
    'RUN uv sync --locked --no-dev',
    'COPY --chown=app:app local_server.py markitdown_service.py ./',
    'CMD ["sh", "-c", "uvicorn local_server:app --host 0.0.0.0 --port ' +
      '${' +
      'PORT:-8000' +
      '}"]',
  ];

  for (const snippet of requiredSnippets) {
    if (!dockerfileContent.includes(snippet)) {
      errors.push(
        `apps/discord/Dockerfile.markitdown is missing the expected snippet: ${snippet}`
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
  prodComposeContent = fsImpl.readFileSync(
    path.join(rootDir, 'docker-compose.web.prod.yml'),
    'utf8'
  ),
  watcherDockerfileContent = fsImpl.readFileSync(
    path.join(
      rootDir,
      'apps',
      'web',
      'docker',
      'blue-green-watcher.Dockerfile'
    ),
    'utf8'
  ),
  markitdownDockerfileContent = fsImpl.readFileSync(
    path.join(rootDir, 'apps', 'discord', 'Dockerfile.markitdown'),
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
    ...validateDockerProdCompose(prodComposeContent),
    ...validateWatcherDockerfile(watcherDockerfileContent),
    ...validateMarkitdownDockerfile(markitdownDockerfileContent),
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
  MARKITDOWN_DOCKERFILE_PATH,
  WATCHER_DOCKERFILE_PATH,
  WEB_COMPOSE_FILE_PATH,
  WEB_DOCKERFILE_PATH,
  WEB_PROD_COMPOSE_FILE_PATH,
  checkDockerWebSetup,
  getCopiedRelativePaths,
  getCopiedWorkspaceManifestPaths,
  getStageContent,
  listFileDependencyPaths,
  listWorkspacePackageJsonPaths,
  validateDockerCompose,
  validateDockerProdCompose,
  validateDockerfile,
  validateMarkitdownDockerfile,
  validateWatcherDockerfile,
};
