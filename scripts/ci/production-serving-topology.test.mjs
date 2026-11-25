import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  productionPublicationPolicy,
  productionServingTopology,
} from '../../tuturuuu.ci.ts';
import {
  productionServingTopologyFor,
  servingTopologyRefusal,
  validateProductionServingTopology,
} from './production-serving-topology.ts';

const profiles = JSON.parse(
  readFileSync(new URL('./wave1-native-profiles.json', import.meta.url))
);

test('every reviewed serving topology belongs to an admitted wave-1 app', () => {
  const entries = validateProductionServingTopology(productionServingTopology);
  for (const [app, entry] of entries) {
    assert.equal(productionPublicationPolicy[app].state, 'admitted', app);
    assert.ok(profiles.apps[app], `${app} must have a wave-1 profile`);
    // Only the app's own canonical host may be a reviewed Custom Domain.
    assert.deepEqual(entry.customDomains, [profiles.apps[app].canonicalHost]);
  }
});

test('Calendar publishes behind calendar.tuturuuu.com; Mail and Apps stay route-free', () => {
  assert.deepEqual(productionServingTopologyFor('calendar')?.customDomains, [
    'calendar.tuturuuu.com',
  ]);
  assert.equal(productionServingTopologyFor('mail'), null);
  assert.equal(productionServingTopologyFor('apps'), null);
});

for (const [name, topology] of [
  ['an app that is not admitted', { drive: entry() }],
  ['an unknown app', { unknown: entry() }],
  ['an extra key', { calendar: { ...entry(), owner: 'x' } }],
  ['a multi-line reason', { calendar: { ...entry(), reason: 'a\nb' } }],
  ['a wildcard domain', { calendar: entry(['*.tuturuuu.com']) }],
  [
    'a duplicate domain',
    { calendar: entry(['a.tuturuuu.com', 'a.tuturuuu.com']) },
  ],
  ['an empty record', { calendar: entry([]) }],
  ['a malformed route', { calendar: { ...entry(), routes: ['not a route'] } }],
]) {
  test(`serving topology rejects ${name}`, () => {
    assert.throws(() => validateProductionServingTopology(topology));
  });
}

function entry(customDomains = ['calendar.tuturuuu.com']) {
  return { reason: 'fixture', customDomains, routes: [] };
}

test('topology comparison is exact in both directions', () => {
  const allowance = {
    reason: 'fixture',
    customDomains: ['calendar.tuturuuu.com'],
    routes: ['calendar.tuturuuu.com/api/*'],
  };
  const domain = { hostname: 'calendar.tuturuuu.com' };
  const route = { pattern: 'calendar.tuturuuu.com/api/*' };
  assert.equal(servingTopologyRefusal(allowance, [domain], [route]), null);
  assert.match(
    servingTopologyRefusal(allowance, [], [route]),
    /Custom Domains differ/
  );
  assert.match(
    servingTopologyRefusal(
      allowance,
      [domain, { hostname: 'x.tuturuuu.com' }],
      [route]
    ),
    /Custom Domains differ/
  );
  assert.match(
    servingTopologyRefusal(allowance, [domain], []),
    /routes differ/
  );
  assert.equal(servingTopologyRefusal(null, [], []), null);
  assert.match(servingTopologyRefusal(null, [domain], []), /Custom Domain/);
  assert.match(servingTopologyRefusal(null, [], [route]), /route/);
});
