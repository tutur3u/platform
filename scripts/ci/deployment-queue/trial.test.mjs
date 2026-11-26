import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const cliPath = fileURLToPath(new URL('./trial.mjs', import.meta.url));
const fixturePath = fileURLToPath(
  new URL('./events.fixture.json', import.meta.url)
);
const fixture = readFileSync(fixturePath, 'utf8');
const [firstMain, , latestMain, production] = JSON.parse(fixture).events;
const revisedRecipe = `sha256:${'b'.repeat(64)}`;

function run(args, input) {
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    encoding: 'utf8',
    input,
  });
  assert.ifError(result.error);
  return result;
}

function replay(events) {
  const result = run(['-'], JSON.stringify({ schemaVersion: 1, events }));
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  return JSON.parse(result.stdout);
}

test('fixture produces the same plan from a file or stdin', () => {
  const file = run([fixturePath]);
  const stdin = run(['-'], fixture);
  assert.equal(file.status, 0, file.stderr);
  assert.equal(stdin.status, 0, stdin.stderr);
  assert.equal(file.stderr, '');
  assert.equal(stdin.stderr, '');
  assert.equal(file.stdout, stdin.stdout);

  const { observedHeadSha, ...firstJob } = firstMain;
  assert.equal(observedHeadSha, firstJob.sha);
  const { schemaVersion, mode, queue, decisions } = JSON.parse(file.stdout);
  assert.equal(schemaVersion, 1);
  assert.equal(mode, 'shadow');
  assert.deepEqual(queue, [3, 1, 2]);
  assert.deepEqual(decisions[0], {
    index: 0,
    job: firstJob,
    disposition: 'no_work',
    reason: 'superseded',
    displacedBy: 2,
  });
  assert.deepEqual(
    decisions.map(({ disposition, reason }) => [disposition, reason]),
    [
      ['no_work', 'superseded'],
      ['pending', undefined],
      ['pending', undefined],
      ['pending', undefined],
      ['no_work', 'duplicate'],
      ['no_work', 'stale_head'],
    ]
  );
  assert.equal(decisions[4].duplicateOf, 3);
});

test('production wins across apps and each target orders survivors by acceptance', () => {
  const { queue, decisions } = replay([
    firstMain,
    { ...production, app: 'tasks' },
    production,
    { ...production, app: 'calendar' },
    { ...firstMain, app: 'calendar' },
    { ...firstMain, target: 'production', app: 'tasks' },
  ]);
  assert.deepEqual(queue, [2, 3, 5, 0, 4]);
  assert.equal(decisions[1].reason, 'superseded');
  assert.equal(decisions[1].displacedBy, 5);
});

test('recipe changes are distinct and replays never restore superseded work', () => {
  const revised = { ...firstMain, recipeDigest: revisedRecipe };
  const { queue, decisions } = replay([firstMain, revised, firstMain, revised]);
  assert.deepEqual(queue, [1]);
  assert.equal(decisions[0].reason, 'superseded');
  assert.equal(decisions[2].reason, 'duplicate');
  assert.equal(decisions[2].duplicateOf, 0);
  assert.equal(decisions[3].reason, 'duplicate');
  assert.equal(decisions[3].duplicateOf, 1);
});

test('a duplicate after a head rewind cannot restore old work or leave a stale job pending', () => {
  const { queue, decisions } = replay([firstMain, latestMain, firstMain]);
  assert.deepEqual(queue, []);
  assert.equal(decisions[0].reason, 'superseded');
  assert.equal(decisions[1].reason, 'head_changed');
  assert.equal(decisions[1].displacedBy, 2);
  assert.equal(decisions[2].duplicateOf, 0);
});

test('a stale delivery can expose a changed head but cannot reserve a dedup key', () => {
  const { queue, decisions } = replay([
    firstMain,
    { ...firstMain, observedHeadSha: latestMain.sha },
    { ...latestMain, observedHeadSha: firstMain.sha },
    latestMain,
  ]);
  assert.deepEqual(queue, [3]);
  assert.equal(decisions[0].reason, 'head_changed');
  assert.equal(decisions[1].reason, 'stale_head');
  assert.equal(decisions[2].reason, 'stale_head');
});

test('empty input produces an empty plan', () => {
  assert.deepEqual(replay([]), {
    schemaVersion: 1,
    mode: 'shadow',
    queue: [],
    decisions: [],
  });
});

test('invalid requests return a machine-readable error and no partial plan', () => {
  const invalidInputs = [
    '{invalid',
    JSON.stringify({ schemaVersion: 2, events: [] }),
    ...[
      { ...firstMain, sha: firstMain.sha.slice(0, 7) },
      { ...firstMain, recipeDigest: 'mutable-tag' },
      { ...firstMain, observedHeadSha: '0'.repeat(40) },
      { ...firstMain, target: 'preview' },
      { ...firstMain, securityChecks: 'bypass' },
      { ...firstMain, buildResult: 'success' },
    ].map((invalid) =>
      JSON.stringify({ schemaVersion: 1, events: [firstMain, invalid] })
    ),
  ];
  for (const result of [
    run(['--apply']),
    ...invalidInputs.map((input) => run(['-'], input)),
  ]) {
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.equal(JSON.parse(result.stderr).error.code, 'invalid_input');
  }
});
