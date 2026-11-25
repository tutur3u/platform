// Every active production app publishes automatically on a production push,
// or tuturuuu.ci.ts records a dated, owner-approved exemption for it.
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { productionPublicationExemptions } from '../../tuturuuu.ci.ts';
import {
  activeProductionApps,
  productionPublicationCoverage,
  productionPublicationCoverageProblems,
} from './production-publication-coverage.ts';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '../..');
const today = new Date().toISOString().slice(0, 10);

test('every active production app publishes automatically or has a current exemption', () => {
  assert.deepEqual(
    productionPublicationCoverageProblems({ rootDir, today }),
    []
  );
});

test('Mail, Calendar, Apps and the serving Workers publish automatically', () => {
  const routes = Object.fromEntries(
    productionPublicationCoverage(rootDir).map(({ app, route }) => [app, route])
  );
  for (const app of ['mail', 'calendar', 'apps', 'tasks', 'meet', 'mastermind'])
    assert.equal(routes[app], 'planner', app);
  for (const app of ['roadmap', 'learn', 'teach', 'nova', 'tools', 'lms'])
    assert.equal(routes[app], 'serving-workers', app);
});

test('active apps cover every exclusion, policy record and planner target', () => {
  const apps = activeProductionApps();
  for (const app of ['lettin', 'parley', 'colab', 'track', 'mind', 'drive'])
    assert.ok(apps.includes(app), app);
});

const exemption = {
  reason: 'fixture',
  owner: 'UNASSIGNED',
  approvedOn: '2026-11-25',
  expires: '2026-12-09',
  source: 'none',
};

function problems(exemptions, day = '2026-11-26') {
  return productionPublicationCoverageProblems({
    rootDir,
    today: day,
    exemptions: { ...productionPublicationExemptions, ...exemptions },
  });
}

test('a held app without an exemption fails', () => {
  const { lettin: _removed, ...rest } = productionPublicationExemptions;
  assert.match(
    productionPublicationCoverageProblems({
      rootDir,
      today: '2026-11-26',
      exemptions: rest,
    }).join('\n'),
    /lettin: excluded from production publication without an exemption/
  );
});

for (const [name, record, message] of [
  ['an expired record', { ...exemption, expires: '2026-11-26' }, /expired/],
  ['a missing owner', { ...exemption, owner: ' ' }, /owner must be/],
  [
    'a missing field',
    {
      reason: 'x',
      owner: 'x',
      approvedOn: '2026-11-25',
      expires: '2026-12-01',
    },
    /exactly reason/,
  ],
  ['a future approval', { ...exemption, approvedOn: '2026-11-30' }, /future/],
  [
    'an unbounded record',
    { ...exemption, expires: '2027-06-01' },
    /more than 90 days/,
  ],
  ['a malformed date', { ...exemption, expires: '9 December' }, /YYYY-MM-DD/],
  [
    'a malformed source',
    { ...exemption, source: 'see thread' },
    /commit SHA or none/,
  ],
]) {
  test(`an exemption with ${name} fails`, () => {
    assert.match(problems({ git: record }).join('\n'), message);
  });
}

test('an exemption for an app that publishes automatically fails', () => {
  assert.match(
    problems({ mail: exemption }).join('\n'),
    /mail: publishes through planner; remove its exemption/
  );
});

test('an exemption for an unknown app fails', () => {
  assert.match(
    problems({ unknown: exemption }).join('\n'),
    /unknown production app/
  );
});
