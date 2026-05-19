const DEFAULT_PLATFORM_PROJECT_ID = 'platform';
const DEFAULT_PLATFORM_BRANCH = 'production';
const LOG_DRAIN_DATABASE_URL_KEY = 'PLATFORM_LOG_DRAIN_DATABASE_URL';
const RESERVED_MANAGED_PROJECT_HOSTNAMES = new Set([
  'api.tuturuuu.com',
  'calendar.tuturuuu.com',
  'cms.tuturuuu.com',
  'dev.tuturuuu.com',
  'finance.tuturuuu.com',
  'hive.tuturuuu.com',
  'inventory.tuturuuu.com',
  'learn.tuturuuu.com',
  'localhost',
  'mira.tuturuuu.com',
  'nova.ai.vn',
  'platform.tuturuuu.com',
  'rewise.me',
  'staging.tuturuuu.com',
  'tasks.tuturuuu.com',
  'teach.tuturuuu.com',
  'track.tuturuuu.com',
  'tuturuuu.com',
  'www.tuturuuu.com',
]);
const SAFE_MANAGED_PROJECT_HOSTNAME_PATTERN =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;
const fs = require('node:fs');
const path = require('node:path');
const {
  getBlueGreenPaths,
  readBlueGreenActiveColor,
  readBlueGreenDeploymentStamp,
  readBlueGreenProxyActiveColor,
  reloadBlueGreenProxy,
  resolveBlueGreenStandbyColor,
  validateBlueGreenProxyConfig,
  writeBlueGreenProxyConfig,
} = require('../docker-web/blue-green.js');
const {
  getComposeCommandArgs,
  getComposeFile,
  runChecked,
} = require('../docker-web/compose.js');
const { getDockerWebComposeProjectName } = require('../docker-web/env.js');
const {
  DeploymentBuildLockConflictError,
  acquireDeploymentBuildLock,
  describeActiveDeploymentConflict,
  getActiveDeploymentConflict,
} = require('./build-lock.js');
const { getWatchPaths } = require('./paths.js');

const DEFAULT_PROJECT_POLL_INTERVAL_MS = 60_000;
function normalizeProjectId(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\"'\"'")}'`;
}

