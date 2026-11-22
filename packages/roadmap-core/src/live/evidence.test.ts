/**
 * Commits to main as delivery evidence. Every guard has a broken variant: a
 * reader that accepts anything, or a status engine that calls a cited commit
 * live or merged without the build finding it on main, must fail here.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { tracks } from '../content/tracks.ts';
import { citedCommits, parseEvidence } from './evidence.ts';
import { SNAPSHOT_MAX_AGE_MS } from './hosting.ts';
import type { LiveData } from './model.ts';
import {
  type Deliverable,
  deriveDeliverable,
  indexLiveData,
  noteKind,
} from './status.ts';

const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);
const CHECKED = '2026-11-22T04:00:00.000Z';
const HEAD = 'c'.repeat(40);
const at = (offset: number) => ({
  time: Date.parse(CHECKED) + offset,
  source: HEAD,
});
const BUILD = at(60_000);

const data = (overrides: Partial<LiveData> = {}): LiveData => ({
  schema: 1,
  generatedAt: CHECKED,
  source: 'build',
  main: null,
  prs: [],
  hosts: [],
  ...overrides,
});

const item = (overrides: Partial<Deliverable> = {}): Deliverable => ({
  id: 'x',
  title: 'X',
  prs: [],
  commits: [SHA_A],
  app: 'web',
  fallback: 'in_progress',
  ...overrides,
});

const commit = (sha: string, at = '2026-11-21T10:00:00.000Z') => ({ sha, at });

describe('commit evidence: reading the build snapshot', () => {
  const snapshot = {
    schema: 1,
    checkedAt: CHECKED,
    head: HEAD,
    commits: [commit(SHA_A)],
  };

  it('accepts a well-formed snapshot written for this build', () => {
    assert.deepEqual(parseEvidence(snapshot, BUILD)?.commits, [commit(SHA_A)]);
    // The page reads the build's checked value without a clock.
    assert.equal(parseEvidence(snapshot)?.commits.length, 1);
  });

  for (const [name, value] of [
    ['null', null],
    ['an array', []],
    ['another schema', { ...snapshot, schema: 2 }],
    ['an unknown field', { ...snapshot, note: 'x' }],
    ['a missing head', { ...snapshot, head: undefined }],
    ['a short sha', { ...snapshot, commits: [commit('abc1234')] }],
    [
      'extra fields',
      { ...snapshot, commits: [{ ...commit(SHA_A), subject: 'x' }] },
    ],
    ['a missing time', { ...snapshot, commits: [{ sha: SHA_A }] }],
    [
      'a duplicate commit',
      { ...snapshot, commits: [commit(SHA_A), commit(SHA_A)] },
    ],
    [
      'a commit after the check',
      { ...snapshot, commits: [commit(SHA_A, '2026-11-23T00:00:00Z')] },
    ],
  ] as const)
    it(`rejects ${name}`, () => {
      assert.equal(parseEvidence(value, BUILD), null);
    });

  it('broken variant: the build takes only a snapshot written for it', () => {
    // From the future, or left behind before a bare build.
    assert.equal(parseEvidence(snapshot, at(-5 * 60_000)), null);
    assert.equal(parseEvidence(snapshot, at(SNAPSHOT_MAX_AGE_MS + 1)), null);
    assert.ok(parseEvidence(snapshot, at(SNAPSHOT_MAX_AGE_MS)));
    // Read from another source commit, or a build that names none.
    assert.equal(
      parseEvidence(snapshot, { ...BUILD, source: 'd'.repeat(40) }),
      null
    );
    assert.equal(
      parseEvidence(snapshot, { ...BUILD, source: undefined }),
      null
    );
  });
});

describe('commit evidence: status', () => {
  it('reads as merged with an unverified deploy once every commit is on main', () => {
    const index = indexLiveData(data(), [commit(SHA_A)]);
    const state = deriveDeliverable(item(), index);
    assert.equal(state.status, 'waiting_for_prod_sync');
    assert.equal(state.unverifiedDeploy, true);
    assert.equal(state.shippedAt, '2026-11-21T10:00:00.000Z');
  });

  it('broken variant: a commit is never proof of a deploy', () => {
    // Not for an item with no deploy target, a hosting move on Workers or a
    // host whose deployed commit is newer than the cited one.
    const hosts = [
      {
        app: 'web',
        platform: 'workers' as const,
        commit: SHA_B,
        commitAt: '2026-11-22T03:00:00.000Z',
        behindBy: 0,
      },
    ];
    const index = indexLiveData(data({ hosts }), [commit(SHA_A)]);
    for (const overrides of [
      {},
      { app: null },
      { requires: 'workers' as const },
    ]) {
      const state = deriveDeliverable(item(overrides), index);
      assert.equal(state.status, 'waiting_for_prod_sync');
      assert.equal(state.unverifiedDeploy, true);
    }
  });

  it('broken variant: a cited commit the build did not find keeps the fallback', () => {
    const index = indexLiveData(data(), [commit(SHA_A)]);
    const state = deriveDeliverable(item({ commits: [SHA_A, SHA_B] }), index);
    assert.equal(state.status, 'in_progress');
    assert.equal(state.shippedAt, null);
    assert.equal(
      deriveDeliverable(item(), indexLiveData(data())).status,
      'in_progress'
    );
  });

  it('never promises an app release or names a host', () => {
    const state = deriveDeliverable(
      item({ app: 'mobile' }),
      indexLiveData(data(), [commit(SHA_A)])
    );
    for (const overrides of [
      { app: 'mobile' },
      { requires: 'workers' as const },
      { app: null },
    ])
      assert.equal(noteKind(item(overrides), state), 'unverified');
    // Broken variant: a row with no cited commit keeps the rules it had.
    const merged = { ...state, unverifiedDeploy: false };
    assert.equal(
      noteKind(item({ commits: undefined, app: 'mobile' }), merged),
      'nextRelease'
    );
    assert.equal(
      noteKind(item({ commits: undefined, requires: 'workers' }), merged),
      'notOnWorkers'
    );
    assert.equal(
      noteKind(item({ commits: undefined }), merged),
      'awaitingDeploy'
    );
    assert.equal(noteKind(item(), { ...state, shippedAt: null }), null);
  });

  it('an open pull request still shows before the commits', () => {
    const prs = [
      {
        number: 1,
        title: 'T',
        state: 'open' as const,
        draft: true,
        approved: false,
        mergedAt: null,
      },
    ];
    const index = indexLiveData(data({ prs } as Partial<LiveData>), [
      commit(SHA_A),
    ]);
    assert.equal(
      deriveDeliverable(item({ prs: [1] }), index).status,
      'in_progress'
    );
    // Also while the build found no commit (an offline build): an approved
    // request waits for its merge instead of reading as the fallback.
    const approved = [{ ...prs[0], draft: false, approved: true }];
    assert.equal(
      deriveDeliverable(
        item({ prs: [1] }),
        indexLiveData(data({ prs: approved } as Partial<LiveData>))
      ).status,
      'waiting_for_merge'
    );
  });
});

describe('commit evidence: curated citations', () => {
  it('collects every cited commit once', () => {
    const fixture = [
      {
        id: 't',
        name: 'T',
        summary: 'T',
        milestones: [
          {
            id: 'm',
            title: 'M',
            deliverables: [
              item({ id: 'a', commits: [SHA_A, SHA_B] }),
              item({ id: 'b', commits: [SHA_A] }),
              item({ id: 'c', commits: undefined }),
            ],
          },
        ],
      },
    ];
    assert.deepEqual([...citedCommits(fixture)].sort(), [SHA_A, SHA_B]);
  });

  it('cites full commit SHAs only', () => {
    for (const sha of citedCommits(tracks)) assert.match(sha, /^[a-f0-9]{40}$/);
  });
});
