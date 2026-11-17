/** Commits-to-main metrics: classification, aggregation and validation. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseActivity } from './activity.ts';
import {
  type CommitFact,
  commitTracks,
  commitWindow,
  isNoiseCommit,
  parseCommits,
  viaPullRequest,
} from './commits.ts';

const KNOWN = new Set([
  'calendar',
  'meet',
  'workspace',
  'platform',
  'dx',
  'other',
]);
// 17 Nov 2026 13:00 in Vietnam.
const NOW = Date.parse('2026-11-17T06:00:00Z');
const SHA = (n: number) => n.toString(16).padStart(40, 'a');

function commit(overrides: Partial<CommitFact>): CommitFact {
  return {
    sha: SHA(1),
    at: '2026-11-17T03:00:00Z',
    subject: 'feat(calendar): add week view',
    authorName: 'vhpx',
    authorEmail: 'dev@example.com',
    files: ['apps/calendar/src/page.tsx'],
    inProduction: false,
    ...overrides,
  };
}

describe('commit classification', () => {
  it('maps app paths to products, once per product', () => {
    assert.deepEqual(
      commitTracks(
        ['apps/calendar/a.ts', 'apps/meet/b.ts', 'apps/meet/c.ts'],
        'fix: x',
        KNOWN
      ),
      ['calendar', 'meet']
    );
    assert.deepEqual(commitTracks(['apps/web/a.ts'], 'fix: x', KNOWN), [
      'workspace',
    ]);
    assert.deepEqual(commitTracks(['apps/roadmap/a.ts'], 'fix: x', KNOWN), [
      'platform',
    ]);
  });

  it('falls back to the scope, then tooling paths, then other', () => {
    assert.deepEqual(
      commitTracks(['packages/ui/a.tsx'], 'fix(meet): mute', KNOWN),
      ['meet']
    );
    assert.deepEqual(
      commitTracks(['.github/workflows/x.yaml'], 'ci: cache', KNOWN),
      ['dx']
    );
    assert.deepEqual(commitTracks(['apps/docs/a.mdx'], 'chore: x', KNOWN), [
      'dx',
    ]);
    assert.deepEqual(commitTracks(['packages/x/a.ts'], 'chore: x', KNOWN), [
      'other',
    ]);
  });

  it('drops bots and release chores, keeps pull request merges', () => {
    assert.equal(
      isNoiseCommit(
        commit({
          authorEmail: '41898282+github-actions[bot]@users.noreply.github.com',
        })
      ),
      true
    );
    assert.equal(
      isNoiseCommit(commit({ subject: 'chore(main): release 1.2.0' })),
      true
    );
    assert.equal(
      isNoiseCommit(commit({ subject: 'chore(deps): bump x' })),
      true
    );
    assert.equal(
      isNoiseCommit(commit({ subject: 'Merge pull request #12 from a/b' })),
      false
    );
    assert.equal(isNoiseCommit(commit({})), false);
  });

  it('recognises squash and merge landings as via pull request', () => {
    assert.equal(viaPullRequest('feat(x): y (#8401)'), true);
    assert.equal(viaPullRequest('Merge pull request #12 from a/b'), true);
    assert.equal(viaPullRequest('feat(x): y'), false);
  });
});

describe('commit window', () => {
  const window = commitWindow(
    [
      commit({ sha: SHA(1), inProduction: true }),
      commit({
        sha: SHA(2),
        subject: 'fix(meet): a (#5)',
        files: ['apps/meet/a.ts'],
      }),
      // 16 Nov 23:30 UTC is 17 Nov 06:30 in Vietnam.
      commit({ sha: SHA(3), at: '2026-11-16T23:30:00Z' }),
      commit({ sha: SHA(4), at: '2026-11-16T10:00:00Z', inProduction: true }),
      commit({
        sha: SHA(5),
        subject: 'chore(deps): bump',
        files: ['bun.lock'],
      }),
      commit({ sha: SHA(6), at: '2026-08-01T00:00:00Z' }),
      commit({ sha: SHA(7), at: '2026-11-18T00:00:00Z' }),
    ],
    {
      now: NOW,
      days: 7,
      trackIds: ['calendar', 'meet'],
      production: {
        commit: SHA(9),
        waiting: 3,
        oldestWaitingAt: '2026-11-16T23:30:00Z',
      },
    }
  );

  it('counts per Vietnam day, newest first, inside the window only', () => {
    assert.equal(window.from, '2026-11-11');
    assert.equal(window.to, '2026-11-17');
    assert.deepEqual(window.days, [
      ['2026-11-17', 3, 1, 1],
      ['2026-11-16', 1, 0, 1],
    ]);
  });

  it('counts products per day', () => {
    const calendar = window.tracks.indexOf('calendar');
    const meet = window.tracks.indexOf('meet');
    assert.deepEqual(window.products, [
      ['2026-11-17', calendar, 2],
      ['2026-11-17', meet, 1],
      ['2026-11-16', calendar, 1],
    ]);
  });

  it('round-trips through validation and the activity snapshot', () => {
    const plain = JSON.parse(JSON.stringify(window));
    assert.deepEqual(parseCommits(plain), {
      ...window,
      production: {
        ...window.production,
        oldestWaitingAt: '2026-11-16T23:30:00.000Z',
      },
    });
    const snapshot = parseActivity({
      schema: 1,
      checkedAt: new Date(NOW).toISOString(),
      mode: 'observed',
      deploys: [],
      merged: null,
      commits: plain,
    });
    assert.equal(snapshot.commits?.days.length, 2);
  });

  it('reads anything malformed or missing as not available', () => {
    const plain = JSON.parse(JSON.stringify(window));
    assert.equal(parseCommits(null), null);
    assert.equal(
      parseCommits({ ...plain, days: [['2026-11-17', 1, 2, 0]] }),
      null
    );
    assert.equal(
      parseCommits({ ...plain, days: [['2026-10-01', 1, 0, 0]] }),
      null
    );
    assert.equal(
      parseCommits({ ...plain, products: [['2026-11-17', 99, 1]] }),
      null
    );
    assert.equal(
      parseCommits({ ...plain, production: { commit: 'x', waiting: 1 } })
        ?.production,
      null
    );
    const legacy = parseActivity({
      schema: 1,
      checkedAt: new Date(NOW).toISOString(),
      mode: 'observed',
      deploys: [],
      merged: null,
    });
    assert.equal(legacy.commits ?? null, null);
    assert.equal('commits' in legacy, false);
  });
});
