const assert = require('node:assert/strict');
const test = require('node:test');
const { publisher } = require('./wave1-native-publication-harness.cjs');

// Ingress preflight (design §6.1) runs before any ledger write or upload.
for (const [label, mutate, message] of [
  [
    'serving intent off',
    (s) => {
      s.serving = 'off';
    },
    /serving intent is off/,
  ],
  [
    'a wildcard DNS record',
    (s) => {
      s.topology.wildcardRecords.result.push({
        type: 'CNAME',
        name: '*.staging.tutur3u.com',
        content: 'x',
      });
    },
    /N10: wildcard/,
  ],
  [
    'the production Worker on the staging host',
    (s) => {
      s.topology.domains.result[0].service = 'tuturuuu-calendar';
    },
    /R1/,
  ],
  [
    'a capturing zone route',
    (s) => {
      s.topology.routes.result.push({
        pattern: 'calendar.staging.tutur3u.com/*',
        script: 'tuturuuu-calendar',
      });
    },
    /R2: route/,
  ],
  [
    'an Access everyone policy',
    (s) => {
      s.topology.policies.result.push({
        id: 'x',
        decision: 'allow',
        include: [{ everyone: {} }],
      });
    },
    /includes everyone/,
  ],
  [
    'a missing Access application',
    (s) => {
      s.topology.app = { success: false };
    },
    /no self-hosted Access/,
  ],
]) {
  test(`Calendar ingress preflight refuses ${label} with zero writes`, async (t) => {
    const p = await publisher(t, 'calendar');
    mutate(p.state);
    await assert.rejects(p.run, message);
    assert.equal(p.state.writes, 0);
    assert.equal(p.state.ledgerWrites, 0);
    assert.equal(p.state.ledgerQueries, 0);
  });
}
