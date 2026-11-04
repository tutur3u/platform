// Service-token-only bootstrap (Tess ruling R-a/R-b).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  fixtureHealthTokenId,
  fixtureStaffGroupId,
  healthyTopology,
} from './wave1-ingress-fixture.mjs';
import {
  evaluateIngress,
  healthTokenIds,
  ingressTarget,
} from './wave1-ingress-topology.mjs';

const second = '88888888-8888-4888-8888-888888888888';
const check = (
  app,
  phase,
  mutate = () => {},
  healthTokens = [fixtureHealthTokenId]
) => {
  const observed = healthyTopology(
    app,
    phase === 'staff' ? 'staff' : 'bootstrap'
  );
  mutate(observed);
  return evaluateIngress(ingressTarget(app), observed, {
    phase,
    healthTokens,
    staffGroupId: fixtureStaffGroupId,
  });
};
const policies = (o) => o.policies.result;

test('bootstrap admits only the CI health service token, on both hosts', () => {
  for (const app of ['web', 'calendar']) {
    assert.deepEqual(check(app, 'bootstrap'), []);
    assert.equal(
      policies(healthyTopology(app, 'bootstrap')).every(
        (p) => p.decision === 'non_identity'
      ),
      true
    );
  }
});

for (const [label, mutate, message, tokens] of [
  [
    'a staff allow policy',
    (o) =>
      policies(o).push({
        id: 's',
        decision: 'allow',
        include: [{ group: { id: fixtureStaffGroupId } }],
      }),
    /bootstrap allows only/,
  ],
  [
    'a Block: Everyone deny',
    (o) =>
      policies(o).unshift({
        id: 'b',
        decision: 'deny',
        include: [{ everyone: {} }],
      }),
    /bootstrap allows only/,
  ],
  [
    'a bypass',
    (o) =>
      policies(o).push({
        id: 'x',
        decision: 'bypass',
        include: [{ ip: { ip: '0.0.0.0/0' } }],
      }),
    /forbidden/,
  ],
  [
    'an extra service token',
    (o) => policies(o)[0].include.push({ service_token: { token_id: second } }),
    /exactly the CI health/,
  ],
  [
    'the Calendar-to-Web token',
    (o) =>
      policies(o).push({
        id: 'c',
        decision: 'non_identity',
        include: [{ service_token: { token_id: second } }],
      }),
    /exactly the CI health/,
  ],
  [
    'any valid service token',
    (o) => {
      policies(o)[0].include = [{ any_valid_service_token: {} }];
    },
    /must name service tokens/,
  ],
  [
    'no policy at all',
    (o) => {
      o.policies.result = [];
    },
    /exactly the CI health/,
  ],
  [
    'a configured token that is not named',
    () => {},
    /exactly the CI health/,
    [fixtureHealthTokenId, second],
  ],
  [
    'no configured health tokens',
    () => {},
    /needs STAGING_ACCESS_HEALTH_TOKEN_IDS/,
    null,
  ],
]) {
  test(`bootstrap refuses ${label}`, () => {
    const result = check(
      'web',
      'bootstrap',
      mutate,
      tokens === undefined ? [fixtureHealthTokenId] : tokens
    );
    assert.ok(
      result.some((line) => message.test(line)),
      result.join('\n')
    );
  });
}

test('staff still applies C1 and needs a staff allow policy', () => {
  assert.deepEqual(check('web', 'staff'), []);
  const noAllow = check('web', 'staff', (o) => {
    o.policies.result = policies(o).filter((p) => p.decision !== 'allow');
  });
  assert.ok(noAllow.some((line) => /no staff allow/.test(line)));
});

for (const phase of [undefined, '', 'Bootstrap', 'preview', 'staff '])
  test(`an Access phase of ${JSON.stringify(phase)} refuses`, () => {
    const result = check('web', phase);
    assert.ok(
      result.some((line) => /phase must be bootstrap or staff/.test(line)),
      result.join('\n')
    );
  });

test('health token ids parse strictly', () => {
  assert.deepEqual(
    healthTokenIds(`${second}, ${fixtureHealthTokenId},${second}`),
    [fixtureHealthTokenId, second].sort()
  );
  for (const value of [undefined, '', ' , ', 'abc', `${second},x`])
    assert.equal(healthTokenIds(value), null, String(value));
});
