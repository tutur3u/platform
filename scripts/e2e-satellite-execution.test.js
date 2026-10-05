const assert = require('node:assert/strict');
const test = require('node:test');
const { runFixtureLifecycle } = require('./e2e-satellite-execution');

for (const phase of ['start', 'run']) {
  test(`keeps ${phase} failure when diagnostics and cleanup also fail`, async (t) => {
    const primary = new Error('primary');
    const diagnostic = new Error('diagnostic');
    const cleanup = new Error('cleanup');
    const logged = [];
    t.mock.method(console, 'error', (error) => logged.push(error));
    let stopped = false;
    await assert.rejects(
      runFixtureLifecycle({
        runtime: {},
        start: async () => {
          if (phase === 'start') throw primary;
        },
        run: async () => {
          throw primary;
        },
        diagnose: async () => {
          throw diagnostic;
        },
        stop: async () => {
          stopped = true;
          throw cleanup;
        },
      }),
      (error) => error === primary
    );
    assert.equal(stopped, true);
    assert.deepEqual(logged, [diagnostic, cleanup]);
  });
}

test('successful execution reports cleanup failure as its causal error', async () => {
  const cleanup = new Error('cleanup');
  await assert.rejects(
    runFixtureLifecycle({
      runtime: {},
      start: async () => {},
      run: async () => {},
      diagnose: async () => assert.fail('no diagnostics on success'),
      stop: async () => {
        throw cleanup;
      },
    }),
    (error) => error === cleanup
  );
});
