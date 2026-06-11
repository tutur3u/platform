const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  writeDeploymentBuildLock,
} = require('./watch-blue-green/build-lock.js');
const { getWatchPaths } = require('./watch-blue-green/paths.js');
const {
  DEFAULT_PLATFORM_BRANCH,
  getManagedProjectDeploymentEnv,
  normalizeProjectBranch,
  processManagedInfrastructureProjects,
  renderManagedProjectCompose,
  renderManagedProjectProxyServerBlocks,
  resolvePlatformProjectTarget,
} = require('./watch-blue-green/projects.js');

test('normalizeProjectBranch defaults platform to production', () => {
  assert.equal(normalizeProjectBranch(''), DEFAULT_PLATFORM_BRANCH);
  assert.equal(normalizeProjectBranch(' staging '), 'staging');
});

test('resolvePlatformProjectTarget blocks a dirty branch mismatch', async () => {
  const result = await resolvePlatformProjectTarget(
    {
      branch: 'main',
      remote: 'origin',
      upstreamBranch: 'main',
      upstreamRef: 'origin/main',
    },
    {
      env: {
        PLATFORM_LOG_DRAIN_DATABASE_URL: 'postgres://local/test',
      },
      listDirtyWorktreePaths: async () => ['apps/web/page.tsx'],
      postgresFactory: () => {
        const sql = async () => [
          {
            auto_deploy_enabled: true,
            selected_branch: 'production',
          },
        ];
        sql.end = async () => {};
        return sql;
      },
      runCommand: async () => ({ code: 0, stderr: '', stdout: '' }),
    }
  );

  assert.equal(result.blocked, true);
  assert.equal(result.target.branch, 'production');
  assert.match(result.message, /dirty/);
});

test('resolvePlatformProjectTarget switches a clean branch mismatch', async () => {
  const calls = [];
  const result = await resolvePlatformProjectTarget(
    {
      branch: 'main',
      remote: 'origin',
      upstreamBranch: 'main',
      upstreamRef: 'origin/main',
    },
    {
      env: {
        PLATFORM_LOG_DRAIN_DATABASE_URL: 'postgres://local/test',
      },
      listDirtyWorktreePaths: async () => [],
      postgresFactory: () => {
        const sql = async () => [
          {
            auto_deploy_enabled: true,
            selected_branch: 'production',
          },
        ];
        sql.end = async () => {};
        return sql;
      },
      runCommand: async (command, args) => {
        calls.push([command, args]);
        return { code: 0, stderr: '', stdout: '' };
      },
    }
  );

  assert.equal(result.blocked, false);
  assert.equal(result.target.upstreamRef, 'origin/production');
  assert.deepEqual(calls, [
    ['git', ['fetch', 'origin', 'production']],
    ['git', ['checkout', 'production']],
  ]);
});

