const assert = require('node:assert/strict');
const test = require('node:test');
const { signalOwnedProcess } = require('./e2e-owned-process-group');
test('signals only the created process group including launcher descendants', () => {
  const signals = [];
  signalOwnedProcess(
    { processGroup: true, child: { pid: 123 } },
    'SIGTERM',
    (...args) => signals.push(args)
  );
  assert.deepEqual(signals, [[-123, 'SIGTERM']]);
});
test('already gone groups are harmless; permission errors stay visible; ungrouped children retain behavior', () => {
  signalOwnedProcess(
    { processGroup: true, child: { pid: 123 } },
    'SIGKILL',
    () => {
      throw Object.assign(new Error(), { code: 'ESRCH' });
    }
  );
  assert.throws(
    () =>
      signalOwnedProcess(
        { processGroup: true, child: { pid: 123 } },
        'SIGKILL',
        () => {
          throw Object.assign(new Error(), { code: 'EPERM' });
        }
      ),
    { code: 'EPERM' }
  );
  const signals = [];
  signalOwnedProcess({ child: { kill: (s) => signals.push(s) } }, 'SIGTERM');
  assert.deepEqual(signals, ['SIGTERM']);
});

test('created group cleanup closes a surviving descendant pipe after its launcher exits', {
  skip: process.platform === 'win32',
}, async (t) => {
  const { spawn } = require('node:child_process');
  const { once } = require('node:events');
  const child = spawn(
    process.execPath,
    [
      '-e',
      `
    const {spawn}=require('node:child_process');
    const descendant=spawn(process.execPath,['-e',"process.on('SIGTERM',()=>{});process.stdout.write('ready');setInterval(()=>{},1000)"],{stdio:['ignore','inherit','inherit']});
    process.on('SIGTERM',()=>process.exit(0));
    setInterval(()=>{},1000);
  `,
    ],
    { detached: true, stdio: ['ignore', 'pipe', 'pipe'] }
  );
  const runtime = { processGroup: true, child };
  t.after(() => signalOwnedProcess(runtime, 'SIGKILL'));
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error('owned descendant cleanup deadline')),
      5000
    );
  });
  try {
    await Promise.race([once(child.stdout, 'data'), deadline]);
    const exit = once(child, 'exit');
    const closed = once(child.stdout, 'close');
    signalOwnedProcess(runtime, 'SIGTERM');
    await Promise.race([exit, deadline]);
    signalOwnedProcess(runtime, 'SIGKILL');
    await Promise.race([closed, deadline]);
  } finally {
    clearTimeout(timer);
  }
});

test('owned exit wait clears its timer and reports non-exiting children', async () => {
  const { waitForOwnedExit } = require('./e2e-owned-process-group');
  assert.equal(
    await waitForOwnedExit({ exitPromise: Promise.resolve() }, 1000),
    true
  );
  assert.equal(
    await waitForOwnedExit({ exitPromise: new Promise(() => {}) }, 5),
    false
  );
});
