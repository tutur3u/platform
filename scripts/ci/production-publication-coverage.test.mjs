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

test('every active production app publishes automatically or has a current exemption', () => {
  assert.deepEqual(productionPublicationCoverageProblems({ rootDir }), []);
});

test('Mail, Apps and the serving Workers publish automatically; Calendar waits', () => {
  const routes = Object.fromEntries(
    productionPublicationCoverage(rootDir).map(({ app, route }) => [app, route])
  );
  for (const app of ['mail', 'apps', 'tasks', 'meet', 'mastermind'])
    assert.equal(routes[app], 'planner', app);
  assert.equal(routes.calendar, null);
  assert.ok(productionPublicationExemptions.calendar);
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
  owner: 'prod-owner',
  approvedOn: '2026-11-25',
  source: 'none',
};

function problems(exemptions) {
  return productionPublicationCoverageProblems({
    rootDir,
    exemptions: { ...productionPublicationExemptions, ...exemptions },
  });
}

test('a held app without an exemption fails', () => {
  const { lettin: _removed, ...rest } = productionPublicationExemptions;
  assert.match(
    productionPublicationCoverageProblems({ rootDir, exemptions: rest }).join(
      '\n'
    ),
    /lettin: excluded from production publication without an exemption/
  );
});

for (const [name, record, message] of [
  ['an unowned record', { ...exemption, owner: 'UNASSIGNED' }, /named owner/],
  ['a blank owner', { ...exemption, owner: ' ' }, /owner must be/],
  [
    'a missing date',
    { reason: 'x', owner: 'x', source: 'none' },
    /exactly reason, owner, approvedOn and source/,
  ],
  [
    'an impossible date',
    { ...exemption, approvedOn: '2026-02-30' },
    /YYYY-MM-DD/,
  ],
  ['a malformed date', { ...exemption, approvedOn: '25 Nov' }, /YYYY-MM-DD/],
  [
    'a leftover expiry',
    { ...exemption, expires: '2026-12-09' },
    /exactly reason, owner, approvedOn and source/,
  ],
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

test('the check does not depend on the current date', (t) => {
  const real = Date.now;
  t.after(() => {
    Date.now = real;
  });
  for (const year of [2026, 2030, 2099]) {
    Date.now = () => Date.UTC(year, 0, 1);
    assert.deepEqual(productionPublicationCoverageProblems({ rootDir }), []);
  }
});

test('an exemption holds an app from automatic publication', () => {
  const routes = Object.fromEntries(
    productionPublicationCoverage(rootDir, ['mail'], { mail: exemption }).map(
      ({ app, route }) => [app, route]
    )
  );
  assert.equal(routes.mail, null);
  assert.deepEqual(problems({ mail: exemption }), []);
});

test('an exemption for an unknown app fails', () => {
  assert.match(
    problems({ unknown: exemption }).join('\n'),
    /unknown production app/
  );
});
