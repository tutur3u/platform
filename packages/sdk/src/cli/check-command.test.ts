import assert from 'node:assert/strict';
import { test } from 'vitest';
import { runCheckCommand } from './check-command.ts';

test('ttr check refuses an injected M4 hub hostname and does not run', async () => {
  let spawned = false;
  const code = await runCheckCommand(['--dry-run'], {
    hostname: 'Mac-Mini-M4.local',
    hostId: 'studio',
    spawn: () => {
      spawned = true;
      return { status: 0 };
    },
  });
  assert.equal(code, 2);
  assert.equal(spawned, false);
});

test('ttr check refuses host id m4 and does not run', async () => {
  let spawned = false;
  const code = await runCheckCommand([], {
    hostname: 'build-mac.local',
    hostId: 'm4',
    spawn: () => {
      spawned = true;
      return { status: 0 };
    },
  });
  assert.equal(code, 2);
  assert.equal(spawned, false);
});

test('ttr check runs check:changed with the two-worker caps on another host', async () => {
  const calls: { args: string[]; concurrency: string; vitest: string }[] = [];
  const code = await runCheckCommand(['--dry-run'], {
    hostname: 'MMP64L02.local',
    hostId: 'm1',
    env: { PATH: '/usr/bin' },
    spawn: (_command, args, options) => {
      calls.push({
        args,
        concurrency: options.env.TURBO_CONCURRENCY ?? '',
        vitest: options.env.VITEST_MAX_WORKERS ?? '',
      });
      return { status: 0 };
    },
  });
  assert.equal(code, 0);
  assert.deepEqual(calls, [
    {
      args: ['check:changed', '--dry-run'],
      concurrency: '2',
      vitest: '2',
    },
  ]);
});
