const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const {
  LOCAL_E2E_APP_COORDINATION_SECRET,
  LOCAL_E2E_AUTH_BYPASS,
  LOCAL_E2E_BASE_URL,
  LOCAL_E2E_CRON_SECRET,
  LOCAL_E2E_DOCKER_SUPABASE_URL,
  LOCAL_E2E_SUPERMEMORY_ENABLED,
  LOCAL_E2E_SUPERMEMORY_POSTGRES_PASSWORD,
  LOCAL_E2E_SUPABASE_SECRET_KEY,
  LOCAL_E2E_SUPABASE_URL,
  assertSafeE2EEnvironment,
  createLocalE2EEnvFileContent,
  createLocalE2EProcessEnv,
  getDefaultE2EComposeProjectName,
  toComposeFragmentEnvFilePath,
  toRootRelativePath,
} = require('./e2e-local-environment.js');

test('assertSafeE2EEnvironment accepts only local web and Supabase origins', () => {
  assert.deepEqual(
    assertSafeE2EEnvironment({
      BASE_URL: LOCAL_E2E_BASE_URL,
      NEXT_PUBLIC_SUPABASE_URL: LOCAL_E2E_SUPABASE_URL,
      SUPABASE_SERVER_URL: LOCAL_E2E_DOCKER_SUPABASE_URL,
    }),
    {
      baseUrl: LOCAL_E2E_BASE_URL,
      supabaseUrl: LOCAL_E2E_SUPABASE_URL,
    }
  );
});

test('local E2E app URL uses Tuturuuu localhost for shared-cookie coverage', () => {
  assert.equal(LOCAL_E2E_BASE_URL, 'https://tuturuuu.localhost');
  assert.doesNotThrow(() =>
    assertSafeE2EEnvironment({
      BASE_URL: 'http://localhost:7803',
      NEXT_PUBLIC_SUPABASE_URL: LOCAL_E2E_SUPABASE_URL,
    })
  );
});

test('assertSafeE2EEnvironment rejects cloud Supabase URLs', () => {
  assert.throws(
    () =>
      assertSafeE2EEnvironment({
        BASE_URL: LOCAL_E2E_BASE_URL,
        NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
      }),
    /non-local NEXT_PUBLIC_SUPABASE_URL/
  );
});

test('assertSafeE2EEnvironment rejects non-local web targets', () => {
  assert.throws(
    () =>
      assertSafeE2EEnvironment({
        BASE_URL: 'https://tuturuuu.com',
        NEXT_PUBLIC_SUPABASE_URL: LOCAL_E2E_SUPABASE_URL,
      }),
    /non-local BASE_URL/
  );
});

test('assertSafeE2EEnvironment rejects non-local app URL targets', () => {
  assert.throws(
    () =>
      assertSafeE2EEnvironment({
        BASE_URL: LOCAL_E2E_BASE_URL,
        NEXT_PUBLIC_APP_URL: 'https://tuturuuu.com',
        NEXT_PUBLIC_SUPABASE_URL: LOCAL_E2E_SUPABASE_URL,
      }),
    /non-local NEXT_PUBLIC_APP_URL/
  );
});

test('createLocalE2EEnvFileContent is pinned to local Docker E2E values', () => {
  const content = createLocalE2EEnvFileContent();

  assert.match(content, new RegExp(`BASE_URL=${LOCAL_E2E_BASE_URL}`));
  assert.match(content, new RegExp(`CRON_SECRET=${LOCAL_E2E_CRON_SECRET}`));
  assert.match(
    content,
    new RegExp(`NEXT_PUBLIC_APP_URL=${LOCAL_E2E_BASE_URL}`)
  );
  assert.match(
    content,
    new RegExp(`NEXT_PUBLIC_WEB_APP_URL=${LOCAL_E2E_BASE_URL}`)
  );
  assert.match(content, new RegExp(`WEB_APP_URL=${LOCAL_E2E_BASE_URL}`));
  assert.match(
    content,
    new RegExp(`NEXT_PUBLIC_SUPABASE_URL=${LOCAL_E2E_SUPABASE_URL}`)
  );
  assert.match(
    content,
    new RegExp(`SUPABASE_SERVER_URL=${LOCAL_E2E_DOCKER_SUPABASE_URL}`)
  );
  assert.match(content, new RegExp(LOCAL_E2E_APP_COORDINATION_SECRET));
  assert.match(
    content,
    new RegExp(`DOCKER_SUPERMEMORY_ENABLED=${LOCAL_E2E_SUPERMEMORY_ENABLED}`)
  );
  assert.match(
    content,
    new RegExp(`SUPERMEMORY_ENABLED=${LOCAL_E2E_SUPERMEMORY_ENABLED}`)
  );
  assert.match(content, new RegExp(LOCAL_E2E_SUPERMEMORY_POSTGRES_PASSWORD));
  assert.match(
    content,
    new RegExp(`TUTURUUU_LOCAL_E2E_AUTH_BYPASS=${LOCAL_E2E_AUTH_BYPASS}`)
  );
  assert.match(
    content,
    new RegExp(
      `NEXT_PUBLIC_TUTURUUU_LOCAL_E2E_AUTH_BYPASS=${LOCAL_E2E_AUTH_BYPASS}`
    )
  );
  assert.match(content, new RegExp(LOCAL_E2E_SUPABASE_SECRET_KEY));
  assert.doesNotMatch(content, /supabase\.(co|in)/iu);
});