test('processManagedInfrastructureProjects defers while a deployment build lock is active', async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'managed-project-active-lock-')
  );
  const paths = getWatchPaths(tempDir);

  try {
    writeDeploymentBuildLock(
      {
        command: 'bun serve:web:docker:bg',
        commitHash: 'abc123',
        commitShortHash: 'abc123',
        commitSubject: 'Platform deploy',
        deploymentKind: 'promotion',
        lockToken: 'active-token',
        ownerPid: 2468,
        startedAt: 1000,
      },
      { fsImpl: fs, paths }
    );

    const sql = async (strings) => {
      const query = strings.join('');

      if (query.includes('FROM infrastructure_projects')) {
        return [
          {
            app_root: '',
            auto_deploy_enabled: true,
            cron_enabled: false,
            deployment_status: 'queued',
            github_owner: 'tutur3u',
            github_repo: 'example',
            hostnames: ['example.tuturuuu.com'],
            id: 'example',
            latest_commit_hash: null,
            latest_commit_short_hash: null,
            latest_commit_subject: null,
            log_drain_enabled: true,
            metadata: {},
            port: 3000,
            redis_enabled: true,
            repo_url: 'https://github.com/tutur3u/example.git',
            selected_branch: 'main',
          },
        ];
      }

      throw new Error(`Unexpected SQL: ${query}`);
    };
    sql.end = async () => {};

    const results = await processManagedInfrastructureProjects({
      env: { PLATFORM_LOG_DRAIN_DATABASE_URL: 'postgres://local/test' },
      fsImpl: fs,
      now: () => 2000,
      paths,
      postgresFactory: () => sql,
      processImpl: {
        kill(pid) {
          if (pid !== 2468) {
            const error = new Error('missing');
            error.code = 'ESRCH';
            throw error;
          }
        },
        pid: 1357,
      },
      rootDir: tempDir,
      runCommand: async () => {
        throw new Error('managed project deploy should not run');
      },
    });

    assert.deepEqual(results, [
      {
        activeDeployment: {
          command: 'bun serve:web:docker:bg',
          commitHash: 'abc123',
          commitShortHash: 'abc123',
          commitSubject: 'Platform deploy',
          deploymentKind: 'promotion',
          lockToken: 'active-token',
          ownerPid: 2468,
          startedAt: 1000,
        },
        projectId: 'example',
        status: 'deferred',
      },
    ]);
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('resolvePlatformProjectTarget allows manual queued deployment when auto deploy is disabled', async () => {
  const result = await resolvePlatformProjectTarget(
    {
      branch: 'production',
      remote: 'origin',
      upstreamBranch: 'production',
      upstreamRef: 'origin/production',
    },
    {
      env: {
        PLATFORM_LOG_DRAIN_DATABASE_URL: 'postgres://local/test',
      },
      listDirtyWorktreePaths: async () => [],
      postgresFactory: () => {
        const sql = async () => [
          {
            auto_deploy_enabled: false,
            deployment_status: 'queued',
            selected_branch: 'production',
          },
        ];
        sql.end = async () => {};
        return sql;
      },
      runCommand: async () => ({ code: 0, stderr: '', stdout: '' }),
    }
  );

  assert.equal(result.blocked, false);
  assert.equal(result.project.deploymentStatus, 'queued');
});

test('resolvePlatformProjectTarget blocks disabled auto deploy when nothing is queued', async () => {
  const result = await resolvePlatformProjectTarget(
    {
      branch: 'production',
      remote: 'origin',
      upstreamBranch: 'production',
      upstreamRef: 'origin/production',
    },
    {
      env: {
        PLATFORM_LOG_DRAIN_DATABASE_URL: 'postgres://local/test',
      },
      listDirtyWorktreePaths: async () => [],
      postgresFactory: () => {
        const sql = async () => [
          {
            auto_deploy_enabled: false,
            deployment_status: 'ready',
            selected_branch: 'production',
          },
        ];
        sql.end = async () => {};
        return sql;
      },
      runCommand: async () => ({ code: 0, stderr: '', stdout: '' }),
    }
  );

  assert.equal(result.blocked, true);
  assert.match(result.message, /auto-deploy is disabled/);
});

test('renderManagedProjectCompose keeps project services under platform compose group', () => {
  const compose = renderManagedProjectCompose(
    {
      app_root: 'apps/web',
      id: 'Docs App',
      log_drain_enabled: true,
      port: 3000,
      redis_enabled: true,
      selected_branch: 'main',
    },
    {
      rootDir: '/workspace',
    }
  );

  assert.match(compose, /project-docs-app:/);
  assert.match(compose, /PLATFORM_PROJECT_ID=docs-app/);
  assert.match(compose, /PLATFORM_SELECTED_BRANCH=main/);
  assert.match(compose, /UPSTASH_REDIS_REST_TOKEN/);
});

test('managed project deployment env uses integrated Docker Redis by default', () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'managed-project-redis-default-')
  );

  try {
    const env = getManagedProjectDeploymentEnv(
      {
        id: 'docs-app',
        redis_enabled: true,
      },
      {
        env: {
          UPSTASH_REDIS_REST_TOKEN: 'stale-upstash-token',
          UPSTASH_REDIS_REST_URL: 'https://stale-upstash.example.com',
        },
        fsImpl: fs,
        rootDir: tempDir,
      }
    );
    const tokenPath = path.join(tempDir, 'tmp', 'docker-web', 'redis-token');
    const persistedToken = fs.readFileSync(tokenPath, 'utf8').trim();

    assert.notEqual(env.UPSTASH_REDIS_REST_TOKEN, 'stale-upstash-token');
    assert.equal(env.UPSTASH_REDIS_REST_TOKEN, persistedToken);
    assert.equal(env.SRH_TOKEN, persistedToken);
    assert.equal(env.UPSTASH_REDIS_REST_URL, 'http://serverless-redis-http:80');
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('managed project deployment env preserves Docker Redis overrides', () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'managed-project-redis-override-')
  );

  try {
    const env = getManagedProjectDeploymentEnv(
      {
        id: 'docs-app',
        redis_enabled: true,
      },
      {
        env: {
          DOCKER_UPSTASH_REDIS_REST_TOKEN: 'docker-token',
          DOCKER_UPSTASH_REDIS_REST_URL: 'http://redis-override:80',
          UPSTASH_REDIS_REST_TOKEN: 'stale-upstash-token',
          UPSTASH_REDIS_REST_URL: 'https://stale-upstash.example.com',
        },
        fsImpl: fs,
        rootDir: tempDir,
      }
    );

    assert.equal(env.UPSTASH_REDIS_REST_TOKEN, 'docker-token');
    assert.equal(env.SRH_TOKEN, 'docker-token');
    assert.equal(env.UPSTASH_REDIS_REST_URL, 'http://redis-override:80');
    assert.equal(
      fs.existsSync(path.join(tempDir, 'tmp', 'docker-web', 'redis-token')),
      false
    );
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('managed project deployment env removes Redis when explicitly disabled', () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'managed-project-redis-disabled-')
  );

  try {
    const env = getManagedProjectDeploymentEnv(
      {
        id: 'docs-app',
        redis_enabled: false,
      },
      {
        env: {
          UPSTASH_REDIS_REST_TOKEN: 'stale-upstash-token',
          UPSTASH_REDIS_REST_URL: 'https://stale-upstash.example.com',
          SRH_TOKEN: 'stale-srh-token',
        },
        fsImpl: fs,
        rootDir: tempDir,
      }
    );

    assert.equal(env.UPSTASH_REDIS_REST_TOKEN, undefined);
    assert.equal(env.UPSTASH_REDIS_REST_URL, undefined);
    assert.equal(env.SRH_TOKEN, undefined);
    assert.equal(
      fs.existsSync(path.join(tempDir, 'tmp', 'docker-web', 'redis-token')),
      false
    );
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('renderManagedProjectProxyServerBlocks renders host routes with project context', () => {
  const config = renderManagedProjectProxyServerBlocks([
    {
      hostnames: ['docs.example.com'],
      id: 'docs-app',
      port: 3000,
      selected_branch: 'main',
    },
  ]);

  assert.match(config, /server_name docs\.example\.com;/);
  assert.match(config, /set \$platform_project_id "docs-app";/);
  assert.match(config, /proxy_pass http:\/\/project_docs_app_upstream;/);
});

test('renderManagedProjectProxyServerBlocks drops reserved and invalid hostnames', () => {
  const config = renderManagedProjectProxyServerBlocks([
    {
      hostnames: [
        'https://docs.example.com/path',
        'tuturuuu.com',
        'hive.tuturuuu.com',
        'bad host.example.com',
        'victim.example.com;\nreturn 200 "pwned";\n#',
      ],
      id: 'docs-app',
      port: 3000,
      selected_branch: 'main',
    },
  ]);

  assert.match(config, /server_name docs\.example\.com;/);
  assert.doesNotMatch(config, /tuturuuu\.com/);
  assert.doesNotMatch(config, /hive\.tuturuuu\.com/);
  assert.doesNotMatch(config, /bad host\.example\.com/);
  assert.doesNotMatch(config, /return 200 "pwned"/);
});
