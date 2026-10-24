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

test('drain rethrows non-EPERM probe failures unchanged', async () => {
  const unexpected = Object.assign(new Error('bad probe'), { code: 'EIO' });
  await assert.rejects(
    drainGroup(
      12345,
      () => {
        throw unexpected;
      },
      25
    ),
    (error) => error === unexpected
  );
});

test('drain timeout retains the last EPERM as its cause', async () => {
  let last;
  await assert.rejects(
    drainGroup(
      12345,
      () => {
        last = Object.assign(new Error('still exiting'), { code: 'EPERM' });
        throw last;
      },
      25
    ),
    (error) =>
      error instanceof Error &&
      'code' in error &&
      error.code === 'PROCESS_GROUP_UNDRAINED' &&
      error.cause === last
  );
});

test('only the post-close SIGKILL tolerates EPERM, then proves ESRCH', async (t) => {
  const kill = process.kill.bind(process);
  let group = 0;
  let injected = false;
  t.mock.method(process, 'kill', (pid, signal) => {
    if (pid < 0 && signal === 'SIGKILL' && !injected) {
      group = -pid;
      injected = true;
      throw Object.assign(new Error('exiting group'), { code: 'EPERM' });
    }
    return kill(pid, signal);
  });
  const result = await runProcess(process.execPath, ['-e', 'process.exit(0)'], {
    env: {},
    timeoutMs: 3000,
  });
  assert.equal(result.status, 0);
  assert.equal(injected, true);
  assert.throws(() => kill(-group, 0), { code: 'ESRCH' });
});

test('post-close SIGKILL still rejects other signal failures', async (t) => {
  const kill = process.kill.bind(process);
  t.mock.method(process, 'kill', (pid, signal) => {
    if (pid < 0 && signal === 'SIGKILL')
      throw Object.assign(new Error('unexpected signal failure'), {
        code: 'EIO',
      });
    return kill(pid, signal);
  });
  await assert.rejects(
    runProcess(process.execPath, ['-e', 'process.exit(0)'], {
      env: {},
      timeoutMs: 3000,
    }),
    { code: 'PROCESS_SIGNAL_FAILED' }
  );
});

test('termination EPERM is still a signal failure', async (t) => {
  const kill = process.kill.bind(process);
  t.mock.method(process, 'kill', (pid, signal) => {
    if (pid < 0 && signal === 'SIGTERM')
      throw Object.assign(new Error('not the post-close kill'), {
        code: 'EPERM',
      });
    return kill(pid, signal);
  });
  await assert.rejects(
    runProcess(process.execPath, ['-e', 'setInterval(()=>{},1000)'], {
      env: {},
      timeoutMs: 50,
    }),
    { code: 'PROCESS_SIGNAL_FAILED' }
  );
});

test('non-Error probe failures are rethrown unchanged', async () => {
  await assert.rejects(
    drainGroup(
      12345,
      () => {
        throw null;
      },
      25
    ),
    (error) => error === null
  );
});
