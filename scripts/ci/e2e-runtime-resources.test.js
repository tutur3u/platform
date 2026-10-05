const assert = require('node:assert/strict');
const test = require('node:test');
const { mkdtemp, writeFile, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const {
  MAX_PROC_BYTES,
  readBoundedProc,
  RESOURCE_FILES,
  parseResourceSnapshot,
  createResourceSampler,
} = require('./e2e-runtime-resources');
const texts = [
  'MemAvailable: 123 kB\nSwapFree: 456 kB\nPrivate: sensitive-value',
  'pgmajfault 10\npswpin 20\npswpout 30\nprivate-key secret',
  'some avg10=1.00 avg60=2.00 avg300=3.00 total=40\n',
  'some avg10=0.00 total=50\nfull avg10=0.00 total=60\n',
  'some avg10=0.00 total=70\nfull avg10=0.00 total=80\n',
];

test('parses only fixed numeric memory, swap, pressure and RSS fields', () => {
  const result = parseResourceSnapshot(texts, 90);
  assert.deepEqual(result, {
    memAvailableKiB: 123,
    swapFreeKiB: 456,
    majorFaults: 10,
    swapPagesIn: 20,
    swapPagesOut: 30,
    cpuPressureSomeUs: 40,
    memoryPressureSomeUs: 50,
    memoryPressureFullUs: 60,
    ioPressureSomeUs: 70,
    ioPressureFullUs: 80,
    rssBytes: 90,
  });
  assert.ok(Object.values(result).every(Number.isFinite));
  assert.ok(!JSON.stringify(result).includes('secret'));
  assert.throws(() =>
    parseResourceSnapshot(['x'.repeat(32769), ...texts.slice(1)], 90)
  );
  assert.throws(() =>
    parseResourceSnapshot(['MemAvailable: private', ...texts.slice(1)], 90)
  );
  assert.throws(() => parseResourceSnapshot(texts, -1));
});

test('samples fixed files with a bounded signal and does not overlap', async () => {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const calls = [];
  const logs = [];
  const sampler = createResourceSampler({
    read: async (file, options) => {
      calls.push(file);
      assert.equal(options.encoding, 'utf8');
      assert.ok(options.signal instanceof AbortSignal);
      await gate;
      return texts[RESOURCE_FILES.indexOf(file)];
    },
    rss: () => 90,
    publish: (value) => logs.push(value),
  });
  const pending = sampler.sample();
  await sampler.sample();
  assert.deepEqual(calls, RESOURCE_FILES);
  release();
  await pending;
  assert.equal(logs.length, 1);
  sampler.stop();
  await sampler.sample();
  assert.equal(calls.length, 5);
});

test('stopping suppresses late reads and errors expose no private values', async () => {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const sampler = createResourceSampler({
    read: async (file) => {
      await gate;
      return texts[RESOURCE_FILES.indexOf(file)];
    },
    publish: () => assert.fail('late publication'),
  });
  // Every fixed read is held; stop before any of them can finish.
  const pending = sampler.sample();
  sampler.stop();
  release();
  await pending;
  // A rejecting read must publish only fixed unavailable data.
  const logs = [];
  const failing = createResourceSampler({
    read: async () => {
      throw new Error('private-error-value');
    },
    publish: (value) => logs.push(value),
  });
  await failing.sample();
  assert.deepEqual(logs, [{ unavailable: 1 }]);
  failing.stop();
});

test('one failed read does not release overlap protection before its peers settle', async () => {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let calls = 0;
  const logs = [];
  const sampler = createResourceSampler({
    read: async (file) => {
      calls++;
      if (file === RESOURCE_FILES[0]) throw new Error('private-error');
      await gate;
      return texts[RESOURCE_FILES.indexOf(file)];
    },
    publish: (value) => logs.push(value),
  });
  const pending = sampler.sample();
  await Promise.resolve();
  await sampler.sample();
  assert.equal(calls, 5);
  assert.deepEqual(logs, []);
  release();
  await pending;
  assert.deepEqual(logs, [{ unavailable: 1 }]);
  sampler.stop();
});

test('proc reader caps allocation and rejects oversized or aborted reads', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'e2e-resource-test-'));
  const path = join(dir, 'fixture');
  try {
    await writeFile(path, 'safe');
    assert.equal(await readBoundedProc(path), 'safe');
    await writeFile(path, 'x'.repeat(MAX_PROC_BYTES + 1));
    await assert.rejects(readBoundedProc(path), /Unavailable resource field/);
    await assert.rejects(
      readBoundedProc(path, { signal: AbortSignal.abort() })
    );
    await writeFile(path, 'safe-again');
    assert.equal(await readBoundedProc(path), 'safe-again');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
