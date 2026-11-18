import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  commitWindow,
  type CommitFact,
} from '@tuturuuu/roadmap-core/insights/commits.ts';
import { buildRoadmapSnapshot } from './roadmap-snapshot.ts';

test('the redesign snapshot keeps Vietnam-day counts and omits restricted titles', () => {
  const now = Date.parse('2026-11-18T01:00:00Z');
  const facts: CommitFact[] = [
    {
      at: '2026-11-17T17:00:00Z',
      subject: 'feat(tasks): Save board filters (#12)',
    },
    {
      at: '2026-11-17T16:59:59Z',
      subject: 'feat(tasks): Add private customer folders',
    },
    { at: '2026-10-24T00:00:00Z', subject: 'fix(tasks): Correct card sorting' },
    { at: '2026-11-10T00:00:00Z', subject: 'fix(tasks): Correct card order' },
    { at: '2026-11-10T00:00:00Z', subject: 'chore(deps): Update dependencies' },
    {
      at: '2026-11-18T00:00:00Z',
      subject: 'feat(mastermind): Save favorite views',
    },
    {
      at: '2026-11-18T00:00:00Z',
      subject: 'fix(unrecognized): Correct card order',
    },
  ].map((fact, index) => ({
    ...fact,
    sha: String(index).repeat(40),
    authorName: 'author',
    authorEmail: '',
    files: [],
    inProduction: false,
  }));
  const deploy = {
    app: 'web',
    commit: 'f'.repeat(40),
    builtAt: '2026-11-17T23:00:00.000Z',
  };
  const snapshot = buildRoadmapSnapshot({
    now,
    window: commitWindow(facts, {
      now,
      days: 30,
      trackIds: ['tasks', 'mastermind'],
      production: null,
    }),
    facts,
    prs: [
      {
        number: 12,
        title: facts[0].subject,
        state: 'merged',
        mergedAt: facts[0].at,
        approved: false,
        draft: false,
      },
    ],
    deployed: deploy,
    previousDeploys: [
      { env: 'production', sha: deploy.commit, at: '2026-11-17T22:00:00.000Z' },
    ],
    buildDeploys: [
      { ...deploy, app: 'meet', builtAt: '2026-11-17T22:30:00.000Z' },
      { ...deploy, app: 'meet' },
    ],
    parentsBySha: new Map([[deploy.commit, [facts[0].sha]]]),
  });
  const tasks = snapshot.products.find(({ key }) => key === 'tasks');
  assert.ok(tasks);
  assert.equal(tasks.daily.length, 30);
  assert.deepEqual(tasks.daily.slice(-2), [1, 1]);
  assert.equal(tasks.commits7d, 2);
  assert.equal(tasks.commits30d, 4);
  assert.equal(tasks.commits7dPrev, 1);
  assert.equal(snapshot.commits7d, 4);
  assert.equal(snapshot.commits7dPrev, 2);
  assert.equal(snapshot.daily?.length, 30);
  assert.equal(
    snapshot.daily?.slice(-7).reduce((sum, count) => sum + count, 0),
    snapshot.commits7d
  );
  assert.equal(
    snapshot.daily?.slice(-14, -7).reduce((sum, count) => sum + count, 0),
    snapshot.commits7dPrev
  );
  assert.equal(
    snapshot.products.find(({ key }) => key === 'mind')?.commits7d,
    1
  );
  assert.equal(
    snapshot.products.find(({ key }) => key === 'mind')?.recent[0]?.live,
    null
  );
  assert.equal(
    snapshot.products.find(({ key }) => key === 'other')?.commits7d,
    1
  );
  assert.equal(tasks.prs7d, 1);
  assert.deepEqual(tasks.recent, [
    {
      sha: facts[0].sha,
      subject: 'Save board filters',
      pr: 12,
      date: '2026-11-17T17:00:00.000Z',
      live: true,
    },
  ]);
  assert.deepEqual(snapshot.deploys, [
    {
      env: 'production',
      sha: deploy.commit,
      at: '2026-11-17T22:00:00.000Z',
      apps: 2,
    },
  ]);
  assert.equal(snapshot.productionSha, deploy.commit);
});
