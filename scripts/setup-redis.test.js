const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  formatSetupResult,
  parseArgs,
  resetRedis,
  runCli,
  setupRedis,
  updateEnvContent,
} = require('./setup-redis');

test('updateEnvContent updates Redis env keys and preserves unrelated lines', () => {
  assert.equal(
    updateEnvContent(
      [
        'NEXT_PUBLIC_SUPABASE_URL=http://localhost:8001',
        'export UPSTASH_REDIS_REST_URL=https://old.example',
        'UPSTASH_REDIS_REST_TOKEN=old-token',
        '',
      ].join('\n'),
      {
        UPSTASH_REDIS_REST_TOKEN: 'new-token',
        UPSTASH_REDIS_REST_URL: 'http://localhost:8079',
      }
    ),
    [
      'NEXT_PUBLIC_SUPABASE_URL=http://localhost:8001',
      'export UPSTASH_REDIS_REST_URL=http://localhost:8079',
      'UPSTASH_REDIS_REST_TOKEN=new-token',
      '',
    ].join('\n')
  );
});

test('setupRedis writes apps/web env and starts Redis by default', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'setup-redis-'));
  const envFile = path.join(rootDir, 'apps', 'web', '.env.local');
  fs.mkdirSync(path.dirname(envFile), { recursive: true });
  fs.writeFileSync(envFile, 'NEXT_PUBLIC_APP_URL=https://tuturuuu.localhost\n');
  const calls = [];

  const result = setupRedis({
    rootDir,
    runner: (command, args) => {
      calls.push([command, args]);
      return { status: 0 };
    },
  });

  assert.equal(result.changed, true);
  assert.deepEqual(calls, [['bun', ['redis:start']]]);
  const content = fs.readFileSync(envFile, 'utf8');
  assert.match(content, /NEXT_PUBLIC_APP_URL=https:\/\/tuturuuu\.localhost/u);
  assert.match(content, /UPSTASH_REDIS_REST_URL=http:\/\/localhost:8079/u);
  assert.match(content, /UPSTASH_REDIS_REST_TOKEN=example_token/u);
});

test('setupRedis dry-run does not write or start Redis', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'setup-redis-'));
  const envFile = path.join(rootDir, 'apps', 'web', '.env.local');
  fs.mkdirSync(path.dirname(envFile), { recursive: true });
  fs.writeFileSync(envFile, 'UPSTASH_REDIS_REST_TOKEN=old-token\n');
  const calls = [];

  const result = setupRedis({
    dryRun: true,
    rootDir,
    runner: (command, args) => {
      calls.push([command, args]);
      return { status: 0 };
    },
  });

  assert.equal(result.dryRun, true);
  assert.deepEqual(calls, []);
  assert.equal(
    fs.readFileSync(envFile, 'utf8'),
    'UPSTASH_REDIS_REST_TOKEN=old-token\n'
  );
});

test('setupRedis supports env-only setup with custom URL and token', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'setup-redis-'));

  setupRedis({
    redisToken: 'custom-token',
    redisUrl: 'http://127.0.0.1:8079',
    rootDir,
    start: false,
  });

  const content = fs.readFileSync(
    path.join(rootDir, 'apps', 'web', '.env.local'),
    'utf8'
  );
  assert.match(content, /UPSTASH_REDIS_REST_URL=http:\/\/127\.0\.0\.1:8079/u);
  assert.match(content, /UPSTASH_REDIS_REST_TOKEN=custom-token/u);
});

test('formatSetupResult redacts Redis token', () => {
  const output = formatSetupResult({
    changed: true,
    dryRun: false,
    envFile: 'apps/web/.env.local',
    redisUrl: 'http://localhost:8079',
    start: false,
    startExitCode: null,
  });

  assert.match(output, /UPSTASH_REDIS_REST_TOKEN=<redacted>/u);
  assert.doesNotMatch(output, /example_token/u);
});

test('parseArgs supports setup flags', () => {
  assert.deepEqual(
    parseArgs([
      '--dry-run',
      '--no-start',
      '--url=http://127.0.0.1:8079',
      '--token',
      'custom-token',
      '--env-file',
      'tmp/web.env',
    ]),
    {
      dryRun: true,
      envFilePath: 'tmp/web.env',
      redisToken: 'custom-token',
      redisUrl: 'http://127.0.0.1:8079',
      reset: false,
      start: false,
    }
  );
});

test('resetRedis starts Redis and flushes the database', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'setup-redis-'));
  const calls = [];

  const result = resetRedis({
    rootDir,
    runner: (command, args, options) => {
      calls.push({ args, command, cwd: options.cwd });
      return { status: 0, stdout: command === 'docker' ? 'OK\n' : '' };
    },
  });

  assert.equal(result.flushExitCode, 0);
  assert.equal(result.flushOutput, 'OK\n'.trim());
  assert.deepEqual(
    calls.map((call) => [call.command, call.args]),
    [
      ['bun', ['redis:start']],
      ['docker', ['compose', 'exec', '-T', 'redis', 'redis-cli', 'FLUSHALL']],
    ]
  );
  assert.equal(calls[1].cwd, path.join(rootDir, 'apps', 'redis'));
});

test('resetRedis dry-run does not start or flush Redis', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'setup-redis-'));
  const calls = [];

  const result = resetRedis({
    dryRun: true,
    rootDir,
    runner: (command, args) => {
      calls.push([command, args]);
      return { status: 0 };
    },
  });

  assert.equal(result.flushExitCode, null);
  assert.deepEqual(calls, []);
});

test('parseArgs supports reset mode', () => {
  assert.equal(parseArgs(['--reset']).reset, true);
});

test('runCli returns Redis start failures', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'setup-redis-'));
  const logs = [];
  const code = runCli({
    log: (message) => logs.push(message),
    rootDir,
    runner: () => ({ status: 7 }),
  });

  assert.equal(code, 7);
  assert.match(logs.join('\n'), /Redis start exited with code 7/u);
});

test('runCli returns Redis flush failures in reset mode', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'setup-redis-'));
  const logs = [];
  const code = runCli({
    argv: ['--reset'],
    log: (message) => logs.push(message),
    rootDir,
    runner: (command) => ({ status: command === 'docker' ? 9 : 0 }),
  });

  assert.equal(code, 9);
  assert.match(logs.join('\n'), /Redis database flush exited with code 9/u);
});
