#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = path.resolve(__dirname, '..');
const {
  readDockerProdComposeMergedText,
} = require('./docker-web/prod-compose-include.js');
const BACKEND_DOCKERFILE_PATH = path.join(
  ROOT_DIR,
  'apps',
  'backend',
  'Dockerfile'
);
const WEB_DOCKERFILE_PATH = path.join(ROOT_DIR, 'apps', 'web', 'Dockerfile');
const HIVE_DOCKERFILE_PATH = path.join(ROOT_DIR, 'apps', 'hive', 'Dockerfile');
const HIVE_REALTIME_DOCKERFILE_PATH = path.join(
  ROOT_DIR,
  'apps',
  'hive-realtime',
  'Dockerfile'
);
const MEET_REALTIME_DOCKERFILE_PATH = path.join(
  ROOT_DIR,
  'apps',
  'meet-realtime',
  'Dockerfile'
);
const CHAT_REALTIME_DOCKERFILE_PATH = path.join(
  ROOT_DIR,
  'apps',
  'chat-realtime',
  'Dockerfile'
);
const HIVE_DB_MIGRATE_SCRIPT_PATH = path.join(
  ROOT_DIR,
  'apps',
  'hive',
  'db',
  'migrate-forward.sh'
);
const DOCKERIGNORE_PATH = path.join(ROOT_DIR, '.dockerignore');
const WATCHER_DOCKERFILE_PATH = path.join(
  ROOT_DIR,
  'apps',
  'web',
  'docker',
  'blue-green-watcher.Dockerfile'
);
const CRON_RUNNER_DOCKERFILE_PATH = path.join(
  ROOT_DIR,
  'apps',
  'web',
  'docker',
  'cron-runner.Dockerfile'
);
const NATIVE_WEB_RUNNER_DOCKERFILE_PATH = path.join(
  ROOT_DIR,
  'apps',
  'web',
  'docker',
  'native-runner.Dockerfile'
);
const NATIVE_WEB_RUNNER_DOCKERIGNORE_PATH = path.join(
  ROOT_DIR,
  'apps',
  'web',
  'docker',
  'native-runner.Dockerfile.dockerignore'
);
const MARKITDOWN_DOCKERFILE_PATH = path.join(
  ROOT_DIR,
  'apps',
  'discord',
  'Dockerfile.markitdown'
);
const SUPERMEMORY_DOCKERFILE_PATH = path.join(
  ROOT_DIR,
  'apps',
  'supermemory',
  'Dockerfile'
);
const WEB_COMPOSE_FILE_PATH = path.join(ROOT_DIR, 'docker-compose.web.yml');
const WEB_PROD_COMPOSE_FILE_PATH = path.join(
  ROOT_DIR,
  'docker-compose.web.prod.yml'
);
const DOCKER_BAKE_WEB_PROD_PATH = path.join(
  ROOT_DIR,
  'docker-bake.web.prod.hcl'
);
const WORKSPACE_DIRS = ['apps', 'packages'];
const PACKAGE_JSON_DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
];
const DRAIN_STATUS_HEALTHCHECK_PATTERN =
  /fetch\(`http:\/\/127\.0\.0\.1:\$\{process\.env\.PORT \|\| 7803\}\/__platform\/drain-status`\)/;
const PLATFORM_BUILD_METADATA_ENV_NAMES = Object.freeze([
  'PLATFORM_BUILD_BUILT_AT',
  'PLATFORM_BUILD_COMMIT_HASH',
  'PLATFORM_BUILD_COMMIT_MESSAGE',
  'PLATFORM_BUILD_COMMIT_SHORT_HASH',
  'PLATFORM_BUILD_DEPLOYMENT_STAMP',
  'PLATFORM_BUILD_DEPLOYMENT_URL',
  'PLATFORM_BUILD_ENVIRONMENT',
  'PLATFORM_BUILD_REF_NAME',
]);
const DOCKER_CONTEXT_ARTIFACT_IGNORE_PATTERNS = [
  '**/.next',
  '**/.next/**',
  '**/.turbo',
  '**/.turbo/**',
  '**/coverage',
  '**/coverage/**',
  '**/node_modules/**',
  'tmp/**',
  'apps/mobile/.dart_tool',
  'apps/mobile/.dart_tool/**',
  'apps/mobile/build',
  'apps/mobile/build/**',
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

function getDockerEnvReferenceSnippet(envName) {
  return `\${${envName}}`;
}

function validatePlatformBuildMetadataDockerStage({
  dockerfileLabel,
  stageContent,
  stageName,
}) {
  const errors = [];

  for (const envName of PLATFORM_BUILD_METADATA_ENV_NAMES) {
    const requiredSnippets = [
      `ARG ${envName}=`,
      `ENV ${envName}=${getDockerEnvReferenceSnippet(envName)}`,
    ];

    for (const snippet of requiredSnippets) {
      if (!stageContent.includes(snippet)) {
        errors.push(
          `${dockerfileLabel} ${stageName} stage must expose ${snippet} for version badge metadata.`
        );
      }
    }
  }

  return errors;
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
    if (!builderStage.includes('FROM node:24-bookworm-slim AS builder')) {
      errors.push(
        'apps/web/Dockerfile builder stage must use node:24-bookworm-slim so next build runs under real Node instead of Bun node-shim.'
      );
    }

    if (
      !builderStage.includes(
        'COPY --from=deps /usr/local/bin/bun /usr/local/bin/bun'
      )
    ) {
      errors.push(
        'apps/web/Dockerfile builder stage must copy Bun from deps for workspace scripts while keeping Node as the build runtime.'
      );
    }

    if (
      !builderStage.includes('ENV DOCKER_WEB_NODE_BINARY=/usr/local/bin/node')
    ) {
      errors.push(
        'apps/web/Dockerfile builder stage must force Docker web build scripts to use the real Node binary for next build.'
      );
    }

    if (!builderStage.includes('ARG DOCKER_WEB_NODE_MAX_OLD_SPACE_SIZE=auto')) {
      errors.push(
        'apps/web/Dockerfile builder stage must default Docker next build heap to auto.'
      );
    }

    if (
      !builderStage.includes('ARG DOCKER_WEB_BUILD_MEMORY=12g') ||
      !builderStage.includes('ARG DOCKER_WEB_DOCKER_MEMORY_LIMIT=') ||
      !/ENV DOCKER_WEB_BUILD_MEMORY=\$\{DOCKER_WEB_BUILD_MEMORY\}/u.test(
        builderStage
      ) ||
      !/ENV DOCKER_WEB_DOCKER_MEMORY_LIMIT=\$\{DOCKER_WEB_DOCKER_MEMORY_LIMIT\}/u.test(
        builderStage
      ) ||
      !builderStage.includes('ARG DOCKER_WEB_NEXT_APP_ONLY=1') ||
      !/ENV DOCKER_WEB_NEXT_APP_ONLY=\$\{DOCKER_WEB_NEXT_APP_ONLY\}/u.test(
        builderStage
      ) ||
      !builderStage.includes('ARG DOCKER_WEB_NEXT_BUILD_ENGINE=turbopack') ||
      !/ENV DOCKER_WEB_NEXT_BUILD_ENGINE=\$\{DOCKER_WEB_NEXT_BUILD_ENGINE\}/u.test(
        builderStage
      ) ||
      !/ENV DOCKER_WEB_NODE_MAX_OLD_SPACE_SIZE=\$\{DOCKER_WEB_NODE_MAX_OLD_SPACE_SIZE\}/u.test(
        builderStage
      ) ||
      !builderStage.includes('ARG DOCKER_WEB_REACT_COMPILER=0') ||
      !/ENV DOCKER_WEB_REACT_COMPILER=\$\{DOCKER_WEB_REACT_COMPILER\}/u.test(
        builderStage
      )
    ) {
      errors.push(
        'apps/web/Dockerfile builder stage must expose Docker build memory, app-only, next build engine, heap, and React Compiler build args.'
      );
    }

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

    errors.push(
      ...validatePlatformBuildMetadataDockerStage({
        dockerfileLabel: 'apps/web/Dockerfile',
        stageContent: builderStage,
        stageName: 'builder',
      })
    );
  }

  if (runnerStage) {
    errors.push(
      ...validatePlatformBuildMetadataDockerStage({
        dockerfileLabel: 'apps/web/Dockerfile',
        stageContent: runnerStage,
        stageName: 'runner',
      })
    );
  }

  if (!DRAIN_STATUS_HEALTHCHECK_PATTERN.test(runnerStage ?? '')) {
    errors.push(
      'apps/web/Dockerfile runner stage must health-check the internal /__platform/drain-status endpoint.'
    );
  }

  return errors;
}

