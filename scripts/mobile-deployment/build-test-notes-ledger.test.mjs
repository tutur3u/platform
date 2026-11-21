import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertNewestIosBuild,
  originalBuildHistory,
} from './build-test-notes.mjs';

const sha = 'e'.repeat(40);
const identity = { version: '0.20.4', number: '1000000', sourceSha: sha };
const history = {
  build: identity,
  releases: [
    {
      version: '0.20.4',
      changes: ['add scoped timezone settings and preserve calendar instants'],
    },
  ],
};

test('distribution stops when a newer iOS build was uploaded meanwhile', async () => {
  const paths = [];
  const apple = (version) => async (path) => {
    paths.push(path);
    return { data: version ? [{ attributes: { version } }] : [] };
  };
  await assertNewestIosBuild(apple('1000002'), 'app', '1000002');
  await assertNewestIosBuild(apple(undefined), 'app', '1000002');
  await assert.rejects(
    assertNewestIosBuild(apple('1000003'), 'app', '1000002'),
    /newer iOS build 1000003/
  );
  assert.match(
    decodeURIComponent(paths[0]),
    /filter\[preReleaseVersion\.platform\]=IOS/
  );
});

test('ledger builds find their upload run past many review retries', async () => {
  const ledgerHistory = history;
  const pages = [];
  const run = (_command, args) => {
    const path = args[1];
    if (_command === 'unzip') return JSON.stringify(ledgerHistory);
    if (path.includes('/workflows/')) {
      const page = Number(/[?&]page=(\d+)/u.exec(path)[1]);
      const created = /[?&]created=([\d-]+)/u.exec(path)[1];
      pages.push(`${created}:${page}`);
      // Earlier days hold no runs for this commit.
      if (created !== '2026-11-20')
        return JSON.stringify({ workflow_runs: [] });
      // A full first page of review retries for the same commit.
      if (page === 1)
        return JSON.stringify({
          workflow_runs: Array.from({ length: 100 }, (_, i) => ({
            id: 1000 + i,
            head_branch: 'production',
            head_sha: sha,
            display_title: 'Mobile Store Deployment (retry_ios_review)',
          })),
        });
      return JSON.stringify({
        workflow_runs: [
          {
            id: 55,
            head_branch: 'production',
            head_sha: sha,
            display_title: 'Mobile Store Deployment',
          },
        ],
      });
    }
    if (path.includes('/runs/55/artifacts'))
      return JSON.stringify({
        artifacts: [
          {
            id: 18,
            name: 'mobile-beta-release-history',
            expired: false,
            size_in_bytes: 400,
          },
        ],
      });
    if (path.endsWith('/artifacts/18/zip')) return Buffer.from('archive');
    // Retry runs carry no history artifact and must not be inspected.
    throw new Error(`Unexpected lookup ${path}`);
  };
  const ledger = async () => [
    {
      build: 1000000,
      version: '0.20.4',
      sha,
      shared: true,
      platforms: [],
    },
  ];
  assert.match(
    await originalBuildHistory('1000000', '0.20.4', {
      run,
      ledger,
      now: () => Date.parse('2026-11-22T08:00:00Z'),
    }),
    /calendar instants/
  );
  // One-day windows stay under GitHub's 1,000-result search cap; the upload
  // day is paged past its review retries.
  assert.deepEqual(pages.slice(0, 4), [
    '2026-11-22:1',
    '2026-11-21:1',
    '2026-11-20:1',
    '2026-11-20:2',
  ]);
});
