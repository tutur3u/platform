const assert = require('node:assert/strict');
const test = require('node:test');
const { publisher } = require('./wave1-native-publication-harness.cjs');

test('native-only Web publishes once without any Vercel credentials or calls', async (t) => {
  const p = await publisher(t, 'web', {
    preFetch: async (u) => {
      assert.ok(!u.hostname.includes('vercel'), 'No Vercel call allowed');
      return null;
    },
  });
  assert.ok(!Object.keys(p.env).some((k) => k.startsWith('VERCEL_')));
  await p.run();
  assert.equal(p.state.writes, 1);
  assert.equal(p.getLedger().entries[0].state, 'activated');
  await p.run();
  assert.equal(p.state.writes, 1);
});
test('native-only Web still refuses missing exact artifact admission', async (t) => {
  const p = await publisher(t, 'web');
  p.env.WAVE1_STAGING_PUBLICATION_ADMISSION = '';
  await assert.rejects(p.run);
  assert.equal(p.state.writes, 0);
});
