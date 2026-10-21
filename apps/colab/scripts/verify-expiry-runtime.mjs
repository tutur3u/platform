import assert from 'node:assert/strict';
import { after, afterEach, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createTestHarness } from 'wrangler';
import { projectExpiryDiagnostics } from './expiry-fixture-diagnostics.mjs';

const server = createTestHarness({
  workers: [
    {
      configPath: fileURLToPath(
        new URL('../test-fixtures/wrangler.jsonc', import.meta.url)
      ),
    },
  ],
});
let observation;
function reportObservation(nodePhase = observation?.nodePhase) {
  try {
    if (observation) {
      console.info(
        JSON.stringify(
          projectExpiryDiagnostics(
            server.getLogs(),
            observation.case,
            nodePhase
          )
        )
      );
    }
  } catch {
    // Diagnostics must never replace a primary test or teardown failure.
  }
}
before(async () => {
  await server.listen();
});
afterEach(() => {
  reportObservation();
});
after(async () => {
  reportObservation('close-start');
  await server.close();
  reportObservation('close-complete');
});
for (const path of ['/duplicates', '/failure']) {
  test(`real DO expiry is atomic and idempotent: ${path}`, {
    timeout: 30_000,
  }, async () => {
    const current = {
      case: path === '/failure' ? 'failure' : 'duplicates',
      nodePhase: 'fetch-start',
    };
    observation = current;
    const response = await server.fetch(path);
    current.nodePhase = 'fetch-complete';
    assert.equal(response.status, 200);
    current.nodePhase = 'read-start';
    const result = await response.json();
    current.nodePhase = 'read-complete';
    assert.deepEqual(result, {
      revision: 1,
      mode: 'readonly',
      ended: 1,
      complete: true,
      nextAlarm: null,
    });
  });
}
