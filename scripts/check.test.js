const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  acquireCheckQueueLock,
  forceClearCheckQueue,
  getCheckQueuePaths,
  listTrackedCheckProcesses,
} = require('./check.js');

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

test('listTrackedCheckProcesses returns active owner and queued tickets once', () => {
  const rootDir = createTempDir();
  const queueRoot = createTempDir();
  const paths = getCheckQueuePaths(rootDir, { queueRoot });
  const sharedPid = process.pid;

  fs.mkdirSync(paths.ticketsDir, { recursive: true });
  fs.writeFileSync(
    path.join(paths.ticketsDir, '0000000000001-00000001-alpha.json'),
    JSON.stringify(
      {
        createdAt: 1,
        pid: sharedPid,
        ticketId: 'alpha',
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
        pid: sharedPid,
        ticketId: 'owner-ticket',
      },
      null,
      2
    )
  );

  const trackedProcesses = listTrackedCheckProcesses(paths, {
    isPidActive: (pid) => pid === sharedPid,
  });

  assert.deepEqual(trackedProcesses, [
    {
      pid: sharedPid,
      source: 'ticket',
      ticketId: 'alpha',
    },
  ]);
});

test('forceClearCheckQueue terminates tracked checks before reacquiring the queue', async () => {
  const rootDir = createTempDir();
  const queueRoot = createTempDir();
  const paths = getCheckQueuePaths(rootDir, { queueRoot });
  const activePids = new Set([41001, 41002]);
  const killCalls = [];
  const queueMessages = [];

  fs.mkdirSync(paths.ticketsDir, { recursive: true });
  fs.writeFileSync(
    path.join(paths.ticketsDir, '0000000000002-00041002-bravo.json'),
    JSON.stringify(
      {
        createdAt: 2,
        pid: 41002,
        ticketId: 'bravo',
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
        createdAt: 1,
        pid: 41001,
        ticketId: 'owner',
      },
      null,
      2
    )
  );

  await forceClearCheckQueue({
    isPidActive: (pid) => activePids.has(pid),
    killImpl: (pid, signal) => {
      killCalls.push([pid, signal]);
      activePids.delete(pid);
    },
    pid: process.pid,
    queueRoot,
    rootDir,
    sleepImpl: async () => {},
    stdoutWriter: (line) => queueMessages.push(line),
  });

  assert.deepEqual(killCalls, [
    [41001, 'SIGTERM'],
    [41002, 'SIGTERM'],
  ]);
  assert.ok(
    queueMessages.some((line) =>
      line.includes('Force stopping 2 earlier bun check invocations')
    )
  );
  assert.equal(fs.existsSync(paths.lockDir), false);
});

test('acquireCheckQueueLock forceNow clears earlier checks before taking the lock', async () => {
  const rootDir = createTempDir();
  const queueRoot = createTempDir();
  const paths = getCheckQueuePaths(rootDir, { queueRoot });
  const activePids = new Set([51001]);
  const killCalls = [];

  fs.mkdirSync(paths.lockDir, { recursive: true });
  fs.writeFileSync(
    paths.lockMetaPath,
    JSON.stringify(
      {
        createdAt: 1,
        pid: 51001,
        ticketId: 'owner',
      },
      null,
      2
    )
  );

  const handle = await acquireCheckQueueLock({
    forceNow: true,
    isPidActive: (pid) => activePids.has(pid) || pid === process.pid,
    killImpl: (pid, signal) => {
      killCalls.push([pid, signal]);
      activePids.delete(pid);
    },
    pid: process.pid,
    pollMs: 10,
    queueRoot,
    rootDir,
    sleepImpl: async () => {},
    stdoutWriter: () => {},
  });

  assert.deepEqual(killCalls, [[51001, 'SIGTERM']]);

  handle.release();

  assert.equal(fs.existsSync(paths.lockDir), false);
});
