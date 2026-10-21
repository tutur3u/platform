import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  CALENDAR_SSR_MARKER,
  projectCalendarSsrError,
} from '../../apps/calendar/src/runtime/ssr-diagnostics.ts';
import {
  beginCalendar500Discard,
  CALENDAR_RESPONSE_MARKER,
  createCalendar500Diagnostics,
  DRAIN_BYTE_LIMIT,
  DRAIN_READ_LIMIT,
  parseCalendarResponseRecord,
} from './calendar-response-diagnostics.mjs';
import {
  createCalendarSsrCollector,
  writeCalendarSsrPacket,
} from './calendar-ssr-capture.mjs';

const sentinel = 'PRIVATE_SENTINEL_COOKIE_TOKEN_BODY_ENV_URL';
const binding = {
  sourceSHA: 'a'.repeat(40),
  runId: '1234',
  attempt: '1',
  job: 'calendar-native',
};
const closed = {
  closeObserved: true,
  stdioDrained: true,
  intervened: false,
  code: 1,
  signal: null,
  error: undefined,
};

const turns = async () => {
  for (let index = 0; index < 32; index += 1) await Promise.resolve();
};
test('500 primary is registered and published synchronously before stream work', async () => {
  const primary = new assert.AssertionError({
    actual: 500,
    expected: 200,
    operator: 'strictEqual',
  });
  const lines = [];
  let registered;
  const response = new Response(sentinel, { status: 500 });
  const diagnostics = createCalendar500Diagnostics((line) => {
    assert.equal(registered, primary);
    lines.push(line);
  });
  assert.throws(
    () => {
      registered = primary;
      diagnostics.fail(primary, response, new AbortController().signal);
    },
    (error) => error === primary
  );
  const first = JSON.parse(lines[0].slice(CALENDAR_RESPONSE_MARKER.length));
  assert.equal(first.state, 'NOT_STARTED');
  assert.equal(first.reads, 0);
  await turns();
  diagnostics.afterDispose();
  const record = JSON.parse(lines[1].slice(CALENDAR_RESPONSE_MARKER.length));
  assert.equal(record.state, 'DRAINED');
  assert.equal(record.bytes, Buffer.byteLength(sentinel));
  assert.equal(record.cancel, 'not-needed');
  assert.equal(record.readPending, false);
  assert.ok(!JSON.stringify(lines).includes(sentinel));
  assert.deepEqual(parseCalendarResponseRecord(record), record);
  assert.equal(first.state, 'NOT_STARTED');
  assert.equal(first.reads, 0);
  assert.equal(first.underlyingCancellation, 'UNKNOWN');
});
test('byte/read caps cancel once and report oversize truthfully without blocking', async () => {
  let cancelled = 0;
  const body = new ReadableStream({
    pull(controller) {
      controller.enqueue(new Uint8Array(DRAIN_BYTE_LIMIT + 1));
    },
    async cancel() {
      await Promise.resolve();
      cancelled += 1;
    },
  });
  const ledger = beginCalendar500Discard(new Response(body, { status: 500 }));
  await turns();
  const record = ledger.snapshot();
  assert.equal(record.state, 'LIMIT');
  assert.equal(record.bytes, DRAIN_BYTE_LIMIT + 1);
  assert.equal(record.reads, 1);
  assert.equal(record.cancel, 'settled');
  assert.equal(record.underlyingCancellation, 'UNKNOWN');
  assert.equal(cancelled, 1);
  const empty = new ReadableStream({
    pull(controller) {
      controller.enqueue(new Uint8Array());
    },
  });
  const count = beginCalendar500Discard(new Response(empty, { status: 500 }));
  await turns();
  assert.equal(count.snapshot().reads, DRAIN_READ_LIMIT);
  assert.equal(count.snapshot().state, 'LIMIT');
});
test('actual stalled read never delays the original assertion; existing signal stops dispatch', async () => {
  const abort = new AbortController();
  const primary = new Error('original status assertion');
  const lines = [];
  let cancelled = 0;
  const response = new Response(
    new ReadableStream(
      {
        pull() {
          return new Promise(() => {});
        },
        cancel() {
          cancelled += 1;
        },
      },
      { highWaterMark: 0 }
    ),
    { status: 500 }
  );
  const diagnostics = createCalendar500Diagnostics((line) => lines.push(line));
  assert.throws(
    () => diagnostics.fail(primary, response, abort.signal),
    (error) => error === primary
  );
  diagnostics.afterDispose();
  const pending = JSON.parse(
    lines.at(-1).slice(CALENDAR_RESPONSE_MARKER.length)
  );
  assert.equal(pending.readPending, true);
  assert.equal(pending.state, 'READ_PENDING');
  abort.abort();
  await turns();
  diagnostics.afterDispose();
  const stopped = JSON.parse(
    lines.at(-1).slice(CALENDAR_RESPONSE_MARKER.length)
  );
  assert.equal(stopped.state, 'ABORTED');
  assert.equal(stopped.reads, 1);
  assert.equal(cancelled, 1);
});
test('actual stalled cancellation remains pending/UNKNOWN and late rejection is observed', async () => {
  const abort = new AbortController();
  let rejectCancel;
  const response = new Response(
    new ReadableStream(
      {
        pull() {
          return new Promise(() => {});
        },
        cancel() {
          return new Promise((_, reject) => {
            rejectCancel = reject;
          });
        },
      },
      { highWaterMark: 0 }
    ),
    { status: 500 }
  );
  const lines = [],
    diagnostics = createCalendar500Diagnostics((line) => lines.push(line));
  const primary = new Error('original assertion');
  assert.throws(
    () => diagnostics.fail(primary, response, abort.signal),
    (error) => error === primary
  );
  abort.abort();
  await turns();
  diagnostics.afterDispose();
  const pending = JSON.parse(
    lines.at(-1).slice(CALENDAR_RESPONSE_MARKER.length)
  );
  assert.equal(pending.cancel, 'pending');
  assert.equal(pending.cancelPending, true);
  assert.equal(pending.state, 'ABORTED');
  rejectCancel(new Error(sentinel));
  await turns();
  diagnostics.afterDispose();
  const late = JSON.parse(lines.at(-1).slice(CALENDAR_RESPONSE_MARKER.length));
  assert.equal(late.cancel, 'failed');
  assert.equal(late.cancelPending, false);
  assert.ok(!JSON.stringify(lines).includes(sentinel));
});
test('read/cancel faults and reporting failures never replace primary', async () => {
  const failed = new ReadableStream({
    start(controller) {
      controller.error(new Error(sentinel));
    },
  });
  const ledger = beginCalendar500Discard(new Response(failed, { status: 500 }));
  await turns();
  assert.equal(ledger.snapshot().state, 'READ_ERROR');
  assert.equal(ledger.snapshot().cancel, 'failed');
  const primary = new Error('original assertion');
  const diagnostics = createCalendar500Diagnostics(() => {
    throw new Error(sentinel);
  });
  assert.throws(
    () => diagnostics.fail(primary, new Response(null, { status: 500 })),
    (error) => error === primary
  );
  assert.doesNotThrow(() => diagnostics.afterDispose());
});
test('non500 does not consume body; malformed response records are discarded', () => {
  let pulls = 0;
  const response = new Response(
    new ReadableStream(
      {
        pull() {
          pulls += 1;
        },
      },
      { highWaterMark: 0 }
    ),
    { status: 307 }
  );
  const primary = new Error('status assertion');
  assert.throws(
    () => createCalendar500Diagnostics().fail(primary, response),
    (error) => error === primary
  );
  assert.equal(pulls, 0);
  assert.equal(
    parseCalendarResponseRecord({ version: 1, status: 500, body: sentinel }),
    undefined
  );
});
test('collector waits for natural close/drain, strips sentinels and bounds malformed/oversized records', () => {
  const forwarded = [];
  const collector = createCalendarSsrCollector((stream, chunk) =>
    forwarded.push([stream, chunk])
  );
  const error = projectCalendarSsrError(
    new TypeError(sentinel),
    'render-boundary'
  );
  const line = `[wrangler:error] ${CALENDAR_SSR_MARKER}${JSON.stringify(error)}\n`;
  collector.forward('stderr', Buffer.from(line.slice(0, 40)));
  collector.forward('stderr', Buffer.from(line.slice(40)));
  collector.forward('stdout', 'ordinary log\n');
  collector.forward(
    'stderr',
    `${CALENDAR_SSR_MARKER}${JSON.stringify({ ...error, message: sentinel })}\n`
  );
  collector.forward(
    'stderr',
    `${CALENDAR_SSR_MARKER}${sentinel.repeat(10000)}\n`
  );
  collector.forward('stderr', `${CALENDAR_SSR_MARKER}{"name":"${sentinel}"}\n`);
  assert.throws(
    () => collector.finish({ ...closed, stdioDrained: false }, binding),
    /Undrained/
  );
  assert.throws(
    () => collector.finish({ ...closed, closeObserved: false }, binding),
    /Missing/
  );
  assert.throws(
    () => collector.finish({ ...closed, intervened: true }, binding),
    /intervention/
  );
  const packet = collector.finish(closed, binding);
  assert.equal(packet.owningErrors.length, 1);
  assert.equal(packet.owningError, 'CAPTURED');
  assert.ok(packet.dropped >= 3);
  assert.ok(!JSON.stringify(packet).includes(sentinel));
  assert.deepEqual(forwarded, [['stdout', 'ordinary log\n']]);
  assert.throws(() => collector.finish(closed, binding), /already/);
});
test('unknown remains UNKNOWN, records cap and packet writes exclusive private verified file', async () => {
  const collector = createCalendarSsrCollector(() => {});
  for (let index = 0; index < 100; index += 1)
    collector.forward(
      'stderr',
      `${CALENDAR_SSR_MARKER}${JSON.stringify(projectCalendarSsrError({}, 'handler'))}\n`
    );
  assert.throws(() => collector.finish(closed, { ...binding, job: sentinel }));
  const packet = collector.finish(closed, binding);
  assert.equal(packet.owningErrors.length, 16);
  assert.ok(packet.dropped > 0);
  assert.equal(packet.owningErrors[0].category, 'UNKNOWN');
  const root = await mkdtemp(join(tmpdir(), 'calendar-sanitized-'));
  try {
    const path = join(root, 'packet.json');
    await assert.rejects(
      writeCalendarSsrPacket(path, { ...packet, message: sentinel }),
      /Invalid sanitized packet/
    );
    await assert.rejects(
      writeCalendarSsrPacket(path, {
        ...packet,
        owningErrors: [{ ...packet.owningErrors[0], message: sentinel }],
      }),
      /Invalid sanitized records/
    );
    await writeCalendarSsrPacket(path, packet);
    assert.equal((await stat(path)).mode & 0o777, 0o600);
    assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), packet);
    await assert.rejects(writeCalendarSsrPacket(path, packet), {
      code: 'EEXIST',
    });
  } finally {
    await rm(root, { recursive: true });
  }
});

