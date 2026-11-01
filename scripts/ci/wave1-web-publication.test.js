// Web issuer publisher identity gates: the real publisher entrypoint against
// counting provider and CLI fixtures. The Worker, route host and D1 allowlists
// run before any provider request, ledger write or upload.
const assert = require('node:assert/strict');
const test = require('node:test');
const { publisher } = require('./wave1-native-publication-harness.cjs');

test('the migrated tutur3u.com host passes the identity gates and publishes once', async (t) => {
  // The reviewed profile names the tutur3u.com apex, which the staging guard
  // allowlist admits exactly; the retired web.staging host is refused by the
  // guard tests. The sealed profile carries no cookie domain (host-only).
  const p = await publisher(t, 'web');
  await p.run();
  assert.equal(p.state.writes, 1);
});
