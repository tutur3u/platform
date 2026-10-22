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
  scope: 'UNKNOWN',
  stage: 'UNKNOWN',
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
  assert.deepEqual(collectedBytes(output, 'stdout'), Buffer.from('ordinary\n'));
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
  assert.match(handler, /observeMeetSsr\(\s*'handler'/);
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

function collectedBytes(output, stream = 'stderr') {
  return Buffer.concat(
    output
      .filter(([name]) => name === stream)
      .map(([, bytes]) => (Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes)))
  );
}
test('R9 ordinary long bytes and embedded valid marker suffix are never capped or captured', () => {
  const output = [],
    collector = createMeetSsrCollector((...args) => output.push(args));
  const ordinary = Buffer.concat([
    Buffer.from(`ordinary ${'x'.repeat(9000)}`),
    Buffer.from([0xff, 0xfe]),
    Buffer.from(` ${marker}${JSON.stringify(record)}\n`),
  ]);
  for (let i = 0; i < ordinary.length; i += 17)
    collector.forward('stderr', ordinary.subarray(i, i + 17));
  const packet = collector.finish(closed, source);
  assert.deepEqual(collectedBytes(output), ordinary);
  assert.equal(packet.availability, 'UNKNOWN');
  assert.equal(packet.dropped, 0);
  const embeddedOutput = [],
    embedded = createMeetSsrCollector((...args) => embeddedOutput.push(args));
  const short = Buffer.from(
    `primary contains ${marker}${JSON.stringify(record)}\n`
  );
  embedded.forward('stderr', short);
  assert.equal(embedded.finish(closed, source).availability, 'UNKNOWN');
  assert.deepEqual(collectedBytes(embeddedOutput), short);
});
test('R9 incomplete natural closure still flushes ordinary EOF exactly and keeps capture UNKNOWN', () => {
  for (const outcome of [
    { ...closed, signal: 'SIGTERM' },
    { ...closed, stdioDrained: false },
    { ...closed, closeObserved: false },
  ]) {
    const output = [],
      collector = createMeetSsrCollector((...args) => output.push(args));
    send(collector, record);
    const tail = Buffer.from('meet-ssr-');
    collector.forward('stderr', tail);
    const packet = collector.finish(outcome, source);
    assert.deepEqual(collectedBytes(output), tail);
    assert.equal(packet.availability, 'UNKNOWN');
    assert.deepEqual(packet.records, []);
  }
});
test('R9 recognized prefix chunk boundaries suppress payloads while other prefix lookalikes remain ordinary', () => {
  for (const prefix of [marker, `# ${marker}`]) {
    for (let split = 0; split <= prefix.length; split++) {
      const output = [],
        collector = createMeetSsrCollector((...args) => output.push(args));
      const line = Buffer.from(`${prefix}${JSON.stringify(record)}\n`);
      collector.forward('stderr', line.subarray(0, split));
      collector.forward('stderr', line.subarray(split));
      assert.deepEqual(collector.finish(closed, source).records, [record]);
      assert.equal(collectedBytes(output).length, 0);
    }
  }
  for (const text of [
    ` # ${marker}${JSON.stringify(record)}\n`,
    `prefix# ${marker}${JSON.stringify(record)}\n`,
    'meet-ssr-',
    '# meet-ssr-',
  ]) {
    const output = [],
      collector = createMeetSsrCollector((...args) => output.push(args));
    collector.forward('stderr', Buffer.from(text));
    assert.equal(collector.finish(closed, source).availability, 'UNKNOWN');
    assert.deepEqual(collectedBytes(output), Buffer.from(text));
  }
});

test('R9 exhausted diagnostic candidate cap never caps subsequent ordinary bytes', () => {
  const output = [],
    collector = createMeetSsrCollector((...args) => output.push(args));
  for (let i = 0; i < 70; i++) send(collector, record);
  const ordinary = Buffer.from(`primary ${'x'.repeat(10000)}`);
  collector.forward('stdout', ordinary);
  const packet = collector.finish(closed, source);
  assert.equal(packet.records.length, 64);
  assert.equal(packet.dropped, 6);
  assert.deepEqual(collectedBytes(output, 'stdout'), ordinary);
});

const sdkErrorPrefix =
  '\x1b[31m✘ \x1b[41;31m[\x1b[41;97mERROR\x1b[41;31m]\x1b[0m \x1b[1m';
