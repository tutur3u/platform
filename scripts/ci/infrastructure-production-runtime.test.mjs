import assert from 'node:assert/strict';
import test from 'node:test';
import { runInfrastructureProductionRuntime } from './infrastructure-production-runtime.mjs';

test('Infrastructure uses emitted production smoke and protected identity fixture', async () => {
  const sha = 'a'.repeat(40);
  let calls = 0;
  await runInfrastructureProductionRuntime(
    '/fixture/infrastructure',
    sha,
    async (bin, args, options) => {
      calls++;
      assert.equal(bin, process.execPath);
      assert.deepEqual(args, [
        '--test',
        'cloudflare/production.runtime.mjs',
        'cloudflare/build-info-admin.runtime.mjs',
      ]);
      assert.equal(options.cwd, '/fixture/infrastructure');
      assert.equal(options.env.CI_SOURCE_SHA, sha);
      assert.equal(options.env.CI, 'true');
      assert.equal(options.timeout, 240000);
      return { stdout: '', stderr: '' };
    }
  );
  assert.equal(calls, 1);
});

test('Infrastructure rejects missing source identity and propagates runtime failure', async () => {
  await assert.rejects(
    runInfrastructureProductionRuntime('/fixture', 'bad'),
    /AssertionError/
  );
  await assert.rejects(
    runInfrastructureProductionRuntime('/fixture', 'a'.repeat(40), async () => {
      throw new Error('emitted identity mismatch');
    }),
    /emitted identity mismatch/
  );
});