test('createLocalE2EProcessEnv overrides inherited cloud Supabase env', () => {
  const rootDir = '/repo';
  const envFilePath = path.join(rootDir, 'tmp', 'e2e', 'web.env');
  const env = createLocalE2EProcessEnv(
    {
      BASE_URL: 'https://tuturuuu.com',
      NEXT_PUBLIC_APP_URL: 'https://tuturuuu.com',
      NEXT_PUBLIC_WEB_APP_URL: 'https://tuturuuu.com',
      NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
      SUPABASE_SERVER_URL: 'https://project.supabase.co',
      WEB_APP_URL: 'https://tuturuuu.com',
    },
    { envFilePath, rootDir }
  );

  assert.equal(env.BASE_URL, LOCAL_E2E_BASE_URL);
  assert.equal(env.CRON_SECRET, LOCAL_E2E_CRON_SECRET);
  assert.equal(env.NEXT_PUBLIC_APP_URL, LOCAL_E2E_BASE_URL);
  assert.equal(env.NEXT_PUBLIC_WEB_APP_URL, LOCAL_E2E_BASE_URL);
  assert.equal(env.NEXT_PUBLIC_SUPABASE_URL, LOCAL_E2E_SUPABASE_URL);
  assert.equal(
    env.NEXT_PUBLIC_TUTURUUU_LOCAL_E2E_AUTH_BYPASS,
    LOCAL_E2E_AUTH_BYPASS
  );
  assert.equal(env.SUPABASE_SERVER_URL, LOCAL_E2E_DOCKER_SUPABASE_URL);
  assert.equal(env.DOCKER_SUPERMEMORY_ENABLED, LOCAL_E2E_SUPERMEMORY_ENABLED);
  assert.equal(env.SUPERMEMORY_ENABLED, LOCAL_E2E_SUPERMEMORY_ENABLED);
  assert.equal(
    env.SUPERMEMORY_POSTGRES_PASSWORD,
    LOCAL_E2E_SUPERMEMORY_POSTGRES_PASSWORD
  );
  assert.equal(env.TUTURUUU_LOCAL_E2E_AUTH_BYPASS, LOCAL_E2E_AUTH_BYPASS);
  assert.equal(env.VERCEL_CRON_SECRET, LOCAL_E2E_CRON_SECRET);
  assert.equal(env.DATABASE_URL, '');
  assert.equal(env.DIRECT_URL, '');
  assert.equal(env.POSTGRES_URL, '');
  assert.equal(env.DOCKER_WEB_ENV_FILE, 'tmp/e2e/web.env');
  assert.equal(env.DOCKER_WEB_COMPOSE_ENV_FILE, '../tmp/e2e/web.env');
  assert.equal(env.DOCKER_WEB_COMPOSE_LEGACY_ENV_FILE, '../tmp/e2e/web.env');
  assert.equal(env.WEB_APP_URL, LOCAL_E2E_BASE_URL);
});

test('path helpers produce root and compose-fragment relative env paths', () => {
  const rootDir = '/repo';
  const envFilePath = '/repo/tmp/e2e/web.env';

  assert.equal(toRootRelativePath(rootDir, envFilePath), 'tmp/e2e/web.env');
  assert.equal(
    toComposeFragmentEnvFilePath(rootDir, envFilePath),
    '../tmp/e2e/web.env'
  );
});

test('getDefaultE2EComposeProjectName scopes CI shards independently', () => {
  assert.equal(
    getDefaultE2EComposeProjectName({
      E2E_SHARD_INDEX: '2',
      GITHUB_RUN_ID: '123456789',
    }),
    'ttr-e2e-123456789-2'
  );
});
