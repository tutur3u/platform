// Web issuer publisher identity gates: the real publisher entrypoint against
// counting provider and CLI fixtures. The Worker, route host and D1 allowlists
// run before any provider request, ledger write or upload.
const assert = require('node:assert/strict');
const test = require('node:test');
const { publisher } = require('./wave1-native-publication-harness.cjs');

test('the unmigrated staging host is refused before any provider request', async (t) => {
  // The reviewed profile still names web.staging.tutur3u.com; the
  // <app>.tutur3u.com rule rejects it until the host migration lands, so the
  // pipeline fails closed rather than publishing to a retired hostname.
  const p = await publisher(t, 'web');
  await assert.rejects(p.run, /allowlisted staging host|Staging host/u);
  assert.equal(p.state.writes, 0);
  assert.equal(p.state.reads, 0);
  assert.equal(p.state.flagReads, 0);
  assert.equal(p.state.ledgerQueries, 0);
});
