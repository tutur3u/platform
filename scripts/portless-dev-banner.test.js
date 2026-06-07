const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DEFAULT_DEV_MAX_OPEN_FILES,
  DEFAULT_WATCHPACK_POLLING,
  formatPortlessBanner,
  parseCommandArgs,
  prepareCommandForOpenFilesLimit,
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
  assert.equal(prepared.env.WATCHPACK_POLLING, DEFAULT_WATCHPACK_POLLING);
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
