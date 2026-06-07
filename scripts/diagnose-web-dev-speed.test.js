const test = require('node:test');
const assert = require('node:assert/strict');

const {
  collectWebDevSpeedDiagnostics,
  extractSlowFilesystemWarnings,
  extractWatcherErrors,
  formatBytes,
  formatDiagnosticsReport,
  parseTraceEvents,
  summarizeTraceEvents,
} = require('./diagnose-web-dev-speed');

test('formatBytes keeps cache sizes readable', () => {
  assert.equal(formatBytes(0), '0B');
  assert.equal(formatBytes(1024), '1.0KB');
  assert.equal(formatBytes(80 * 1024 * 1024 * 1024), '80GB');
});

test('extractSlowFilesystemWarnings finds Next local dev warnings', () => {
  assert.deepEqual(
    extractSlowFilesystemWarnings(
      [
        'normal line',
        '⚠ Slow filesystem detected. The benchmark took 222ms.',
        'another line',
      ].join('\n')
    ),
    ['⚠ Slow filesystem detected. The benchmark took 222ms.']
  );
});

test('extractWatcherErrors finds file descriptor watcher failures', () => {
  assert.deepEqual(
    extractWatcherErrors(
      [
        'normal line',
        'Watchpack Error (watcher): Error: EMFILE: too many open files, watch',
      ].join('\n')
    ),
    ['Watchpack Error (watcher): Error: EMFILE: too many open files, watch']
  );
});

test('parseTraceEvents accepts line-delimited Next trace arrays', () => {
  assert.deepEqual(
    parseTraceEvents(
      [
        '[{"name":"compile-path","duration":42843252,"tags":{"trigger":"/[locale]"}}]',
        '{"name":"handle-request","duration":47844000,"tags":{"url":"/"}}',
        '{',
      ].join('\n')
    ),
    [
      {
        name: 'compile-path',
        duration: 42843252,
        tags: { trigger: '/[locale]' },
      },
      { name: 'handle-request', duration: 47844000, tags: { url: '/' } },
    ]
  );
});

test('summarizeTraceEvents keeps the slowest relevant spans', () => {
  assert.deepEqual(
    summarizeTraceEvents(
      [
        { name: 'ignored', duration: 999999999 },
        { name: 'compile-path', duration: 42843252, tags: { trigger: '/' } },
        { name: 'setup-dev-bundler', duration: 13600000 },
      ],
      { limit: 1 }
    ),
    [{ durationMs: 42843, name: 'compile-path', tags: { trigger: '/' } }]
  );
});

test('collectWebDevSpeedDiagnostics reads cache state, logs, and traces', () => {
  const files = new Map([
    [
      '/repo/apps/web/.next/dev/logs/next-development.log',
      [
        '⚠ Slow filesystem detected. The benchmark took 222ms.',
        'Watchpack Error (watcher): Error: EMFILE: too many open files, watch',
      ].join('\n'),
    ],
    [
      '/repo/apps/web/.next/dev/trace',
      '[{"name":"compile-path","duration":42000000,"tags":{"trigger":"/"}}]',
    ],
  ]);
  const existing = new Set([
    '/repo/.turbo/cache',
    '/repo/apps/web/.next/dev',
    ...files.keys(),
  ]);
  const fsImpl = {
    existsSync: (filePath) => existing.has(filePath),
    readFileSync: (filePath) => files.get(filePath),
    statSync: () => ({ size: 12 }),
  };

  const diagnostics = collectWebDevSpeedDiagnostics({
    cachePaths: ['.turbo/cache', 'apps/web/.next/dev', 'missing'],
    execFileSyncImpl: (_command, _args) => '2048\tpath\n',
    fsImpl,
    rootDir: '/repo',
  });

  assert.deepEqual(
    diagnostics.cacheSummaries.map((summary) => ({
      bytes: summary.bytes,
      exists: summary.exists,
      path: summary.path,
    })),
    [
      { bytes: 2 * 1024 * 1024, exists: true, path: '.turbo/cache' },
      { bytes: 2 * 1024 * 1024, exists: true, path: 'apps/web/.next/dev' },
      { bytes: 0, exists: false, path: 'missing' },
    ]
  );
  assert.equal(diagnostics.slowFilesystemWarnings.length, 1);
  assert.equal(diagnostics.watcherErrors.length, 1);
  assert.equal(diagnostics.traceSpans[0].durationMs, 42000);
});

test('formatDiagnosticsReport prints missing traces without failing', () => {
  assert.match(
    formatDiagnosticsReport({
      cacheSummaries: [{ path: '.turbo/cache', exists: false, bytes: 0 }],
      slowFilesystemWarnings: [],
      traceSpans: [],
      watcherErrors: [],
    }),
    /Top trace spans:\n- none/
  );
});
