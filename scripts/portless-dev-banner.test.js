const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  DEFAULT_DEV_MAX_OPEN_FILES,
  formatPortlessBanner,
  getSharedLocalEnvFilePaths,
  loadSharedLocalEnvDefaults,
  parseCommandArgs,
  parseEnvFile,
  prepareCommandForOpenFilesLimit,
  shouldLoadSharedLocalEnv,
  shouldPrintBannerForChunk,
} = require('./portless-dev-banner');

test('formatPortlessBanner prints the injected public Portless URL', () => {
  assert.equal(
    formatPortlessBanner('https://tuturuuu.localhost'),
    '\n  Portless URL: https://tuturuuu.localhost\n'
  );
  assert.equal(formatPortlessBanner(''), null);
});

test('parseCommandArgs strips the package-script separator', () => {
  assert.deepEqual(parseCommandArgs(['--', 'next', 'dev']), ['next', 'dev']);
  assert.deepEqual(parseCommandArgs(['bun', '--watch', 'src/index.ts']), [
    'bun',
    '--watch',
    'src/index.ts',
  ]);
});

test('parseEnvFile ignores comments and unquotes values', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'portless-env-'));
  const envFilePath = path.join(tempDir, '.env.local');

  try {
    fs.writeFileSync(
      envFilePath,
      [
        '# Comment',
        'NEXT_PUBLIC_SUPABASE_URL=http://localhost:8001 # local',
        'SUPABASE_ANON_KEY="value-with-#-inside"',
        'SUPABASE_SECRET_KEY=test-secret',
      ].join('\n')
    );

    assert.deepEqual(parseEnvFile(envFilePath), {
      NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:8001',
      SUPABASE_ANON_KEY: 'value-with-#-inside',
      SUPABASE_SECRET_KEY: 'test-secret',
    });
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('loadSharedLocalEnvDefaults loads root defaults with app overrides', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'portless-root-env-'));
  const appDir = path.join(tempDir, 'apps', 'web');

  try {
    fs.mkdirSync(appDir, { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, '.env.local'),
      [
        'NEXT_PUBLIC_TURNSTILE_SITE_KEY=root-site-key',
        'ROOT_ONLY=from-root',
        'PROCESS_WINS=from-root',
      ].join('\n')
    );
    fs.writeFileSync(
      path.join(appDir, '.env.local'),
      ['NEXT_PUBLIC_TURNSTILE_SITE_KEY=app-site-key', 'APP_ONLY=from-app'].join(
        '\n'
      )
    );

    const loadedEnv = loadSharedLocalEnvDefaults({
      cwd: appDir,
      env: {
        PATH: '/bin',
        PROCESS_WINS: 'from-process',
      },
      rootDir: tempDir,
    });

    assert.equal(loadedEnv.NEXT_PUBLIC_TURNSTILE_SITE_KEY, 'app-site-key');
    assert.equal(loadedEnv.ROOT_ONLY, 'from-root');
    assert.equal(loadedEnv.APP_ONLY, 'from-app');
    assert.equal(loadedEnv.PROCESS_WINS, 'from-process');
    assert.equal(loadedEnv.PATH, '/bin');
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('getSharedLocalEnvFilePaths deduplicates root and app env paths', () => {
  const rootDir = path.join(os.tmpdir(), 'platform');

  assert.deepEqual(getSharedLocalEnvFilePaths({ cwd: rootDir, rootDir }), [
    path.join(rootDir, '.env.local'),
    path.join(rootDir, '.env'),
    path.join(rootDir, '.env.development'),
    path.join(rootDir, '.env.development.local'),
  ]);
});

test('shouldLoadSharedLocalEnv only targets Next.js development commands', () => {
  assert.equal(shouldLoadSharedLocalEnv(['next', 'dev']), true);
  assert.equal(shouldLoadSharedLocalEnv(['next', 'start']), false);
  assert.equal(
    shouldLoadSharedLocalEnv(['bun', '--watch', 'src/index.ts']),
    false
  );
});

test('prepareCommandForOpenFilesLimit raises descriptor limit on unix dev commands', () => {
  const prepared = prepareCommandForOpenFilesLimit({
    commandArgs: ['next', 'dev', '-p', '7803'],
    env: { PATH: '/bin' },
    platform: 'darwin',
  });

  assert.equal(prepared.command, '/bin/sh');
  assert.equal(
    prepared.env.TUTURUUU_DEV_MAX_OPEN_FILES,
    DEFAULT_DEV_MAX_OPEN_FILES
  );
  assert.equal('WATCHPACK_POLLING' in prepared.env, false);
  assert.deepEqual(prepared.args.slice(0, 3), [
    '-c',
    'ulimit -n "$TUTURUUU_DEV_MAX_OPEN_FILES" 2>/dev/null || true; exec "$@"',
    'tuturuuu-dev-command',
  ]);
  assert.deepEqual(prepared.args.slice(3), ['next', 'dev', '-p', '7803']);
});

test('prepareCommandForOpenFilesLimit can be disabled for direct spawning', () => {
  assert.deepEqual(
    prepareCommandForOpenFilesLimit({
      commandArgs: ['next', 'dev'],
      env: { TUTURUUU_DEV_MAX_OPEN_FILES: '0' },
      platform: 'darwin',
    }),
    {
      args: ['dev'],
      command: 'next',
      env: { TUTURUUU_DEV_MAX_OPEN_FILES: '0' },
    }
  );
});

test('prepareCommandForOpenFilesLimit preserves explicit Watchpack polling env', () => {
  const prepared = prepareCommandForOpenFilesLimit({
    commandArgs: ['next', 'dev'],
    env: {
      TUTURUUU_DEV_MAX_OPEN_FILES: '8192',
      WATCHPACK_POLLING: 'false',
    },
    platform: 'linux',
  });

  assert.equal(prepared.env.TUTURUUU_DEV_MAX_OPEN_FILES, '8192');
  assert.equal(prepared.env.WATCHPACK_POLLING, 'false');
});

test('shouldPrintBannerForChunk detects Next.js startup lines', () => {
  assert.equal(
    shouldPrintBannerForChunk('- Local:         http://localhost:4803'),
    false
  );
  assert.equal(
    shouldPrintBannerForChunk('- Network:       http://192.168.1.8:4803'),
    true
  );
  assert.equal(shouldPrintBannerForChunk('- Environments: .env.local'), true);
  assert.equal(shouldPrintBannerForChunk('Ready in 1200ms'), true);
});
