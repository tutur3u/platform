const test = require('node:test');
const assert = require('node:assert/strict');
const {
  formatPortlessBanner,
  parseCommandArgs,
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
