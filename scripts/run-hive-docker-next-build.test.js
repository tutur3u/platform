const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getHiveDockerNextBuildArgs,
  getHiveDockerNextBuildEnv,
  loadEnvFile,
  parseArgs,
  parseEnvFileContent,
} = require('./run-hive-docker-next-build.js');

test('Hive Docker Next build wrapper parses env files without logging secrets', () => {
  assert.deepEqual(
    parseEnvFileContent(
      [
        '# ignored',
        'PLAIN=value',
        'export QUOTED="quoted value"',
        "SINGLE='single value'",
        'INVALID-KEY=ignored',
        'EMPTY=',
      ].join('\n')
    ),
    {
      EMPTY: '',
      PLAIN: 'value',
      QUOTED: 'quoted value',
      SINGLE: 'single value',
    }
  );
});

test('Hive Docker Next build wrapper accepts --env-file syntax variants', () => {
  assert.deepEqual(parseArgs(['--env-file', '/tmp/web.env']), {
    envFile: '/tmp/web.env',
  });
  assert.deepEqual(parseArgs(['--env-file=/tmp/web.env']), {
    envFile: '/tmp/web.env',
  });
});

test('Hive Docker Next build wrapper loads env files through an injectable fs', () => {
  const fsImpl = {
    readFileSync(filePath) {
      assert.equal(filePath, '/tmp/web.env');
      return 'DOCKER_WEB_DOCKER_MEMORY_LIMIT=8g\n';
    },
  };

  assert.deepEqual(loadEnvFile('/tmp/web.env', fsImpl), {
    DOCKER_WEB_DOCKER_MEMORY_LIMIT: '8g',
  });
});

test('Hive Docker Next build wrapper delegates Next to Node with Docker budgets', () => {
  const env = getHiveDockerNextBuildEnv(
    {
      DOCKER_WEB_DOCKER_MEMORY_LIMIT: '8g',
      NODE_OPTIONS: '--trace-warnings --max-old-space-size=2048',
    },
    {
      DOCKER_WEB_STATIC_GENERATION_MAX_CONCURRENCY: '3',
    }
  );

  assert.equal(env.DOCKER_WEB_NEXT_BUILD_CPUS, '1');
  assert.equal(env.DOCKER_WEB_STATIC_GENERATION_MAX_CONCURRENCY, '3');
  assert.equal(
    env.NODE_OPTIONS,
    '--trace-warnings --max-old-space-size=7168 --experimental-require-module'
  );
  assert.deepEqual(getHiveDockerNextBuildArgs().slice(-2), [
    'build',
    '--turbopack',
  ]);
});
