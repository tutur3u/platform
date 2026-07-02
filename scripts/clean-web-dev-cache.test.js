const test = require('node:test');
const assert = require('node:assert/strict');

const {
  assertSafeTarget,
  cleanWebDevCache,
  parseArgs,
  resolveTargets,
} = require('./clean-web-dev-cache');

function createFakeFs({ dirs = [], entries = [] } = {}) {
  const existing = new Set(dirs);
  const removed = [];

  return {
    existsSync: (filePath) => existing.has(filePath),
    readdirSync: () =>
      entries.map((name) => ({
        isDirectory: () => true,
        name,
      })),
    removed,
    rmSync: (filePath, options) => {
      removed.push({ filePath, options });
      existing.delete(filePath);
    },
    statSync: () => ({ size: 512 }),
  };
}

test('parseArgs recognizes dry-run and optional cache scopes', () => {
  assert.deepEqual(
    parseArgs(['--dry-run', '--all-next-dev', '--include-turbo-cache']),
    {
      allNextDev: true,
      dryRun: true,
      help: false,
      includeTurboCache: true,
    }
  );
  assert.throws(() => parseArgs(['--unknown']), /Unknown argument/);
});

test('assertSafeTarget only allows known dev cache directories', () => {
  assert.doesNotThrow(() => assertSafeTarget('apps/web/.next/dev'));
  assert.doesNotThrow(() => assertSafeTarget('apps/infrastructure/.next/dev'));
  assert.doesNotThrow(() => assertSafeTarget('.turbo/cache'));
  assert.throws(() => assertSafeTarget('apps/web/.next'), /unsafe target/);
  assert.throws(
    () => assertSafeTarget('../apps/web/.next/dev'),
    /unsafe target/
  );
});

test('resolveTargets defaults to the web Next dev cache', () => {
  assert.deepEqual(resolveTargets(), ['apps/web/.next/dev']);
  assert.deepEqual(resolveTargets({ includeTurboCache: true }), [
    '.turbo/cache',
    'apps/web/.next/dev',
  ]);
});

test('resolveTargets can discover all existing app Next dev caches', () => {
  const fsImpl = createFakeFs({
    dirs: [
      '/repo/apps',
      '/repo/apps/web/.next/dev',
      '/repo/apps/infrastructure/.next/dev',
    ],
    entries: ['web', 'infrastructure', 'calendar'],
  });

  assert.deepEqual(
    resolveTargets({ allNextDev: true }, { fsImpl, rootDir: '/repo' }),
    ['apps/infrastructure/.next/dev', 'apps/web/.next/dev']
  );
});

test('cleanWebDevCache dry-run reports reclaimable bytes without deleting', () => {
  const fsImpl = createFakeFs({
    dirs: ['/repo/apps/web/.next/dev', '/repo/.turbo/cache'],
  });
  const writes = [];
  const result = cleanWebDevCache(
    { dryRun: true, includeTurboCache: true },
    {
      execFileSyncImpl: () => '1024\tpath\n',
      fsImpl,
      output: { write: (line) => writes.push(line) },
      rootDir: '/repo',
    }
  );

  assert.equal(result.totalBytes, 2 * 1024 * 1024);
  assert.deepEqual(fsImpl.removed, []);
  assert.match(writes.join(''), /would remove \.turbo\/cache/);
  assert.match(writes.join(''), /Would reclaim 2.0MB/);
});

test('cleanWebDevCache removes only resolved safe targets', () => {
  const fsImpl = createFakeFs({
    dirs: ['/repo/apps/web/.next/dev'],
  });
  const writes = [];

  cleanWebDevCache(
    {},
    {
      execFileSyncImpl: () => '2048\tpath\n',
      fsImpl,
      output: { write: (line) => writes.push(line) },
      rootDir: '/repo',
    }
  );

  assert.deepEqual(fsImpl.removed, [
    {
      filePath: '/repo/apps/web/.next/dev',
      options: { force: true, recursive: true },
    },
  ]);
  assert.match(writes.join(''), /removed apps\/web\/\.next\/dev/);
  assert.match(writes.join(''), /Reclaimed 2.0MB/);
});