test('workflow uploads only the parent verified sanitized packet for each runtime job', async () => {
  const { createRequire } = await import('node:module');
  const { parse } = createRequire(import.meta.url)('yaml');
  const workflow = parse(
    await readFile(
      new URL(
        '../../.github/workflows/mail-calendar-tasks-builds.yaml',
        import.meta.url
      ),
      'utf8'
    )
  );
  for (const job of ['calendar-native', 'calendar-artifact-restore']) {
    const steps = workflow.jobs[job].steps;
    const runtime = steps.find((step) => step.id === 'calendar-runtime');
    assert.equal(
      runtime.run,
      'node scripts/ci/calendar-native-worker.runtime.mjs "$SOURCE_SHA"'
    );
    assert.equal(runtime['timeout-minutes'], 3);
    const upload = steps.find(
      (step) =>
        step.name === 'Retain sanitized Calendar SSR fixture diagnostics'
    );
    assert.equal(
      upload.if,
      `\${{ always() && steps.calendar-runtime.outputs.ssr_diagnostic != '' }}`
    );
    assert.equal(
      upload.with.path,
      `\${{ steps.calendar-runtime.outputs.ssr_diagnostic }}`
    );
    assert.equal(Object.hasOwn(upload.with, 'include-hidden-files'), false);
    assert.equal(upload.with['if-no-files-found'], 'error');
    assert.equal(upload.with['retention-days'], 3);
    assert.ok(
      upload.with.name.includes(
        `\${{ env.SOURCE_SHA }}-\${{ github.run_id }}-\${{ github.run_attempt }}-\${{ github.job }}`
      )
    );
    assert.ok(steps.indexOf(upload) > steps.indexOf(runtime));
  }
});