const sdkErrorSuffix = '\x1b[0m';
// Closed projections of all 23 actual50a records; no timestamp or raw SDK data.
const actual50a = [
  ['loader-import', 'returnedother', 'other', 'UNKNOWN', 'available'],
  ['loader-model', 'returnedother', 'other', 'UNKNOWN', 'available'],
  ['handler', 'returnedother', 'UNKNOWN', 'UNKNOWN', 'unavailable'],
  ['handler', 'returnedother', 'UNKNOWN', 'UNKNOWN', 'unavailable'],
  ['loader-import', 'returnedother', 'other', 'UNKNOWN', 'available'],
  ['loader-model', 'returnedother', 'other', 'UNKNOWN', 'available'],
  ['handler', 'returnedother', 'UNKNOWN', 'UNKNOWN', 'unavailable'],
  ['loader-import', 'returnedother', 'other', 'UNKNOWN', 'available'],
  ['loader-model', 'returnedother', 'other', 'UNKNOWN', 'available'],
  ['handler', 'returnedother', 'UNKNOWN', 'UNKNOWN', 'unavailable'],
  ['handler', 'returnedother', 'UNKNOWN', 'UNKNOWN', 'unavailable'],
  ['loader-import', 'returnedother', 'other', 'UNKNOWN', 'available'],
  ['loader-model', 'returnedother', 'other', 'UNKNOWN', 'available'],
  ['handler', 'returnedother', 'UNKNOWN', 'UNKNOWN', 'unavailable'],
  ['handler', 'threw', 'error', 'RangeError', 'unavailable'],
  ['handler', 'returnedredirect', 'UNKNOWN', 'UNKNOWN', 'unavailable'],
  ['handler', 'returnedredirect', 'UNKNOWN', 'UNKNOWN', 'unavailable'],
  ['handler', 'returnedother', 'UNKNOWN', 'UNKNOWN', 'unavailable'],
  ['handler', 'returnedother', 'UNKNOWN', 'UNKNOWN', 'unavailable'],
  ['handler', 'returnedother', 'UNKNOWN', 'UNKNOWN', 'unavailable'],
  ['handler', 'returnedother', 'UNKNOWN', 'UNKNOWN', 'unavailable'],
  ['handler', 'returnedother', 'UNKNOWN', 'UNKNOWN', 'unavailable'],
  ['handler', 'returnedother', 'UNKNOWN', 'UNKNOWN', 'unavailable'],
].map(([phase, outcome, kind, name, inspection]) => ({
  version: 1,
  phase,
  outcome,
  kind,
  name,
  code: 'UNKNOWN',
  inspection,
  frames: [],
}));
test('exact actual50a SDK ERROR envelope captures all 23 legacy closed records after close', () => {
  const output = [],
    collector = createMeetSsrCollector((...args) => output.push(args));
  for (const entry of actual50a) {
    const line = Buffer.from(
      `${sdkErrorPrefix}${marker}${JSON.stringify(entry)}${sdkErrorSuffix}\n`
    );
    for (let i = 0; i < line.length; i += 7)
      collector.forward('stderr', line.subarray(i, i + 7));
  }
  const packet = collector.finish(closed, source);
  assert.equal(packet.availability, 'CAPTURED');
  assert.equal(packet.records.length, 23);
  assert.equal(packet.dropped, 0);
  assert.deepEqual(
    packet.records.map(({ scope, stage, ...entry }) => entry),
    actual50a
  );
  assert.ok(
    packet.records.every(
      (entry) => entry.scope === 'UNKNOWN' && entry.stage === 'UNKNOWN'
    )
  );
  assert.equal(collectedBytes(output).length, 0);
});
test('foreign SDK envelope prefixes remain ordinary while recognized malformed/oversize records never leak', () => {
  const output = [],
    collector = createMeetSsrCollector((...args) => output.push(args));
  const ordinary = Buffer.from(
    `${sdkErrorPrefix.replace('ERROR', 'WARN')}${marker}${JSON.stringify(record)}${sdkErrorSuffix}\n`
  );
  collector.forward('stderr', ordinary);
  for (const payload of [
    '{invalid SECRET}',
    JSON.stringify({ ...record, message: 'SECRET' }),
    'SECRET'.repeat(1000),
  ]) {
    collector.forward(
      'stderr',
      Buffer.from(`${sdkErrorPrefix}${marker}${payload}${sdkErrorSuffix}\n`)
    );
  }
  collector.forward(
    'stderr',
    Buffer.from(`${sdkErrorPrefix}${marker}${JSON.stringify(record)}\x1b[1m\n`)
  );
  const packet = collector.finish(closed, source);
  assert.equal(packet.availability, 'UNKNOWN');
  assert.equal(packet.dropped, 4);
  assert.deepEqual(collectedBytes(output), ordinary);
  assert.doesNotMatch(JSON.stringify(packet), /SECRET/);
});

test('closed scope/stage schema rejects raw strings and false bindings, preserving valid handler facts', () => {
  const output = [],
    collector = createMeetSsrCollector((...args) => output.push(args));
  const invalid = [
    { ...record, scope: 'SECRET' },
    { ...record, stage: 'SECRET' },
    { ...record, scope: 'login' },
    { ...record, stage: 'start' },
    {
      ...record,
      phase: 'handler',
      scope: 'login',
      stage: 'start',
      outcome: 'delegating',
    },
  ];
  for (const entry of invalid) send(collector, entry);
  const valid = {
    ...record,
    phase: 'handler',
    scope: 'login',
    stage: 'start',
    kind: 'UNKNOWN',
    outcome: 'delegating',
  };
  send(collector, valid);
  const packet = collector.finish(closed, source);
  assert.deepEqual(packet.records, [valid]);
  assert.equal(packet.dropped, invalid.length);
  assert.equal(collectedBytes(output).length, 0);
  assert.doesNotMatch(JSON.stringify(packet), /SECRET/);
});
