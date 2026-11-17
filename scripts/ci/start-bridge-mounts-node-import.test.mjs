import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('Node imports the public mounts export and preserves host resolution', () => {
  const result = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
        import assert from 'node:assert/strict';
        import { resolveAppBase } from '@tuturuuu/start-bridge/mounts';
        const config = {
          app: 'hive',
          rootHosts: ['hive.tuturuuu.com'],
          mountHosts: ['tuturuuu.com'],
          basePath: '/hive/',
          unknownHost: 'reject',
        };
        assert.deepEqual(resolveAppBase(new URL('https://hive.tuturuuu.com/en'), config),
          { mode: 'root', basePath: '' });
        assert.deepEqual(resolveAppBase(new URL('https://tuturuuu.com/hive/en'), config),
          { mode: 'mounted', basePath: '/hive' });
        assert.equal(resolveAppBase(new URL('https://tuturuuu.com/hive-other'), config), null);
        assert.equal(resolveAppBase(new URL('https://unlisted.example/hive'), config), null);
      `,
    ],
    {
      cwd: new URL('../../packages/start-bridge/', import.meta.url),
      encoding: 'utf8',
      timeout: 30_000,
    }
  );
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
