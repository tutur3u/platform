import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

for (const profile of [undefined, 'staging', 'production', 'invalid']) {
  test(`Node loads the Nova app config for ${profile ?? 'unset'} profile`, () => {
    const env = { ...process.env };
    delete env.VITE_NOVA_NATIVE_PROFILE;
    if (profile !== undefined) env.VITE_NOVA_NATIVE_PROFILE = profile;
    const result = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `
          import assert from 'node:assert/strict';
          import config from './start-bridge.config.ts';
          assert.deepEqual(config.mounts.rootHosts,
            ['nova.tuturuuu.com', 'nova.ai.vn', 'nova.tutur3u.com']);
          assert.deepEqual(config.mounts.mountHosts,
            process.env.VITE_NOVA_NATIVE_PROFILE === 'production'
              ? ['tuturuuu.com'] : []);
          assert.equal(config.mounts.basePath, '/nova');
          assert.equal(config.mounts.unknownHost, 'reject');
        `,
      ],
      {
        cwd: new URL('../../apps/nova/', import.meta.url),
        env,
        encoding: 'utf8',
        timeout: 30_000,
      }
    );
    assert.ifError(result.error);
    if (profile === 'invalid') {
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /Expected nova native profile/);
    } else {
      assert.equal(result.status, 0, result.stderr || result.stdout);
    }
  });
}