function validateDepsStageManifestCopies({
  dockerfileContent,
  dockerfileLabel,
  workspacePackageJsonPaths,
  fileDependencyPaths,
}) {
  const errors = [];
  const depsStage = getStageContent(dockerfileContent, 'deps');

  if (!depsStage) {
    errors.push(`${dockerfileLabel} is missing the deps stage.`);
    return errors;
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
      `${dockerfileLabel} deps stage is missing workspace package manifests: ${missingWorkspacePackageJsonPaths.join(
        ', '
      )}`
    );
  }

  if (unexpectedWorkspacePackageJsonPaths.length > 0) {
    errors.push(
      `${dockerfileLabel} deps stage copies non-existent workspace manifests: ${unexpectedWorkspacePackageJsonPaths.join(
        ', '
      )}`
    );
  }

  const missingFileDependencyPaths = fileDependencyPaths.filter(
    (relativePath) => !copiedRelativePaths.includes(relativePath)
  );

  if (missingFileDependencyPaths.length > 0) {
    errors.push(
      `${dockerfileLabel} deps stage is missing file-backed dependencies required by package manifests: ${missingFileDependencyPaths.join(
        ', '
      )}`
    );
  }

  return errors;
}

function validateDockerignore(dockerignoreContent) {
  const errors = [];
  const lines = dockerignoreContent
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));

  for (const pattern of DOCKER_CONTEXT_ARTIFACT_IGNORE_PATTERNS) {
    if (!lines.includes(pattern)) {
      errors.push(
        `.dockerignore must exclude ${pattern} from Docker web build contexts.`
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
  const packageWorkspaceDirs = workspacePackageJsonPaths
    .filter((relativePath) => relativePath.startsWith('packages/'))
    .map((relativePath) => path.posix.dirname(relativePath))
    .sort();
  const requiredSnippets = [
    'services:',
    '  buildkit:',
    '    container_name: ' +
      '${' +
      'COMPOSE_PROJECT_NAME:-tuturuuu' +
      '}-buildkit-1',
    '    image: moby/buildkit:buildx-stable-1',
    '    cpus: $' + '{' + 'DOCKER_WEB_BUILD_CPUS:-4' + '}',
    '      - platform-buildkit-state:/var/lib/buildkit',
    '      - ./tmp/docker-web/buildkit/buildkitd.toml:/etc/buildkit/buildkitd.toml:ro',
    '  platform-buildkit-state:',
    '  web:',
    '      - BACKEND_INTERNAL_TOKEN=${' +
      'BACKEND_INTERNAL_TOKEN:-platform-local-backend-token' +
      '}',
    '      - BACKEND_INTERNAL_URL=${' +
      'BACKEND_INTERNAL_URL:-http://backend:7820' +
      '}',
    '      - CHAT_REALTIME_INTERNAL_URL=${' +
      'CHAT_REALTIME_INTERNAL_URL:-http://chat-realtime:7817' +
      '}',
    '      - CHAT_REALTIME_TOKEN_SECRET',
    '      target: dev',
    '      - .:/workspace\n      - platform-bun-install:/root/.bun/install/cache',
    '      - platform-bun-install:/root/.bun/install/cache',
    '      - path: .env.local',
    '      - SUPABASE_SERVER_URL',
    '      - UPSTASH_REDIS_REST_TOKEN',
    '      - UPSTASH_REDIS_REST_URL',
    '      - "host.docker.internal:host-gateway"',
    '    init: true',
    '      - "127.0.0.1:6379:6379"',
    '      - "127.0.0.1:8079:80"',
    '      SRH_TOKEN: ' +
      '${' +
      'UPSTASH_REDIS_REST_TOKEN:-platform-local-redis-token' +
      '}',
    '  cloudflared:',
    '    profiles: ["cloudflared"]',
    '    image: cloudflare/cloudflared:latest',
    '  hive:',
    '      dockerfile: apps/hive/Dockerfile\n      target: dev',
    '      - HIVE_DATABASE_URL=${' +
      'HIVE_DATABASE_URL:-postgres://hive:hive@hive-postgres:5432/hive' +
      '}',
    '      - HIVE_OLLAMA_BASE_URL=${' +
      'HIVE_OLLAMA_BASE_URL:-http://hive-ollama:11434' +
      '}',
    '  hive-realtime:',
    '      dockerfile: apps/hive-realtime/Dockerfile',
    '      - HIVE_REALTIME_TOKEN_SECRET',
    '  hive-postgres:',
    '      - platform-hive-postgres:/var/lib/postgresql/data',
    '      - ./apps/hive/db/001_schema.sql:/docker-entrypoint-initdb.d/001-hive.sql:ro',
    '  hive-db-migrate:',
    '    command: ["/bin/sh", "/hive-db/migrate-forward.sh"]',
    '      - HIVE_DB_ALLOW_DESTRUCTIVE_RESET=' +
      '${' +
      'HIVE_DB_ALLOW_DESTRUCTIVE_RESET:-0' +
      '}',
    '      - HIVE_DB_DEVOPS_ADMIN_APPROVED=' +
      '${' +
      'HIVE_DB_DEVOPS_ADMIN_APPROVED:-0' +
      '}',
    '      - HIVE_DB_OPERATOR_ROLE=' +
      '${' +
      'HIVE_DB_OPERATOR_ROLE:-runtime' +
      '}',
    '      hive-db-migrate:\n        condition: service_completed_successfully',
    '      - ./apps/hive/db:/hive-db:ro',
    '  hive-ollama:',
    '    profiles: ["hive-ollama"]',
    '  backend:',
    '      dockerfile: apps/backend/Dockerfile',
    '      - BACKEND_ENV=development',
    '      - BACKEND_INTERNAL_TOKEN=${' +
      'BACKEND_INTERNAL_TOKEN:-platform-local-backend-token' +
      '}',
    '      - PORT=7820',
    '      test: ["CMD", "/app/backend", "healthcheck"]',
    '  chat-realtime:',
    '      dockerfile: apps/chat-realtime/Dockerfile',
    'http://127.0.0.1:7817/health',
    '  platform-hive-postgres:',
    '  platform-hive-ollama:',
    'http://127.0.0.1:7815/health',
    '"' + '${' + 'CLOUDFLARED_TOKEN:-' + '}"',
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
  const platformBuildMetadataBuildArgSnippets =
    PLATFORM_BUILD_METADATA_ENV_NAMES.map(
      (envName) => `      ${envName}: \${${envName}:-}`
    );
  const platformBuildMetadataEnvironmentSnippets =
    PLATFORM_BUILD_METADATA_ENV_NAMES.map((envName) => `    - ${envName}`);
  const requiredSnippets = [
    'path: docker-compose/compose.web.prod.log-drain.yml',
    'path: docker-compose/compose.web.prod.buildkit.yml',
    'path: docker-compose/compose.web.prod.web.yml',
    'path: docker-compose/compose.web.prod.edge.yml',
    'path: docker-compose/compose.web.prod.sidecars.yml',
    'path: docker-compose/compose.web.prod.voice.yml',
    'path: docker-compose/compose.web.prod.ops.yml',
    'path: docker-compose/compose.web.prod.redis.yml',
    'x-web-service: &web-service',
    '    args:',
    '      DOCKER_WEB_BUILD_MEMORY: ' +
      '${' +
      'DOCKER_WEB_BUILD_MEMORY:-12g' +
      '}',
    '      DOCKER_WEB_DOCKER_MEMORY_LIMIT: ' +
      '${' +
      'DOCKER_WEB_DOCKER_MEMORY_LIMIT:-' +
      '}',
    '      DOCKER_WEB_NEXT_APP_ONLY: ' +
      '${' +
      'DOCKER_WEB_NEXT_APP_ONLY:-1' +
      '}',
    '      DOCKER_WEB_NEXT_BUILD_ENGINE: ' +
      '${' +
      'DOCKER_WEB_NEXT_BUILD_ENGINE:-turbopack' +
      '}',
    '      DOCKER_WEB_NODE_MAX_OLD_SPACE_SIZE: ' +
      '${' +
      'DOCKER_WEB_NODE_MAX_OLD_SPACE_SIZE:-auto' +
      '}',
    '      DOCKER_WEB_REACT_COMPILER: ' +
      '${' +
      'DOCKER_WEB_REACT_COMPILER:-0' +
      '}',
    ...platformBuildMetadataBuildArgSnippets,
    '  web:',
    '  web-blue:',
    '  web-green:',
    '  buildkit:',
    '  web-blue-green-watcher:',
    '  web-cron-runner:',
    '  cloudflared:',
    'x-hive-service: &hive-service',
    '  backend:',
    '  chat-realtime:',
    '  hive-blue:',
    '  hive-green:',
    '  hive-realtime:',
    '  meet-realtime:',
    '  hive-postgres:',
    '  hive-db-migrate:',
    '  hive-ollama:',
    '  supermemory-postgres:',
    '  supermemory-db-migrate:',
    '  supermemory:',
    '  markitdown:',
    '  storage-unzip-proxy:',
    '  web-proxy:',
    '      dockerfile: Dockerfile.markitdown',
    '    dockerfile: apps/hive/Dockerfile\n    target: runner\n    secrets:\n      - web_env',
    '      dockerfile: apps/backend/Dockerfile',
    '      dockerfile: apps/chat-realtime/Dockerfile',
    '      dockerfile: apps/hive-realtime/Dockerfile',
    '      dockerfile: apps/meet-realtime/Dockerfile',
    '      dockerfile: apps/supermemory/Dockerfile',
    '      dockerfile: apps/web/docker/blue-green-watcher.Dockerfile',
    '      dockerfile: apps/web/docker/cron-runner.Dockerfile',
    '    container_name: ' +
      '${' +
      'COMPOSE_PROJECT_NAME:-tuturuuu' +
      '}-buildkit-1',
    '    image: moby/buildkit:buildx-stable-1',
    '    cpus: $' + '{' + 'DOCKER_WEB_BUILD_CPUS:-4' + '}',
    '      - platform-buildkit-state:/var/lib/buildkit',
    '      - ../tmp/docker-web/buildkit/buildkitd.toml:/etc/buildkit/buildkitd.toml:ro',
    '    env_file:',
    '    - path: $' +
      '{' +
      'DOCKER_WEB_COMPOSE_LEGACY_ENV_FILE:-../apps/web/.env.local' +
      '}',
    '    - path: $' + '{' + 'DOCKER_WEB_COMPOSE_ENV_FILE:-../.env.local' + '}',
    '      - path: $' +
      '{' +
      'DOCKER_WEB_COMPOSE_LEGACY_ENV_FILE:-../apps/web/.env.local' +
      '}',
    '      - path: $' +
      '{' +
      'DOCKER_WEB_COMPOSE_ENV_FILE:-../.env.local' +
      '}',
    '      - CLOUDFLARED_TOKEN',
    '      - DOCKER_WEB_BUILDKIT_ENDPOINT=tcp://buildkit:1234',
    '      - DOCKER_WEB_WITH_CLOUDFLARED',
    '      - GITHUB_TOKEN',
    '      - PLATFORM_LOG_DRAIN_DATABASE_URL=postgres://platform_log_drain:platform_log_drain@log-drain-postgres:5432/platform_log_drain',
    '      - PLATFORM_LOG_DRAIN_ENABLED=' +
      '${' +
      'PLATFORM_LOG_DRAIN_ENABLED:-true' +
      '}',
    '      - BETTER_AUTH_SECRET',
    '      - SUPERMEMORY_API_KEY',
    '      - SUPERMEMORY_BASE_URL=${' +
      'SUPERMEMORY_BASE_URL:-http://supermemory:8787' +
      '}',
    '      - SUPERMEMORY_DATABASE_URL',
    '      - SUPERMEMORY_ENABLED=${' + 'SUPERMEMORY_ENABLED:-true' + '}',
    '      - SUPERMEMORY_FAIL_OPEN=${' + 'SUPERMEMORY_FAIL_OPEN:-true' + '}',
    '      - SUPERMEMORY_POSTGRES_PASSWORD',
    '      - SUPERMEMORY_TIMEOUT_MS=${' + 'SUPERMEMORY_TIMEOUT_MS:-1500' + '}',
    '      - UPSTASH_REDIS_REST_TOKEN',
    '      - UPSTASH_REDIS_REST_URL',
    '      context: ../apps/storage-unzip-proxy',
    '    - CRON_SECRET',
    '      - CRON_SECRET',
    '      - VERCEL_CRON_SECRET',
    '      - PLATFORM_CRON_CONTROL_DIR=' +
      '${' +
      'PLATFORM_HOST_WORKSPACE_DIR:-/workspace-host' +
      '}' +
      '/tmp/docker-web/watch/control',
    '      - PLATFORM_CRON_MONITORING_DIR=' +
      '${' +
      'PLATFORM_HOST_WORKSPACE_DIR:-/workspace-host' +
      '}' +
      '/tmp/docker-web/cron',
    '      - PLATFORM_HOST_WORKSPACE_DIR=' +
      '${' +
      'PLATFORM_HOST_WORKSPACE_DIR:-/workspace-host' +
      '}',
    '      - ..:' + '${' + 'PLATFORM_HOST_WORKSPACE_DIR:-/workspace-host' + '}',
    '      - /var/run/docker.sock:/var/run/docker.sock',
    '      - platform-bun-install:/root/.bun/install/cache',
    '      - platform-blue-green-watcher-node_modules:/workspace/node_modules',
    '      - platform-blue-green-watcher-node_modules:' +
      '${' +
      'PLATFORM_HOST_WORKSPACE_DIR:-/workspace-host' +
      '}' +
      '/node_modules',
    '    image: nginx:1.31.0-alpine',
    '    image: cloudflare/cloudflared:latest',
    '${' + 'DOCKER_WEB_DIRECT_HOST_PORT:-7803' + '}:7803',
    '${' + 'DOCKER_WEB_PROXY_HOST_PORT:-7803' + '}:7803',
    '${' + 'DOCKER_HIVE_PROXY_HOST_PORT:-7814' + '}:7814',
    '${' + 'DOCKER_MEET_REALTIME_PROXY_HOST_PORT:-7816' + '}:7816',
    '127.0.0.1:$' + '{' + 'DOCKER_WEB_REDIS_HOST_PORT:-6379' + '}:6379',
    '127.0.0.1:$' +
      '{' +
      'DOCKER_WEB_SERVERLESS_REDIS_HTTP_HOST_PORT:-8079' +
      '}:80',
    'http://127.0.0.1:7803/__platform/drain-status',
    'http://127.0.0.1:8000/health',
    'http://127.0.0.1:7815/health',
    'http://127.0.0.1:7816/health',
    'http://127.0.0.1:8788/health',
    "http://127.0.0.1:'' + port + path",
    '      test: ["CMD", "/app/backend", "healthcheck"]',
    '      - BACKEND_ENV=production\n      - BACKEND_INTERNAL_TOKEN\n      - PORT=7820',
    '      - PORT=8000\n      - SUPABASE_URL',
    'wget -q -O - --header="Authorization: Bearer $$SRH_TOKEN" --header="Content-Type: application/json" --post-data=\'\'["PING"]\'\' http://127.0.0.1:80/ | grep -q \'\'"PONG"\'\'',
    "ps | grep -q '[w]atch-blue-green-deploy.js'",
    "ps | grep -q '[w]atch-web-crons.js'",
    '      - ../tmp/docker-web/prod/nginx.conf:/etc/nginx/conf.d/default.conf:ro',
    '      required: false',
    '    - BACKEND_INTERNAL_TOKEN',
    '    - BACKEND_INTERNAL_URL=${' +
      'BACKEND_INTERNAL_URL:-http://backend:7820' +
      '}',
    '    - DISCORD_APP_DEPLOYMENT_URL',
    '    - DRIVE_AUTO_EXTRACT_PROXY_TOKEN',
    '    - DRIVE_AUTO_EXTRACT_PROXY_URL',
    '    - HIVE_DATABASE_URL=${' +
      'HIVE_DATABASE_URL:-postgres://hive:hive@hive-postgres:5432/hive' +
      '}',
    '    - HIVE_OLLAMA_BASE_URL=${' +
      'HIVE_OLLAMA_BASE_URL:-http://hive-ollama:11434' +
      '}',
    '    - HIVE_REALTIME_TOKEN_SECRET',
    '    - MEET_REALTIME_TOKEN_SECRET',
    '    - CLOUDFLARE_REALTIME_APP_ID',
    '    - CLOUDFLARE_REALTIME_APP_SECRET',
    '    - INTERNAL_WEB_API_ORIGIN=${' +
      'INTERNAL_WEB_API_ORIGIN:-http://web-proxy:7803' +
      '}',
    '    - MARKITDOWN_ENDPOINT_SECRET',
    '    - MARKITDOWN_ENDPOINT_URL',
    '    - PLATFORM_BLUE_GREEN_COLOR',
    ...platformBuildMetadataEnvironmentSnippets,
    '    - PLATFORM_BLUE_GREEN_CONTROL_DIR=/app/runtime/docker-web-control',
    '    - PLATFORM_BLUE_GREEN_MONITORING_DIR=/app/runtime/docker-web',
    '    - PLATFORM_DEPLOYMENT_STAMP',
    '    - PLATFORM_LOG_DRAIN_DATABASE_URL=postgres://platform_log_drain:platform_log_drain@log-drain-postgres:5432/platform_log_drain',
    '    - PLATFORM_LOG_DRAIN_ENABLED=' +
      '${' +
      'PLATFORM_LOG_DRAIN_ENABLED:-true' +
      '}',
    '    - PLATFORM_LOG_DRAIN_RAW_RETENTION_DAYS=' +
      '${' +
      'PLATFORM_LOG_DRAIN_RAW_RETENTION_DAYS:-30' +
      '}',
    '    - PLATFORM_LOG_DRAIN_SUMMARY_RETENTION_DAYS=' +
      '${' +
      'PLATFORM_LOG_DRAIN_SUMMARY_RETENTION_DAYS:-90' +
      '}',
    '    - SUPABASE_SERVER_URL',
    '    - SUPERMEMORY_API_KEY',
    '    - SUPERMEMORY_BASE_URL=${' +
      'SUPERMEMORY_BASE_URL:-http://supermemory:8787' +
      '}',
    '    - SUPERMEMORY_ENABLED=${' + 'SUPERMEMORY_ENABLED:-false' + '}',
    '    - SUPERMEMORY_FAIL_OPEN=${' + 'SUPERMEMORY_FAIL_OPEN:-true' + '}',
    '    - SUPERMEMORY_TIMEOUT_MS=${' + 'SUPERMEMORY_TIMEOUT_MS:-1500' + '}',
    '    - UPSTASH_REDIS_REST_TOKEN',
    '    - UPSTASH_REDIS_REST_URL',
    '    - ../tmp/docker-web/watch/control:/app/runtime/docker-web-control',
    '    - ../tmp/docker-web:/app/runtime/docker-web:ro',
    '  hive-postgres:',
    '    container_name: ' +
      '${' +
      'COMPOSE_PROJECT_NAME:-tuturuuu' +
      '}-hive-postgres-1',
    '      POSTGRES_DB: hive',
    '      POSTGRES_USER: hive',
    '      - platform-hive-postgres:/var/lib/postgresql/data',
    '      - ../apps/hive/db/001_schema.sql:/docker-entrypoint-initdb.d/001-hive.sql:ro',
    '    command: ["/bin/sh", "/hive-db/migrate-forward.sh"]',
    '      - HIVE_DB_ALLOW_DESTRUCTIVE_RESET=' +
      '${' +
      'HIVE_DB_ALLOW_DESTRUCTIVE_RESET:-0' +
      '}',
    '      - HIVE_DB_DEVOPS_ADMIN_APPROVED=' +
      '${' +
      'HIVE_DB_DEVOPS_ADMIN_APPROVED:-0' +
      '}',
    '      - HIVE_DB_OPERATOR_ROLE=' +
      '${' +
      'HIVE_DB_OPERATOR_ROLE:-runtime' +
      '}',
    '      hive-db-migrate:\n        condition: service_completed_successfully',
    '      - ../apps/hive/db:/hive-db:ro',
    '  hive-ollama:',
    '    profiles: ["hive-ollama"]',
    '  log-drain-postgres:',
    '    container_name: ' +
      '${' +
      'COMPOSE_PROJECT_NAME:-tuturuuu' +
      '}-log-drain-postgres-1',
    '    image: postgres:16-alpine',
    '      POSTGRES_DB: platform_log_drain',
    '      POSTGRES_USER: platform_log_drain',
    '      - platform-log-drain-postgres:/var/lib/postgresql/data',
    '      - ../apps/web/docker/log-drain-init.sql:/docker-entrypoint-initdb.d/001-log-drain.sql:ro',
    '  platform-buildkit-state:',
    '  platform-log-drain-postgres:',
    '  platform-hive-postgres:',
    '  platform-supermemory-postgres:',
    '  platform-hive-ollama:',
    '    image: pgvector/pgvector:pg16',
    '      POSTGRES_DB: supermemory',
    '      POSTGRES_USER: supermemory',
    '      - platform-supermemory-postgres:/var/lib/postgresql/data',
    '    command: ["/bin/sh", "/supermemory-db/migrate-forward.sh"]',
    '      supermemory-db-migrate:\n        condition: service_completed_successfully',
    '      - ../apps/supermemory/db:/supermemory-db:ro',
    '      - NODE_ENV=production',
    '      - PORT=8787',
    '      - SUPERMEMORY_DATABASE_URL=${' +
      'SUPERMEMORY_DATABASE_URL:-postgres://supermemory:$' +
      '{SUPERMEMORY_POSTGRES_PASSWORD:?Set SUPERMEMORY_POSTGRES_PASSWORD for AI memory Postgres or configure SUPERMEMORY_DATABASE_URL}' +
      '@supermemory-postgres:5432/supermemory' +
      '}',
    '      - DRIVE_UNZIP_PROXY_SHARED_TOKEN',
    '      SRH_TOKEN: ' +
      '${' +
      'UPSTASH_REDIS_REST_TOKEN:?UPSTASH_REDIS_REST_TOKEN is required' +
      '}',
    '    file: $' + '{' + 'DOCKER_WEB_ENV_FILE:-apps/web/.env.local' + '}',
  ];

  for (const snippet of requiredSnippets) {
    if (!composeContent.includes(snippet)) {
      errors.push(
        `docker-compose.web.prod.yml is missing the expected snippet: ${snippet}`
      );
    }
  }

  const forbiddenSecuritySnippets = [
    {
      message:
        'production Redis native port must bind to 127.0.0.1 instead of all host interfaces',
      snippet:
        '      - "$' + '{' + 'DOCKER_WEB_REDIS_HOST_PORT:-6379' + '}:6379"',
    },
    {
      message:
        'production Redis HTTP bridge port must bind to 127.0.0.1 instead of all host interfaces',
      snippet:
        '      - "$' +
        '{' +
        'DOCKER_WEB_SERVERLESS_REDIS_HTTP_HOST_PORT:-8079' +
        '}:80"',
    },
    {
      message:
        'production Redis HTTP bridge must require UPSTASH_REDIS_REST_TOKEN and must not use the local fallback token',
      snippet:
        '      SRH_TOKEN: ' +
        '$' +
        '{' +
        'UPSTASH_REDIS_REST_TOKEN:-platform-local-redis-token' +
        '}',
    },
  ];

  for (const { message, snippet } of forbiddenSecuritySnippets) {
    if (composeContent.includes(snippet)) {
      errors.push(`${message}: ${snippet}`);
    }
  }

  const forbiddenSnippets = [
    '      context: .\n      dockerfile: apps/',
    '      context: apps/',
    '      - path: apps/web/.env.local',
    '      - path: .env.local',
    '      - ./tmp/docker-web',
    '      - ./apps/',
    '      - .:/workspace',
    'SUPERMEMORY_IMAGE',
    'supermemory-enterprise-self-host',
  ];

  for (const snippet of forbiddenSnippets) {
    if (composeContent.includes(snippet)) {
      errors.push(
        `docker-compose.web.prod.yml still contains an include-relative repo path that resolves from docker-compose/: ${snippet}`
      );
    }
  }

  return errors;
}

function validateDockerBakeFile(bakeContent) {
  const errors = [];
  const composeProjectNameVariable = '${' + 'COMPOSE_PROJECT_NAME' + '}';
  const requiredSnippets = [
    'target "_platform_local" {\n  output = ["type=docker"]\n}',
    'group "blue-green-support" {\n  targets = ["backend", "chat-realtime", "meet-realtime", "markitdown", "storage-unzip-proxy", "supermemory", "web-cron-runner"]\n}',
    `target "backend" {\n  inherits = ["_platform_local"]\n  tags = ["${composeProjectNameVariable}-backend"]\n}`,
    `target "chat-realtime" {\n  inherits = ["_platform_local"]\n  tags = ["${composeProjectNameVariable}-chat-realtime"]\n}`,
    `target "meet-realtime" {\n  inherits = ["_platform_local"]\n  tags = ["${composeProjectNameVariable}-meet-realtime"]\n}`,
    `target "supermemory" {\n  inherits = ["_platform_local"]\n  tags = ["${composeProjectNameVariable}-supermemory"]\n}`,
  ];

  for (const snippet of requiredSnippets) {
    if (!bakeContent.includes(snippet)) {
      errors.push(
        `docker-bake.web.prod.hcl is missing the expected snippet: ${snippet}`
      );
    }
  }

  return errors;
}

function validateBackendDockerfile(dockerfileContent) {
  const errors = [];
  const requiredSnippets = [
    'FROM golang:1.26.3-alpine AS builder',
    'COPY apps/backend/go.mod ./apps/backend/go.mod',
    'RUN go mod download',
    'RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/backend ./cmd/backend',
    'FROM gcr.io/distroless/static-debian12:nonroot AS runner',
    'HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 CMD ["/app/backend", "healthcheck"]',
    'USER nonroot:nonroot',
    'CMD ["/app/backend"]',
  ];

  for (const snippet of requiredSnippets) {
    if (!dockerfileContent.includes(snippet)) {
      errors.push(
        `apps/backend/Dockerfile is missing the expected snippet: ${snippet}`
      );
    }
  }

  return errors;
}

function validateWatcherDockerfile(dockerfileContent) {
  const errors = [];
  const requiredSnippets = [
    'FROM oven/bun:1.3.14-alpine',
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

function validateCronRunnerDockerfile(dockerfileContent) {
  const errors = [];
  const requiredSnippets = [
    'FROM oven/bun:1.3.14-alpine',
    'RUN apk add --no-cache docker-cli docker-cli-compose',
    'COPY apps/web/docker/cron-runner-entrypoint.js /usr/local/bin/cron-runner-entrypoint.js',
    'CMD ["bun", "/usr/local/bin/cron-runner-entrypoint.js"]',
  ];

  for (const snippet of requiredSnippets) {
    if (!dockerfileContent.includes(snippet)) {
      errors.push(
        `apps/web/docker/cron-runner.Dockerfile is missing the expected snippet: ${snippet}`
      );
    }
  }

  return errors;
}

function validateNativeWebRunnerDockerfile(
  dockerfileContent,
  dockerignoreContent
) {
  const errors = [];
  const dockerfileSnippets = [
    'FROM node:24-bookworm-slim AS runner',
    ...PLATFORM_BUILD_METADATA_ENV_NAMES.flatMap((envName) => [
      `ARG ${envName}=`,
      `ENV ${envName}=${getDockerEnvReferenceSnippet(envName)}`,
    ]),
    'COPY --chown=nextjs:nodejs apps/web/.next/standalone ./',
    'COPY --chown=nextjs:nodejs apps/web/.next/static ./apps/web/.next/static',
    'COPY --chown=nextjs:nodejs apps/web/docker/coolify-env.js ./apps/web/docker/coolify-env.js',
    'COPY --chown=nextjs:nodejs apps/web/docker/prod-entrypoint.js ./apps/web/docker/prod-entrypoint.js',
    'COPY --chown=nextjs:nodejs apps/web/docker/request-tracker.js ./apps/web/docker/request-tracker.js',
    'COPY --chown=nextjs:nodejs apps/web/cron.config.json ./apps/web/cron.config.json',
    'COPY --chown=nextjs:nodejs apps/web/public ./apps/web/public',
    'HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3',
    'CMD ["node", "apps/web/docker/prod-entrypoint.js"]',
  ];
  const dockerignoreSnippets = [
    '**',
    '!apps/web/.next/standalone/**',
    '!apps/web/.next/static/**',
    '!apps/web/cron.config.json',
    '!apps/web/docker/coolify-env.js',
    '!apps/web/docker/prod-entrypoint.js',
    '!apps/web/docker/request-tracker.js',
    '!apps/web/public/**',
  ];

  for (const snippet of dockerfileSnippets) {
    if (!dockerfileContent.includes(snippet)) {
      errors.push(
        `apps/web/docker/native-runner.Dockerfile is missing the expected snippet: ${snippet}`
      );
    }
  }

  if (/bun\s+run\s+build|next\s+build/u.test(dockerfileContent)) {
    errors.push(
      'apps/web/docker/native-runner.Dockerfile must only package prebuilt native artifacts, not run a build.'
    );
  }

  for (const snippet of dockerignoreSnippets) {
    if (!dockerignoreContent.includes(snippet)) {
      errors.push(
        `apps/web/docker/native-runner.Dockerfile.dockerignore is missing the expected snippet: ${snippet}`
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

function validateHiveDockerfile(
  dockerfileContent,
  {
    workspacePackageJsonPaths = listWorkspacePackageJsonPaths(),
    fileDependencyPaths = listFileDependencyPaths(),
  } = {}
) {
  const errors = [
    ...validateDepsStageManifestCopies({
      dockerfileContent,
      dockerfileLabel: 'apps/hive/Dockerfile',
      fileDependencyPaths,
      workspacePackageJsonPaths,
    }),
  ];
  const requiredSnippets = [
    'FROM node:24-bookworm-slim AS builder',
    'COPY scripts/run-web-docker-next-build.js ./scripts/run-web-docker-next-build.js',
    'COPY scripts/run-hive-docker-next-build.js ./scripts/run-hive-docker-next-build.js',
    'COPY --from=deps /usr/local/bin/bun /usr/local/bin/bun',
    'ENV DOCKER_WEB_NODE_BINARY=/usr/local/bin/node',
    'bun install --frozen-lockfile --filter @tuturuuu/hive',
    'bun run --filter @tuturuuu/types build',
    'bun run --filter @tuturuuu/internal-api build',
    'bun run --filter @tuturuuu/supabase build',
    'node scripts/run-hive-docker-next-build.js --env-file /tmp/web.env',
  ];

  for (const snippet of requiredSnippets) {
    if (!dockerfileContent.includes(snippet)) {
      errors.push(
        `apps/hive/Dockerfile is missing the expected snippet: ${snippet}`
      );
    }
  }

  return errors;
}

function validateHiveRealtimeDockerfile(
  dockerfileContent,
  {
    workspacePackageJsonPaths = listWorkspacePackageJsonPaths(),
    fileDependencyPaths = listFileDependencyPaths(),
  } = {}
) {
  const errors = [
    ...validateDepsStageManifestCopies({
      dockerfileContent,
      dockerfileLabel: 'apps/hive-realtime/Dockerfile',
      fileDependencyPaths,
      workspacePackageJsonPaths,
    }),
  ];
  const requiredSnippets = [
    'bun install --frozen-lockfile --production --filter @tuturuuu/hive-realtime --linker hoisted',
    'COPY --from=deps /workspace/node_modules ./node_modules',
    'COPY --from=deps /workspace/apps/hive-realtime/package.json ./apps/hive-realtime/package.json',
    'CMD ["bun", "apps/hive-realtime/src/index.ts"]',
  ];

  for (const snippet of requiredSnippets) {
    if (!dockerfileContent.includes(snippet)) {
      errors.push(
        `apps/hive-realtime/Dockerfile is missing the expected snippet: ${snippet}`
      );
    }
  }

  return errors;
}

function validateMeetRealtimeDockerfile(
  dockerfileContent,
  {
    workspacePackageJsonPaths = listWorkspacePackageJsonPaths(),
    fileDependencyPaths = listFileDependencyPaths(),
  } = {}
) {
  const errors = [
    ...validateDepsStageManifestCopies({
      dockerfileContent,
      dockerfileLabel: 'apps/meet-realtime/Dockerfile',
      fileDependencyPaths,
      workspacePackageJsonPaths,
    }),
  ];
  const depsStage = getStageContent(dockerfileContent, 'deps');
  const runnerStage = getStageContent(dockerfileContent, 'runner');

  if (!depsStage) {
    errors.push('apps/meet-realtime/Dockerfile is missing the deps stage.');
  }

  if (!runnerStage) {
    errors.push('apps/meet-realtime/Dockerfile is missing the runner stage.');
  }

  const requiredSnippets = [
    'COPY package.json bun.lock turbo.json ./',
    'COPY scripts/install-git-hooks.js ./scripts/install-git-hooks.js',
    'COPY packages/realtime/package.json ./packages/realtime/package.json',
    '--mount=type=cache,id=platform-meet-realtime-bun-install,target=/root/.bun/install/cache',
    'bun install --frozen-lockfile --production --filter @tuturuuu/realtime --linker hoisted',
    'COPY --from=deps /workspace/node_modules ./node_modules',
    'COPY packages/realtime ./packages/realtime',
    'COPY apps/meet-realtime/src ./apps/meet-realtime/src',
    'CMD ["bun", "apps/meet-realtime/src/index.ts"]',
  ];

  for (const snippet of requiredSnippets) {
    if (!dockerfileContent.includes(snippet)) {
      errors.push(
        `apps/meet-realtime/Dockerfile is missing the expected snippet: ${snippet}`
      );
    }
  }

  return errors;
}

function validateChatRealtimeDockerfile(
  dockerfileContent,
  {
    workspacePackageJsonPaths = listWorkspacePackageJsonPaths(),
    fileDependencyPaths = listFileDependencyPaths(),
  } = {}
) {
  const errors = [
    ...validateDepsStageManifestCopies({
      dockerfileContent,
      dockerfileLabel: 'apps/chat-realtime/Dockerfile',
      fileDependencyPaths,
      workspacePackageJsonPaths,
    }),
  ];
  const depsStage = getStageContent(dockerfileContent, 'deps');
  const runnerStage = getStageContent(dockerfileContent, 'runner');

  if (!depsStage) {
    errors.push('apps/chat-realtime/Dockerfile is missing the deps stage.');
  }

  if (!runnerStage) {
    errors.push('apps/chat-realtime/Dockerfile is missing the runner stage.');
  }

  const requiredSnippets = [
    'COPY package.json bun.lock turbo.json ./',
    'COPY scripts/install-git-hooks.js ./scripts/install-git-hooks.js',
    'COPY packages/realtime/package.json ./packages/realtime/package.json',
    '--mount=type=cache,id=platform-chat-realtime-bun-install,target=/root/.bun/install/cache',
    'bun install --frozen-lockfile --production --filter @tuturuuu/realtime --linker hoisted',
    'COPY --from=deps /workspace/node_modules ./node_modules',
    'COPY packages/realtime ./packages/realtime',
    'COPY apps/chat-realtime/src ./apps/chat-realtime/src',
    'CMD ["bun", "apps/chat-realtime/src/index.ts"]',
  ];

  for (const snippet of requiredSnippets) {
    if (!dockerfileContent.includes(snippet)) {
      errors.push(
        `apps/chat-realtime/Dockerfile is missing the expected snippet: ${snippet}`
      );
    }
  }

  return errors;
}

function validateHiveDbMigrateScript(scriptContent) {
  const errors = [];
  const requiredSnippets = [
    'HIVE_DATABASE_URL="$' +
      '{' +
      'HIVE_DATABASE_URL:?HIVE_DATABASE_URL is required' +
      '}"',
    'HIVE_DB_BASELINE_VERSION="$' +
      '{' +
      'HIVE_DB_BASELINE_VERSION:-20260518104000' +
      '}"',
    'create table if not exists hive_schema_migrations',
    'version_lte()',
    'assert_not_before_recorded_floor()',
    'max(applied_at)::text',
    'HIVE_DB_OPERATOR_ROLE="$' + '{' + 'HIVE_DB_OPERATOR_ROLE:-runtime' + '}"',
    'HIVE_DB_ALLOW_DESTRUCTIVE_RESET="$' +
      '{' +
      'HIVE_DB_ALLOW_DESTRUCTIVE_RESET:-0' +
      '}"',
    'HIVE_DB_DEVOPS_ADMIN_APPROVED="$' +
      '{' +
      'HIVE_DB_DEVOPS_ADMIN_APPROVED:-0' +
      '}"',
    'HIVE_DB_OPERATOR_ROLE" = "devops-admin"',
    'HIVE_DB_ALLOW_DESTRUCTIVE_RESET" = "1"',
    'HIVE_DB_DEVOPS_ADMIN_APPROVED" = "1"',
  ];

  for (const snippet of requiredSnippets) {
    if (!scriptContent.includes(snippet)) {
      errors.push(
        `apps/hive/db/migrate-forward.sh is missing the expected snippet: ${snippet}`
      );
    }
  }

  return errors;
}

function validateSupermemoryDockerfile(
  dockerfileContent,
  {
    workspacePackageJsonPaths = listWorkspacePackageJsonPaths(),
    fileDependencyPaths = listFileDependencyPaths(),
  } = {}
) {
  const errors = [
    ...validateDepsStageManifestCopies({
      dockerfileContent,
      dockerfileLabel: 'apps/supermemory/Dockerfile',
      fileDependencyPaths,
      workspacePackageJsonPaths,
    }),
  ];
  const requiredSnippets = [
    'FROM oven/bun:1.3.14-alpine AS deps',
    'COPY apps/supermemory/package.json ./apps/supermemory/package.json',
    'bun install --frozen-lockfile --production --filter @tuturuuu/supermemory --linker hoisted',
    'COPY --chown=app:app apps/supermemory/src ./apps/supermemory/src',
    'CMD ["bun", "apps/supermemory/src/server.js"]',
  ];

  for (const snippet of requiredSnippets) {
    if (!dockerfileContent.includes(snippet)) {
      errors.push(
        `apps/supermemory/Dockerfile is missing the expected snippet: ${snippet}`
      );
    }
  }

  const forbiddenSnippets = [
    'SUPERMEMORY_IMAGE',
    'supermemory-enterprise-self-host',
    'FROM $' + '{SUPERMEMORY_IMAGE}',
  ];

  for (const snippet of forbiddenSnippets) {
    if (dockerfileContent.includes(snippet)) {
      errors.push(
        `apps/supermemory/Dockerfile still contains the removed enterprise image contract: ${snippet}`
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
  backendDockerfileContent = fsImpl.readFileSync(
    path.join(rootDir, 'apps', 'backend', 'Dockerfile'),
    'utf8'
  ),
  composeContent = fsImpl.readFileSync(
    path.join(rootDir, 'docker-compose.web.yml'),
    'utf8'
  ),
  prodComposeContent = readDockerProdComposeMergedText(rootDir, fsImpl),
  dockerBakeContent = fsImpl.readFileSync(
    path.join(rootDir, 'docker-bake.web.prod.hcl'),
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
  cronRunnerDockerfileContent = fsImpl.readFileSync(
    path.join(rootDir, 'apps', 'web', 'docker', 'cron-runner.Dockerfile'),
    'utf8'
  ),
  nativeWebRunnerDockerfileContent = fsImpl.readFileSync(
    path.join(rootDir, 'apps', 'web', 'docker', 'native-runner.Dockerfile'),
    'utf8'
  ),
  nativeWebRunnerDockerignoreContent = fsImpl.readFileSync(
    path.join(
      rootDir,
      'apps',
      'web',
      'docker',
      'native-runner.Dockerfile.dockerignore'
    ),
    'utf8'
  ),
  dockerignoreContent = fsImpl.readFileSync(
    path.join(rootDir, '.dockerignore'),
    'utf8'
  ),
  markitdownDockerfileContent = fsImpl.readFileSync(
    path.join(rootDir, 'apps', 'discord', 'Dockerfile.markitdown'),
    'utf8'
  ),
  hiveDockerfileContent = fsImpl.readFileSync(
    path.join(rootDir, 'apps', 'hive', 'Dockerfile'),
    'utf8'
  ),
  hiveRealtimeDockerfileContent = fsImpl.readFileSync(
    path.join(rootDir, 'apps', 'hive-realtime', 'Dockerfile'),
    'utf8'
  ),
  meetRealtimeDockerfileContent = fsImpl.readFileSync(
    path.join(rootDir, 'apps', 'meet-realtime', 'Dockerfile'),
    'utf8'
  ),
  chatRealtimeDockerfileContent = fsImpl.readFileSync(
    path.join(rootDir, 'apps', 'chat-realtime', 'Dockerfile'),
    'utf8'
  ),
  supermemoryDockerfileContent = fsImpl.readFileSync(
    path.join(rootDir, 'apps', 'supermemory', 'Dockerfile'),
    'utf8'
  ),
  hiveDbMigrateScriptContent = fsImpl.readFileSync(
    path.join(rootDir, 'apps', 'hive', 'db', 'migrate-forward.sh'),
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
    ...validateBackendDockerfile(backendDockerfileContent),
    ...validateDockerCompose(composeContent, { workspacePackageJsonPaths }),
    ...validateDockerProdCompose(prodComposeContent),
    ...validateDockerBakeFile(dockerBakeContent),
    ...validateDockerignore(dockerignoreContent),
    ...validateWatcherDockerfile(watcherDockerfileContent),
    ...validateCronRunnerDockerfile(cronRunnerDockerfileContent),
    ...validateNativeWebRunnerDockerfile(
      nativeWebRunnerDockerfileContent,
      nativeWebRunnerDockerignoreContent
    ),
    ...validateMarkitdownDockerfile(markitdownDockerfileContent),
    ...validateHiveDockerfile(hiveDockerfileContent, {
      fileDependencyPaths,
      workspacePackageJsonPaths,
    }),
    ...validateHiveRealtimeDockerfile(hiveRealtimeDockerfileContent, {
      fileDependencyPaths,
      workspacePackageJsonPaths,
    }),
    ...validateMeetRealtimeDockerfile(meetRealtimeDockerfileContent, {
      fileDependencyPaths,
      workspacePackageJsonPaths,
    }),
    ...validateChatRealtimeDockerfile(chatRealtimeDockerfileContent, {
      fileDependencyPaths,
      workspacePackageJsonPaths,
    }),
    ...validateSupermemoryDockerfile(supermemoryDockerfileContent, {
      fileDependencyPaths,
      workspacePackageJsonPaths,
    }),
    ...validateHiveDbMigrateScript(hiveDbMigrateScriptContent),
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
  BACKEND_DOCKERFILE_PATH,
  HIVE_DOCKERFILE_PATH,
  HIVE_DB_MIGRATE_SCRIPT_PATH,
  HIVE_REALTIME_DOCKERFILE_PATH,
  MEET_REALTIME_DOCKERFILE_PATH,
  CHAT_REALTIME_DOCKERFILE_PATH,
  MARKITDOWN_DOCKERFILE_PATH,
  SUPERMEMORY_DOCKERFILE_PATH,
  CRON_RUNNER_DOCKERFILE_PATH,
  NATIVE_WEB_RUNNER_DOCKERFILE_PATH,
  NATIVE_WEB_RUNNER_DOCKERIGNORE_PATH,
  DOCKERIGNORE_PATH,
  DOCKER_BAKE_WEB_PROD_PATH,
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
  validateBackendDockerfile,
  validateChatRealtimeDockerfile,
  validateDockerCompose,
  validateDockerBakeFile,
  validateDockerProdCompose,
  validateDockerignore,
  validateDockerfile,
  validateCronRunnerDockerfile,
  validateDepsStageManifestCopies,
  validateHiveDockerfile,
  validateHiveDbMigrateScript,
  validateHiveRealtimeDockerfile,
  validateMarkitdownDockerfile,
  validateMeetRealtimeDockerfile,
  validateNativeWebRunnerDockerfile,
  validateSupermemoryDockerfile,
  validateWatcherDockerfile,
};