function sanitizeHostnames(hostnames) {
  if (!Array.isArray(hostnames)) {
    return [];
  }

  return [
    ...new Set(
      hostnames
        .map((hostname) =>
          String(hostname ?? '')
            .trim()
            .toLowerCase()
            .replace(/^https?:\/\//u, '')
            .replace(/\/.*$/u, '')
        )
        .filter((hostname) => hostname.length > 0)
        .filter((hostname) =>
          SAFE_MANAGED_PROJECT_HOSTNAME_PATTERN.test(hostname)
        )
        .filter((hostname) => !RESERVED_MANAGED_PROJECT_HOSTNAMES.has(hostname))
    ),
  ];
}

function getProjectRuntimePaths(projectId, rootDir = process.cwd()) {
  const safeProjectId = normalizeProjectId(projectId);
  const projectDir = path.join(
    rootDir,
    'tmp',
    'docker-web',
    'projects',
    safeProjectId
  );

  return {
    dockerfilePath: path.join(
      projectDir,
      'repo',
      '.platform',
      'Dockerfile.nextjs'
    ),
    projectDir,
    repoDir: path.join(projectDir, 'repo'),
    runtimeDir: path.join(projectDir, 'runtime'),
    composeFile: path.join(projectDir, 'runtime', 'compose.yml'),
  };
}

function getProjectServiceName(projectId) {
  return `project-${normalizeProjectId(projectId)}`;
}

function renderManagedProjectDockerfile({ appRoot = '' } = {}) {
  const normalizedAppRoot = String(appRoot ?? '').replace(/^\/+|\/+$/gu, '');
  const appDir = normalizedAppRoot || '.';

  return [
    'FROM node:22-alpine AS base',
    'WORKDIR /app',
    'ENV NEXT_TELEMETRY_DISABLED=1',
    'RUN corepack enable',
    'COPY . .',
    'RUN if [ -f bun.lockb ] || [ -f bun.lock ]; then npm install -g bun && bun install --frozen-lockfile; elif [ -f pnpm-lock.yaml ]; then pnpm install --frozen-lockfile; elif [ -f yarn.lock ]; then yarn install --frozen-lockfile; else npm ci; fi',
    `RUN cd ${shellQuote(appDir)} && if [ -f package.json ]; then npm run build; else echo "Missing package.json in ${appDir}" && exit 1; fi`,
    'ENV HOSTNAME=0.0.0.0',
    'ENV NODE_ENV=production',
    'EXPOSE 3000',
    `CMD cd ${shellQuote(appDir)} && npm run start`,
    '',
  ].join('\n');
}

function renderManagedProjectCompose(
  project,
  { rootDir = process.cwd() } = {}
) {
  const safeProjectId = normalizeProjectId(project.id);
  const serviceName = getProjectServiceName(project.id);
  const paths = getProjectRuntimePaths(project.id, rootDir);
  const port = Number(project.port) > 0 ? Number(project.port) : 3000;
  const environment = [
    'HOSTNAME=0.0.0.0',
    'NODE_ENV=production',
    `PORT=${port}`,
    `PLATFORM_PROJECT_ID=${safeProjectId}`,
    `PLATFORM_SELECTED_BRANCH=${project.selected_branch}`,
    'PLATFORM_LOG_DRAIN_DATABASE_URL=postgres://platform_log_drain:platform_log_drain@log-drain-postgres:5432/platform_log_drain',
    `PLATFORM_LOG_DRAIN_ENABLED=${project.log_drain_enabled !== false ? 'true' : 'false'}`,
  ];

  if (project.redis_enabled !== false) {
    environment.push('UPSTASH_REDIS_REST_TOKEN', 'UPSTASH_REDIS_REST_URL');
  }

  return [
    'services:',
    `  ${serviceName}:`,
    '    build:',
    `      context: ${paths.repoDir}`,
    '      dockerfile: .platform/Dockerfile.nextjs',
    '    environment:',
    ...environment.map((value) => `      - ${value}`),
    '    expose:',
    `      - "${port}"`,
    '    extra_hosts:',
    '      - "host.docker.internal:host-gateway"',
    '    healthcheck:',
    `      test: ["CMD-SHELL", "node -e \\"fetch('http://127.0.0.1:${port}/').then((response) => process.exit(response.status < 500 ? 0 : 1)).catch(() => process.exit(1))\\""]`,
    '      interval: 30s',
    '      timeout: 5s',
    '      start_period: 15s',
    '      retries: 3',
    '    init: true',
    '    restart: unless-stopped',
    '',
  ].join('\n');
}

function renderManagedProjectProxyServerBlocks(projects) {
  return projects
    .flatMap((project) => {
      const hostnames = sanitizeHostnames(project.hostnames);
      if (hostnames.length === 0) {
        return [];
      }

      const safeProjectId = normalizeProjectId(project.id);
      const serviceName = getProjectServiceName(project.id);
      const upstreamName = `${serviceName.replaceAll('-', '_')}_upstream`;
      const port = Number(project.port) > 0 ? Number(project.port) : 3000;

      return [
        [
          '',
          `upstream ${upstreamName} {`,
          `  server ${serviceName}:${port} resolve max_fails=1 fail_timeout=5s;`,
          '}',
          '',
          'server {',
          '  listen 7803;',
          `  server_name ${hostnames.join(' ')};`,
          `  set $platform_project_id "${safeProjectId}";`,
          `  set $platform_selected_branch "${project.selected_branch}";`,
          `  set $platform_upstream_service "${serviceName}";`,
          `  add_header X-Platform-Project-Id "${safeProjectId}" always;`,
          `  add_header X-Platform-Selected-Branch "${project.selected_branch}" always;`,
          '',
          '  location / {',
          '    proxy_connect_timeout 3s;',
          '    proxy_http_version 1.1;',
          `    proxy_pass http://${upstreamName};`,
          '    proxy_set_header Host $host;',
          '    proxy_set_header X-Real-IP $remote_addr;',
          '    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;',
          '    proxy_set_header X-Forwarded-Proto $scheme;',
          '    proxy_set_header X-Platform-Project-Id $platform_project_id;',
          '    proxy_set_header X-Platform-Selected-Branch $platform_selected_branch;',
          '    proxy_set_header Upgrade $http_upgrade;',
          '    proxy_set_header Connection $connection_upgrade;',
          '  }',
          '}',
        ].join('\n'),
      ];
    })
    .join('\n');
}

async function withLogDrainSql(env, callback, postgresFactory = null) {
  const databaseUrl = env[LOG_DRAIN_DATABASE_URL_KEY]?.trim();
  if (!databaseUrl) {
    return null;
  }

  let postgres = postgresFactory;
  if (!postgres) {
    try {
      postgres = require('postgres');
    } catch {
      return null;
    }
  }

  const sql = postgres(databaseUrl, {
    connect_timeout: 2,
    idle_timeout: 2,
    max: 1,
    prepare: false,
  });

  try {
    return await callback(sql);
  } finally {
    await sql.end({ timeout: 1 }).catch(() => {});
  }
}

function normalizeProjectBranch(value) {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : DEFAULT_PLATFORM_BRANCH;
}

async function readPlatformProject({
  env = process.env,
  postgresFactory = null,
} = {}) {
  const databaseUrl = env[LOG_DRAIN_DATABASE_URL_KEY]?.trim();
  if (!databaseUrl) {
    return {
      autoDeployEnabled: true,
      deploymentStatus: 'synced',
      id: DEFAULT_PLATFORM_PROJECT_ID,
      metadata: {},
      selectedBranch: DEFAULT_PLATFORM_BRANCH,
      source: 'default',
    };
  }

  let postgres = postgresFactory;
  if (!postgres) {
    try {
      postgres = require('postgres');
    } catch {
      return {
        autoDeployEnabled: true,
        deploymentStatus: 'synced',
        id: DEFAULT_PLATFORM_PROJECT_ID,
        metadata: {},
        selectedBranch: DEFAULT_PLATFORM_BRANCH,
        source: 'fallback',
      };
    }
  }

  const sql = postgres(databaseUrl, {
    connect_timeout: 2,
    idle_timeout: 2,
    max: 1,
    prepare: false,
  });

  try {
    const rows = await sql`
      SELECT id, selected_branch, auto_deploy_enabled
      , deployment_status, metadata
      FROM infrastructure_projects
      WHERE id = ${DEFAULT_PLATFORM_PROJECT_ID}
      LIMIT 1
    `;
    const row = rows[0];

    return {
      autoDeployEnabled: row?.auto_deploy_enabled !== false,
      deploymentStatus: row?.deployment_status ?? 'synced',
      id: DEFAULT_PLATFORM_PROJECT_ID,
      metadata: row?.metadata ?? {},
      selectedBranch: normalizeProjectBranch(row?.selected_branch),
      source: row ? 'database' : 'default',
    };
  } finally {
    await sql.end({ timeout: 1 }).catch(() => {});
  }
}

async function resolvePlatformProjectTarget(
  baseTarget,
  {
    env = process.env,
    listDirtyWorktreePaths,
    log = null,
    postgresFactory = null,
    runCommand,
  } = {}
) {
  const project = await readPlatformProject({ env, postgresFactory });
  if (
    project.source === 'default' &&
    !env[LOG_DRAIN_DATABASE_URL_KEY]?.trim()
  ) {
    return {
      blocked: false,
      project,
      target: baseTarget,
    };
  }

  const selectedBranch = normalizeProjectBranch(project.selectedBranch);

  if (!project.autoDeployEnabled && project.deploymentStatus !== 'queued') {
    return {
      blocked: true,
      message: `Project ${project.id} auto-deploy is disabled.`,
      project,
      target: baseTarget,
    };
  }

  if (selectedBranch === baseTarget.branch) {
    return {
      blocked: false,
      project,
      target: baseTarget,
    };
  }

  const dirtyPaths =
    typeof listDirtyWorktreePaths === 'function'
      ? await listDirtyWorktreePaths({ env, runCommand })
      : [];

  if (dirtyPaths.length > 0) {
    return {
      blocked: true,
      message: `Project ${project.id} targets ${selectedBranch}, but the current checkout is dirty.`,
      project,
      target: {
        ...baseTarget,
        branch: selectedBranch,
        upstreamBranch: selectedBranch,
        upstreamRef: `${baseTarget.remote}/${selectedBranch}`,
      },
    };
  }

  const fetch = await runCommand(
    'git',
    ['fetch', baseTarget.remote, selectedBranch],
    {
      env,
      stdio: 'pipe',
    }
  );
  if (fetch.code !== 0) {
    throw new Error(
      fetch.stderr?.trim() ||
        fetch.stdout?.trim() ||
        `Unable to fetch ${baseTarget.remote}/${selectedBranch}.`
    );
  }

  const checkout = await runCommand('git', ['checkout', selectedBranch], {
    env,
    stdio: 'pipe',
  });

  if (checkout.code !== 0) {
    const createBranch = await runCommand(
      'git',
      [
        'checkout',
        '-B',
        selectedBranch,
        `${baseTarget.remote}/${selectedBranch}`,
      ],
      {
        env,
        stdio: 'pipe',
      }
    );

    if (createBranch.code !== 0) {
      throw new Error(
        createBranch.stderr?.trim() ||
          createBranch.stdout?.trim() ||
          `Unable to check out ${selectedBranch}.`
      );
    }
  }

  log?.info?.(
    `Switched platform project from ${baseTarget.branch} to ${selectedBranch}.`
  );

  return {
    blocked: false,
    project,
    target: {
      ...baseTarget,
      branch: selectedBranch,
      upstreamBranch: selectedBranch,
      upstreamRef: `${baseTarget.remote}/${selectedBranch}`,
    },
  };
}

async function updatePlatformProjectDeploymentStatus({
  env = process.env,
  latestCommit = null,
  metadata = {},
  postgresFactory = null,
  status,
} = {}) {
  if (!status) {
    throw new Error('A platform project deployment status is required.');
  }

  const latestCommitHash =
    typeof latestCommit?.hash === 'string' && latestCommit.hash.trim()
      ? latestCommit.hash.trim()
      : null;
  const latestCommitShortHash =
    typeof latestCommit?.shortHash === 'string' && latestCommit.shortHash.trim()
      ? latestCommit.shortHash.trim()
      : latestCommitHash?.slice(0, 12) || null;
  const latestCommitSubject =
    typeof latestCommit?.subject === 'string' && latestCommit.subject.trim()
      ? latestCommit.subject.trim()
      : null;

  await withLogDrainSql(
    env,
    async (sql) => {
      await sql`
        UPDATE infrastructure_projects
        SET
          deployment_status = ${status},
          latest_commit_hash = COALESCE(${latestCommitHash}, latest_commit_hash),
          latest_commit_short_hash = COALESCE(${latestCommitShortHash}, latest_commit_short_hash),
          latest_commit_subject = COALESCE(${latestCommitSubject}, latest_commit_subject),
          latest_synced_at = CASE
            WHEN ${latestCommitHash} IS NULL THEN latest_synced_at
            ELSE now()
          END,
          metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify(metadata)}::jsonb,
          last_deployed_at = CASE
            WHEN ${status} = 'ready' THEN now()
            ELSE last_deployed_at
          END,
          updated_at = now()
        WHERE id = ${DEFAULT_PLATFORM_PROJECT_ID}
      `;
    },
    postgresFactory
  );
}

async function readManagedInfrastructureProjects({
  env = process.env,
  postgresFactory = null,
} = {}) {
  return (
    (await withLogDrainSql(
      env,
      readManagedInfrastructureProjectsFromSql,
      postgresFactory
    )) ?? []
  );
}

async function readManagedInfrastructureProjectsFromSql(sql) {
  return sql`
    SELECT
      id,
      repo_url,
      github_owner,
      github_repo,
      selected_branch,
      app_root,
      port,
      hostnames,
      auto_deploy_enabled,
      log_drain_enabled,
      redis_enabled,
      cron_enabled,
      deployment_status,
      latest_commit_hash,
      latest_commit_short_hash,
      latest_commit_subject,
      metadata
    FROM infrastructure_projects
    WHERE id <> ${DEFAULT_PLATFORM_PROJECT_ID}
      AND (auto_deploy_enabled IS TRUE OR deployment_status = 'queued')
      AND preset = 'nextjs'
    ORDER BY updated_at ASC, id ASC
  `;
}

async function updateManagedProjectStatus(
  sql,
  projectId,
  status,
  metadata = {}
) {
  await sql`
    UPDATE infrastructure_projects
    SET
      deployment_status = ${status},
      metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify(metadata)}::jsonb,
      last_deployed_at = CASE
        WHEN ${status} = 'ready' THEN now()
        ELSE last_deployed_at
      END,
      updated_at = now()
    WHERE id = ${projectId}
  `;
}

async function updateManagedProjectMetadata(sql, projectId, metadata = {}) {
  await sql`
    UPDATE infrastructure_projects
    SET
      metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify(metadata)}::jsonb,
      updated_at = now()
    WHERE id = ${projectId}
  `;
}

async function getManagedCheckoutCommit(repoDir, { env, runCommand }) {
  const result = await runCommand('git', ['rev-parse', 'HEAD'], {
    cwd: repoDir,
    env,
    stdio: 'pipe',
  });

  return result.code === 0 ? result.stdout.trim() : null;
}

async function syncManagedProjectCheckout(
  project,
  { env, rootDir, runCommand }
) {
  const paths = getProjectRuntimePaths(project.id, rootDir);
  fs.mkdirSync(paths.projectDir, { recursive: true });

  if (!fs.existsSync(path.join(paths.repoDir, '.git'))) {
    const clone = await runCommand(
      'git',
      [
        'clone',
        '--filter=blob:none',
        '--branch',
        project.selected_branch,
        project.repo_url,
        paths.repoDir,
      ],
      {
        env,
        stdio: 'pipe',
      }
    );

    if (clone.code !== 0) {
      throw new Error(
        clone.stderr?.trim() ||
          clone.stdout?.trim() ||
          `Unable to clone ${project.repo_url}.`
      );
    }
  }

  const fetch = await runCommand(
    'git',
    ['fetch', 'origin', project.selected_branch],
    {
      cwd: paths.repoDir,
      env,
      stdio: 'pipe',
    }
  );
  if (fetch.code !== 0) {
    throw new Error(
      fetch.stderr?.trim() ||
        fetch.stdout?.trim() ||
        `Unable to fetch ${project.repo_url}.`
    );
  }

  const checkout = await runCommand(
    'git',
    [
      'checkout',
      '-B',
      project.selected_branch,
      `origin/${project.selected_branch}`,
    ],
    {
      cwd: paths.repoDir,
      env,
      stdio: 'pipe',
    }
  );
  if (checkout.code !== 0) {
    throw new Error(
      checkout.stderr?.trim() ||
        checkout.stdout?.trim() ||
        `Unable to check out ${project.selected_branch}.`
    );
  }

  return getManagedCheckoutCommit(paths.repoDir, { env, runCommand });
}

async function deployManagedProject(project, { env, rootDir, runCommand }) {
  const paths = getProjectRuntimePaths(project.id, rootDir);
  const serviceName = getProjectServiceName(project.id);

  fs.mkdirSync(path.dirname(paths.dockerfilePath), { recursive: true });
  fs.mkdirSync(paths.runtimeDir, { recursive: true });
  fs.writeFileSync(
    paths.dockerfilePath,
    renderManagedProjectDockerfile({ appRoot: project.app_root }),
    'utf8'
  );
  fs.writeFileSync(
    paths.composeFile,
    renderManagedProjectCompose(project, { rootDir }),
    'utf8'
  );

  await runChecked(
    'docker',
    getComposeCommandArgs(
      paths.composeFile,
      [],
      'up',
      '--detach',
      '--build',
      serviceName
    ),
    {
      env: {
        ...env,
        COMPOSE_PROJECT_NAME: getDockerWebComposeProjectName({
          baseEnv: env,
          rootDir,
        }),
      },
      runCommand,
    }
  );
}

async function refreshManagedProjectProxyRoutes({
  env = process.env,
  postgresFactory = null,
  rootDir = process.cwd(),
  runCommand,
} = {}) {
  const projects = await readManagedInfrastructureProjects({
    env,
    postgresFactory,
  });
  const routableProjects = projects.filter(
    (project) =>
      project.deployment_status === 'ready' &&
      sanitizeHostnames(project.hostnames).length > 0
  );
  const paths = getBlueGreenPaths(rootDir);
  const activeColor =
    readBlueGreenActiveColor(paths, fs) ??
    readBlueGreenProxyActiveColor(paths, fs);

  if (!activeColor) {
    return false;
  }

  const standbyColor = await resolveBlueGreenStandbyColor(activeColor, {
    composeFile: getComposeFile('prod'),
    composeGlobalArgs: [],
    env,
    runCommand,
  }).catch(() => null);

  writeBlueGreenProxyConfig(activeColor, {
    deploymentStamp: readBlueGreenDeploymentStamp(paths, fs),
    extraServerBlocks: [
      renderManagedProjectProxyServerBlocks(routableProjects),
    ],
    fsImpl: fs,
    paths,
    standbyColor,
  });

  await validateBlueGreenProxyConfig({
    composeFile: getComposeFile('prod'),
    composeGlobalArgs: [],
    env,
    runCommand,
  });
  await reloadBlueGreenProxy({
    composeFile: getComposeFile('prod'),
    composeGlobalArgs: [],
    env,
    runCommand,
  });

  return true;
}

function createManagedProjectCommit(project, currentCommit) {
  if (!currentCommit) {
    return null;
  }

  return {
    hash: currentCommit,
    shortHash: currentCommit.slice(0, 12),
    subject: `${project.github_owner ?? 'unknown'}/${project.github_repo ?? project.id}`,
  };
}

async function processManagedInfrastructureProjects({
  env = process.env,
  fsImpl = fs,
  log = null,
  now = () => Date.now(),
  rootDir = process.cwd(),
  paths = getWatchPaths(rootDir),
  platform,
  postgresFactory = null,
  processImpl = process,
  runCommand,
} = {}) {
  if (typeof runCommand !== 'function') {
    throw new Error('runCommand is required to process managed projects.');
  }

  return (
    (await withLogDrainSql(
      env,
      async (sql) => {
        const projects = await readManagedInfrastructureProjectsFromSql(sql);
        const results = [];
        const activeDeployment = getActiveDeploymentConflict({
          env,
          fsImpl,
          now,
          paths,
          platform,
          processImpl,
        });

        if (activeDeployment) {
          log?.info?.(
            `Skipping managed project deployment poll because another deployment is active (${describeActiveDeploymentConflict(activeDeployment)}).`
          );

          return projects.map((project) => ({
            activeDeployment: activeDeployment.lock,
            projectId: project.id,
            status: 'deferred',
          }));
        }

        for (const project of projects) {
          const previousCommit =
            project.metadata?.deployedCommitHash ??
            project.metadata?.lastCheckedCommitHash ??
            null;
          let currentCommit = null;
          let heldLock = null;

          try {
            await updateManagedProjectStatus(sql, project.id, 'synced', {
              checkedAt: new Date().toISOString(),
            });
            currentCommit = await syncManagedProjectCheckout(project, {
              env,
              rootDir,
              runCommand,
            });
            const shouldDeploy =
              project.deployment_status === 'queued' ||
              (currentCommit && currentCommit !== previousCommit);

            if (!shouldDeploy) {
              await updateManagedProjectMetadata(sql, project.id, {
                lastCheckedCommitHash: currentCommit,
                skippedAt: new Date().toISOString(),
              });
              results.push({ projectId: project.id, status: 'skipped' });
              continue;
            }

            const serviceName = getProjectServiceName(project.id);
            heldLock = acquireDeploymentBuildLock({
              command: `docker compose up --build ${serviceName}`,
              deploymentKind: 'managed-project',
              env,
              fsImpl,
              latestCommit: createManagedProjectCommit(project, currentCommit),
              now,
              paths,
              processImpl,
            });
            await updateManagedProjectStatus(sql, project.id, 'building', {
              buildStartedAt: new Date().toISOString(),
              commitHash: currentCommit,
            });
            await deployManagedProject(project, {
              env,
              rootDir,
              runCommand,
            });
            await updateManagedProjectStatus(sql, project.id, 'ready', {
              deployedAt: new Date().toISOString(),
              deployedCommitHash: currentCommit,
            });
            results.push({ projectId: project.id, status: 'ready' });
          } catch (error) {
            const message =
              error instanceof Error ? error.message : String(error);
            if (error instanceof DeploymentBuildLockConflictError) {
              const deferredMetadata = {
                deferredAt: new Date().toISOString(),
                deferredReason: message,
                ...(currentCommit ? { commitHash: currentCommit } : {}),
              };

              if (project.deployment_status === 'queued') {
                await updateManagedProjectStatus(
                  sql,
                  project.id,
                  'queued',
                  deferredMetadata
                );
              } else {
                await updateManagedProjectMetadata(
                  sql,
                  project.id,
                  deferredMetadata
                );
              }

              log?.info?.(
                `Managed project ${project.id} deployment deferred: ${message}`
              );
              results.push({
                error: message,
                projectId: project.id,
                status: 'deferred',
              });
              continue;
            }

            await updateManagedProjectStatus(sql, project.id, 'failed', {
              error: message,
              failedAt: new Date().toISOString(),
            });
            log?.warn?.(
              `Managed project ${project.id} deployment failed: ${message}`
            );
            results.push({
              error: message,
              projectId: project.id,
              status: 'failed',
            });
          } finally {
            heldLock?.release();
          }
        }

        await refreshManagedProjectProxyRoutes({
          env,
          postgresFactory,
          rootDir,
          runCommand,
        }).catch((error) => {
          log?.warn?.(
            `Managed project proxy refresh failed: ${error instanceof Error ? error.message : String(error)}`
          );
        });

        return results;
      },
      postgresFactory
    )) ?? []
  );
}

module.exports = {
  DEFAULT_PLATFORM_BRANCH,
  DEFAULT_PLATFORM_PROJECT_ID,
  DEFAULT_PROJECT_POLL_INTERVAL_MS,
  getProjectRuntimePaths,
  getProjectServiceName,
  normalizeProjectBranch,
  processManagedInfrastructureProjects,
  readPlatformProject,
  renderManagedProjectCompose,
  renderManagedProjectDockerfile,
  renderManagedProjectProxyServerBlocks,
  resolvePlatformProjectTarget,
  updatePlatformProjectDeploymentStatus,
};
