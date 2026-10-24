const assert = require('node:assert/strict');
const cp = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { acquirePackLock } = require('./sdk-dev-pack-lock');
const { runProcess } = require('./sdk-package-process');
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk-pack-process-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
async function until(check) {
  const deadline = Date.now() + 5000;
  while (!check()) {
    if (Date.now() > deadline) throw new Error('fixture event did not arrive');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
test('failed onSpawn publication never executes the gated command', async (t) => {
  const root = fixture(t),
    marker = path.join(root, 'launched');
  await assert.rejects(
    runProcess(
      process.execPath,
      [
        '-e',
        `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'unsafe')`,
      ],
      {
        onSpawn: () => {
          throw new Error('disk publication failed');
        },
        timeoutMs: 2000,
      }
    ),
    { code: 'PROCESS_SPAWN_PUBLICATION_FAILED' }
  );
  assert.equal(fs.existsSync(marker), false);
});
test('SIGKILL leader cannot release a live detached builder; takeover succeeds only after group drain', async (t) => {
  const root = fixture(t),
    file = path.join(root, '.dev-pack.lock'),
    marker = path.join(root, 'builder');
  const lockHelper = require.resolve('./sdk-dev-pack-lock');
  const processHelper = require.resolve('./sdk-package-process');
  const builder = `require('node:fs').writeFileSync(${JSON.stringify(marker)}, String(process.pid));setInterval(()=>{},1000);`;
  const code = `const release = require(${JSON.stringify(lockHelper)}).acquirePackLock(${JSON.stringify(file)});
    require(${JSON.stringify(processHelper)}).runProcess(process.execPath, ['-e', ${JSON.stringify(builder)}],
      {onSpawn: pid => release.track(pid), timeoutMs: 10000}).then(()=>release());`;
  const leader = cp.spawn(process.execPath, ['-e', code], {
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  const exited = new Promise((resolve) => leader.once('exit', resolve));
  let group;
  t.after(() => {
    leader.kill('SIGKILL');
    if (group) {
      try {
        process.kill(-group, 'SIGKILL');
      } catch {}
    }
  });
  await until(() => fs.existsSync(marker));
  group = Number(fs.readFileSync(marker, 'utf8'));
  const owner = JSON.parse(fs.readFileSync(file));
  assert.deepEqual(owner.groups, [group]);
  leader.kill('SIGKILL');
  await exited;
  assert.throws(() => acquirePackLock(file), /DEV_PACK_BUSY/);
  assert.equal(JSON.parse(fs.readFileSync(file)).nonce, owner.nonce);
  process.kill(-group, 'SIGTERM');
  await until(() => {
    try {
      process.kill(-group, 0);
      return false;
    } catch (error) {
      return error.code === 'ESRCH';
    }
  });
  const release = acquirePackLock(file);
  assert.notEqual(JSON.parse(fs.readFileSync(file)).nonce, owner.nonce);
  release();
  assert.equal(fs.existsSync(file), false);
});
test('group is durably recorded before the command crosses its gate', async (t) => {
  const root = fixture(t),
    file = path.join(root, '.dev-pack.lock'),
    marker = path.join(root, 'gate');
  const release = acquirePackLock(file);
  let group;
  const completed = await runProcess(
    process.execPath,
    [
      '-e',
      `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'started')`,
    ],
    {
      onSpawn: async (pid) => {
        group = pid;
        release.track(pid);
        await new Promise((resolve) => setTimeout(resolve, 30));
        assert.deepEqual(JSON.parse(fs.readFileSync(file)).groups, [pid]);
        assert.equal(fs.existsSync(marker), false);
      },
      timeoutMs: 2000,
    }
  );
  assert.equal(completed.status, 0);
  assert.equal(fs.readFileSync(marker, 'utf8'), 'started');
  release.drained(group);
  release();
});

test('leader death before ownership publication closes gate without launching work', async (t) => {
  const root = fixture(t),
    ready = path.join(root, 'ready'),
    marker = path.join(root, 'unsafe');
  const helper = require.resolve('./sdk-package-process');
  const builder = `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'unsafe');`;
  const code = `require(${JSON.stringify(helper)}).runProcess(process.execPath, ['-e', ${JSON.stringify(builder)}],
    {onSpawn: async pid => { require('node:fs').writeFileSync(${JSON.stringify(ready)}, String(pid)); await new Promise(()=>{}); }, timeoutMs: 10000});`;
  const leader = cp.spawn(process.execPath, ['-e', code], {
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  const exited = new Promise((resolve) => leader.once('exit', resolve));
  let group;
  t.after(() => {
    leader.kill('SIGKILL');
    if (group) {
      try {
        process.kill(-group, 'SIGKILL');
      } catch {}
    }
  });
  await until(() => fs.existsSync(ready));
  group = Number(fs.readFileSync(ready, 'utf8'));
  leader.kill('SIGKILL');
  await exited;
  await until(() => {
    try {
      process.kill(-group, 0);
      return false;
    } catch (error) {
      return error.code === 'ESRCH';
    }
  });
  assert.equal(fs.existsSync(marker), false);
});
