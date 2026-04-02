const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { acquireCheckQueueLock, getCheckQueuePaths } = require('./check.js');

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'check-queue-'));
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

test('acquireCheckQueueLock serializes queued checks in order', async () => {
  const rootDir = createTempDir();
  const queueRoot = createTempDir();
  const queueMessages = [];
  const order = [];

  const first = await acquireCheckQueueLock({
    pollMs: 10,
    queueRoot,
    rootDir,
    stdoutWriter: (line) => queueMessages.push(line),
  });

  const secondPromise = acquireCheckQueueLock({
    pollMs: 10,
    queueRoot,
    rootDir,
    stdoutWriter: (line) => queueMessages.push(line),
  }).then((handle) => {
    order.push('second');
    return handle;
  });

  await sleep(20);

  const thirdPromise = acquireCheckQueueLock({
    pollMs: 10,
    queueRoot,
    rootDir,
    stdoutWriter: (line) => queueMessages.push(line),
  }).then((handle) => {
    order.push('third');
    return handle;
  });

  await sleep(40);
  assert.deepEqual(order, []);

  first.release();

  const second = await secondPromise;
  await sleep(40);
  assert.deepEqual(order, ['second']);

  let thirdResolved = false;
  thirdPromise.then(() => {
    thirdResolved = true;
  });

  await sleep(30);
  assert.equal(thirdResolved, false);

  second.release();

  const third = await thirdPromise;
  assert.deepEqual(order, ['second', 'third']);

  third.release();

  assert.ok(
    queueMessages.some((line) =>
      line.includes('Queued behind 1 earlier bun check invocation')
    )
  );
  assert.ok(
    queueMessages.some((line) =>
      line.includes('Queued behind 2 earlier bun check invocations')
    )
  );
});

test('acquireCheckQueueLock prunes stale tickets and stale locks', async () => {
  const rootDir = createTempDir();
  const queueRoot = createTempDir();
  const paths = getCheckQueuePaths(rootDir, { queueRoot });
  const staleTicketId = '0000000000000-99999999-deadbeef';
  const staleTicketPath = path.join(paths.ticketsDir, `${staleTicketId}.json`);

  fs.mkdirSync(paths.ticketsDir, { recursive: true });
  fs.writeFileSync(
    staleTicketPath,
    JSON.stringify(
      {
        createdAt: 0,
        pid: 999999,
        ticketId: staleTicketId,
      },
      null,
      2
    )
  );

  fs.mkdirSync(paths.lockDir, { recursive: true });
  fs.writeFileSync(
    paths.lockMetaPath,
    JSON.stringify(
      {
        createdAt: 0,
        pid: 999999,
        ticketId: 'stale-lock',
      },
      null,
      2
    )
  );

  const handle = await acquireCheckQueueLock({
    isPidActive: (pid) => pid === process.pid,
    pollMs: 10,
    queueRoot,
    rootDir,
    stdoutWriter: () => {},
  });

  const owner = JSON.parse(fs.readFileSync(paths.lockMetaPath, 'utf8'));
  assert.equal(owner.pid, process.pid);
  assert.equal(fs.existsSync(staleTicketPath), false);

  handle.release();

  assert.equal(fs.existsSync(paths.lockDir), false);
});
