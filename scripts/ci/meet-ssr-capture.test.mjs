import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import { createMeetSsrCollector } from './meet-ssr-capture.mjs';
import { observeOwnedChild } from './native-wrangler-observable.mjs';

const source = 'a'.repeat(40);
const closed = {
  closeObserved: true,
  stdioDrained: true,
  intervened: false,
  signal: null,
  code: 1,
};
const marker = 'meet-ssr-diagnostic ';
const record = {
  version: 1,
  phase: 'loader-model',
  outcome: 'threw',
  kind: 'router-redirect',
  name: 'UNKNOWN',
  code: 'UNKNOWN',
  inspection: 'available',
  frames: [],
};
function send(collector, value, stream = 'stderr') {
  collector.forward(stream, Buffer.from(`${marker}${JSON.stringify(value)}\n`));
}

test('actual owned child pipes must naturally close and drain before private projection', async () => {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.killed = false;
  const output = [],
    collector = createMeetSsrCollector((...args) => output.push(args));
  let settled = false;
  const observed = observeOwnedChild(child, collector.forward).then(
    (outcome) => {
      settled = true;
      return collector.finish(outcome, source);
    }
  );
  child.stderr.write(`${marker}${JSON.stringify(record)}\n`);
  child.emit('exit', 1, null);
  await Promise.resolve();
  assert.equal(settled, false);
  child.stdout.end();
  child.stderr.end();
  await Promise.all([
    new Promise((r) => child.stdout.once('end', r)),
    new Promise((r) => child.stderr.once('end', r)),
  ]);
  child.emit('close', 1, null);
  const packet = await observed;
  assert.equal(packet.availability, 'CAPTURED');
  assert.equal(packet.closure, 'NATURAL_CLOSE_DRAINED');
  assert.deepEqual(packet.records, [record]);
  assert.deepEqual(packet.phases, {
    'loader-import': 'UNKNOWN',
    'loader-model': 'CAPTURED',
    handler: 'UNKNOWN',
    'render-boundary': 'UNKNOWN',
  });
  assert.deepEqual(output, []);
});

test('chunked prefixed markers and EOF record are sanitized; ordinary output still forwards', () => {
  const output = [],
    collector = createMeetSsrCollector((stream, bytes) =>
      output.push([stream, bytes])
    );
  const text = `ordinary\n# ${marker}${JSON.stringify(record)}`;
  for (const byte of Buffer.from(text))
    collector.forward('stdout', Buffer.from([byte]));
  const packet = collector.finish(closed, source);
  assert.deepEqual(packet.records, [record]);
  assert.deepEqual(output, [['stdout', 'ordinary\n']]);
  assert.throws(() => collector.finish(closed, source), /already finalized/);
});

test('missing markers and incomplete closure remain UNKNOWN, never diagnostic PASS', () => {
  for (const outcome of [
    closed,
    { ...closed, stdioDrained: false },
    { ...closed, intervened: true },
    { ...closed, signal: 'SIGTERM' },
    { ...closed, closeObserved: false },
  ]) {
    const collector = createMeetSsrCollector(() => {});
    if (outcome !== closed) send(collector, record);
    const packet = collector.finish(outcome, source);
    assert.equal(packet.availability, 'UNKNOWN');
    assert.deepEqual(packet.records, []);
  }
});

test('malicious fields, enums, raw stacks, frame paths and oversized candidates never persist or forward', () => {
  const output = [],
    collector = createMeetSsrCollector((...value) => output.push(value));
  const invalid = [
    { ...record, message: 'SECRET' },
    { ...record, cause: { token: 'SECRET' } },
    { ...record, stack: 'SECRET' },
    { ...record, phase: 'SECRET' },
    { ...record, kind: 'SECRET' },
    { ...record, outcome: 'SECRET' },
    { ...record, name: 'SECRET' },
    { ...record, code: 'SECRET' },
    { ...record, frames: [{ function: 'SECRET', line: 1, column: 1 }] },
    {
      ...record,
      frames: [
        { function: 'loadPageModel', line: 1, column: 1, file: 'SECRET' },
      ],
    },
    {
      ...record,
      frames: [{ function: 'loadPageModel', line: 1000001, column: 1 }],
    },
    {
      ...record,
      frames: Array(5).fill({ function: 'loadPageModel', line: 1, column: 1 }),
    },
  ];
  for (const value of invalid) send(collector, value);
  collector.forward(
    'stderr',
    Buffer.from(`${marker}${'SECRET'.repeat(1000)}\n`)
  );
  collector.forward('stderr', Buffer.from(`${marker}invalidJSON SECRET\n`));
  const packet = collector.finish(closed, source);
  assert.equal(packet.availability, 'UNKNOWN');
  assert.equal(packet.dropped, invalid.length + 2);
  assert.deepEqual(output, []);
  assert.doesNotMatch(JSON.stringify(packet), /SECRET/);
});

test('bounded candidates and explicit worker overflow remain truthful', () => {
  const collector = createMeetSsrCollector(() => {});
  for (let i = 0; i < 70; i++) send(collector, record);
  const packet = collector.finish(closed, source);
  assert.equal(packet.records.length, 64);
  assert.equal(packet.dropped, 6);
  const overflow = createMeetSsrCollector(() => {});
  send(overflow, { version: 1, overflow: true });
  assert.equal(overflow.finish(closed, source).dropped, 1);
});

test('real caller wiring keeps distinct loader phases, handler outcome and post-drain private evidence', async () => {
  const loader = await readFile(
    new URL('../../apps/meet/src/runtime/page-loader.ts', import.meta.url),
    'utf8'
  );
  assert.match(loader, /observeMeetSsr\(\s*'loader-import'/);
  assert.match(loader, /observeMeetSsr\(\s*'loader-model'/);
  const handler = await readFile(
    new URL('../../apps/meet/src/runtime/handler.ts', import.meta.url),
    'utf8'
  );
  assert.match(handler, /observeMeetSsr\('handler'/);
  const launcher = await readFile(
    new URL('./meet-native-launcher.mjs', import.meta.url),
    'utf8'
  );
  assert.ok(
    launcher.indexOf('collector.finish(outcome, sourceSHA)') >
      launcher.indexOf('await observeOwnedChild(')
  );
  assert.match(launcher, /collector\.forward/);
  assert.match(launcher, /round,\s*outcome,\s*receipt,\s*ssr,/);
});
