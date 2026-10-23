const assert = require('node:assert/strict');
const test = require('node:test');
const { drainGroup, runProcess } = require('./sdk-package-process');

test('drain waits through a transient EPERM and still requires disappearance', async () => {
  let probes = 0;
  await drainGroup(
    12345,
    () => {
      if (++probes === 1)
        throw Object.assign(new Error('exiting group'), { code: 'EPERM' });
      return false;
    },
    100
  );
  assert.equal(probes, 2);
});

test('persistent permission errors never prove group drain', async () => {
  await assert.rejects(
    drainGroup(
      12345,
      () => {
        throw Object.assign(new Error('permission denied'), { code: 'EPERM' });
      },
      25
    ),
    { code: 'PROCESS_GROUP_UNDRAINED', undrainedGroup: 12345 }
  );
});

test('leader close tolerates a transient group probe error before ESRCH', async (t) => {
  const kill = process.kill.bind(process);
  let group;
  let injected = false;
  t.mock.method(process, 'kill', (pid, signal) => {
    if (pid < 0 && signal === 'SIGKILL') group = -pid;
    if (pid === -group && signal === 0 && !injected) {
      injected = true;
      throw Object.assign(new Error('exiting group'), { code: 'EPERM' });
    }
    return kill(pid, signal);
  });
  const completed = await runProcess(
    process.execPath,
    ['-e', 'process.exit(0)'],
    { env: {}, timeoutMs: 3000 }
  );
  assert.equal(completed.status, 0);
  assert.equal(injected, true);
  assert.throws(() => kill(-group, 0), { code: 'ESRCH' });
});
