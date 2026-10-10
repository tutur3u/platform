import assert from 'node:assert/strict';
import { test } from 'node:test';
import { coordinationBody } from './request-body.ts';

function fixture(read, cancel = () => Promise.resolve()) {
  const counts = { reads: 0, cancels: 0 };
  const request = {
    body: {
      getReader: () => ({
        read: () => {
          counts.reads++;
          return read(counts.reads);
        },
        cancel: () => {
          counts.cancels++;
          return cancel();
        },
      }),
    },
  };
  return { request, counts };
}
const bytes = (value) => new TextEncoder().encode(value);

test('accepts exact byte limit and cancels once after completion', async () => {
  const f = fixture((n) =>
    Promise.resolve(
      n === 1
        ? { done: false, value: bytes(JSON.stringify('x'.repeat(2046))) }
        : { done: true }
    )
  );
  assert.equal((await coordinationBody(f.request)).length, 2046);
  assert.deepEqual(f.counts, { reads: 2, cancels: 1 });
});

test('rejects excess bytes without reading another chunk', async () => {
  const f = fixture(() =>
    Promise.resolve({ done: false, value: new Uint8Array(2049) })
  );
  await assert.rejects(coordinationBody(f.request), /Body too large/);
  assert.deepEqual(f.counts, { reads: 1, cancels: 1 });
});

test('empty-chunk no-progress streams have a finite read budget across restarts', async () => {
  for (let restart = 0; restart < 24; restart++) {
    const f = fixture(() =>
      Promise.resolve({ done: false, value: new Uint8Array(0) })
    );
    await assert.rejects(coordinationBody(f.request), /Too many body reads/);
    assert.deepEqual(f.counts, { reads: 256, cancels: 1 });
  }
});

test('pending read stops exactly at deadline despite stalled cancellation', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 10000 });
  const f = fixture(
    () => new Promise(() => {}),
    () => new Promise(() => {})
  );
  const result = coordinationBody(f.request);
  let settled = false;
  const assertion = assert
    .rejects(result, /Body deadline exceeded/)
    .then(() => {
      settled = true;
    });
  t.mock.timers.tick(4999);
  await Promise.resolve();
  assert.equal(settled, false);
  t.mock.timers.tick(1);
  await assertion;
  assert.deepEqual(f.counts, { reads: 1, cancels: 1 });
});

test('a chunk arriving at the deadline cannot complete the request', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 10000 });
  const f = fixture(() => {
    t.mock.timers.tick(5000);
    return Promise.resolve({ done: false, value: bytes('{}') });
  });
  await assert.rejects(coordinationBody(f.request), /Body deadline exceeded/);
  assert.deepEqual(f.counts, { reads: 1, cancels: 1 });
});

test('parse/read errors and rejected cancellation preserve the original failure', async () => {
  for (const read of [
    (n) =>
      Promise.resolve(
        n === 1 ? { done: false, value: bytes('{') } : { done: true }
      ),
    () => Promise.reject(new Error('source failed')),
  ]) {
    const f = fixture(read, () => Promise.reject(new Error('cancel failed')));
    await assert.rejects(coordinationBody(f.request));
    assert.equal(f.counts.cancels, 1);
    assert.ok(f.counts.reads <= 2);
  }
});
