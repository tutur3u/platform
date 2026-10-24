import assert from 'node:assert/strict';
import { open, realpath } from 'node:fs/promises';
import { dirname, isAbsolute } from 'node:path';
import {
  CALENDAR_SSR_MARKER,
  parseCalendarSsrErrorRecord,
} from '../../apps/calendar/src/runtime/ssr-diagnostics.ts';
import {
  CALENDAR_RESPONSE_MARKER,
  parseCalendarResponseRecord,
} from './calendar-response-diagnostics.mjs';

// This exact console.error envelope is observed in both owning Calendar and
// inherited Mail captures. Other prefixes remain ordinary output.
const SDK_ERROR_PREFIX =
  '\u001b[31m✘ \u001b[41;31m[\u001b[41;97mERROR\u001b[41;31m]\u001b[0m \u001b[1m';
function recognized(text) {
  const sdk = text.startsWith(SDK_ERROR_PREFIX);
  const content = sdk ? text.slice(SDK_ERROR_PREFIX.length) : text;
  const marker = [CALENDAR_SSR_MARKER, CALENDAR_RESPONSE_MARKER].find((key) =>
    content.startsWith(key)
  );
  if (!marker) return;
  let body = content.slice(marker.length);
  if (sdk) body = body.endsWith('\u001b[0m') ? body.slice(0, -4) : '';
  return { marker, text: body };
}

export function createCalendarSsrCollector(
  forward = (stream, chunk) => process[stream].write(chunk)
) {
  const fresh = () => ({
    bytes: Buffer.alloc(0),
    binary: false,
    overflow: false,
    passthrough: false,
  });
  const streams = new Map(['stdout', 'stderr'].map((name) => [name, fresh()]));
  const candidates = [];
  const rejections = { parse: 0, schema: 0, overflow: 0, limit: 0 };
  let dropped = 0,
    droppedSaturated = false,
    finished = false;
  function reject(reason) {
    if (dropped === 1000000) {
      droppedSaturated = true;
      return;
    }
    dropped += 1;
    rejections[reason] += 1;
  }
  const emit = (stream, bytes, binary) => {
    if (bytes.length) forward(stream, binary ? bytes : bytes.toString('utf8'));
  };
  function flush(stream, state) {
    if (state.overflow) {
      reject('overflow');
      return;
    }
    if (state.passthrough) return;
    const candidate = recognized(
      state.bytes.toString('utf8').replace(/\r?\n$/, '')
    );
    if (!candidate) {
      emit(stream, state.bytes, state.binary);
      return;
    }
    if (candidates.length === 32) {
      reject('limit');
      return;
    }
    candidates.push(candidate);
  }
  return {
    forward(stream, chunk) {
      assert.ok(
        !finished && streams.has(stream),
        'Unsupported diagnostic stream'
      );
      let state = streams.get(stream);
      const binary = Buffer.isBuffer(chunk);
      const bytes = binary ? chunk : Buffer.from(String(chunk), 'utf8');
      let start = 0;
      while (start < bytes.length) {
        const end = bytes.indexOf(10, start);
        const part = bytes.subarray(start, end < 0 ? bytes.length : end + 1);
        if (state.overflow) {
          /* Suppress recognized payload until line end. */
        } else if (state.passthrough) emit(stream, part, binary);
        else if (state.bytes.length + part.length <= 2048) {
          state.bytes = Buffer.concat([state.bytes, part]);
          state.binary ||= binary;
        } else {
          const head = Buffer.concat([state.bytes, part.subarray(0, 192)])
            .subarray(0, 192)
            .toString('utf8');
          if (recognized(head)) state.overflow = true;
          else {
            emit(stream, state.bytes, state.binary);
            emit(stream, part, binary);
            state.passthrough = true;
          }
          state.bytes = Buffer.alloc(0);
        }
        if (end < 0) break;
        flush(stream, state);
        state = fresh();
        streams.set(stream, state);
        start = end + 1;
      }
    },
    finish(outcome, binding) {
      assert.equal(finished, false, 'Diagnostics already collected');
      assert.equal(
        outcome?.closeObserved,
        true,
        'Missing diagnostic child close'
      );
      assert.equal(
        outcome?.stdioDrained,
        true,
        'Undrained diagnostic child pipes'
      );
      assert.equal(outcome?.intervened, false, 'Diagnostic child intervention');
      assert.ok(
        outcome.signal === null && outcome.error === undefined,
        'Incomplete diagnostic child closure'
      );
      assert.ok(
        Number.isInteger(outcome.code) &&
          outcome.code >= 0 &&
          outcome.code <= 255,
        'Invalid diagnostic child exit'
      );
      validateBinding(binding);
      assert.ok(
        ['calendar-native', 'calendar-artifact-restore'].includes(binding.job)
      );
      for (const [stream, state] of streams)
        if (state.bytes.length || state.overflow) flush(stream, state);
      finished = true;
      const owningErrors = [],
        responses = [];
      for (const candidate of candidates) {
        let value;
        try {
          value = JSON.parse(candidate.text);
        } catch {
          reject('parse');
          continue;
        }
        const record =
          candidate.marker === CALENDAR_SSR_MARKER
            ? parseCalendarSsrErrorRecord(value)
            : parseCalendarResponseRecord(value);
        if (!record) {
          reject('schema');
          continue;
        }
        const target =
          candidate.marker === CALENDAR_SSR_MARKER ? owningErrors : responses;
        if (target.length < 16) target.push(record);
        else reject('limit');
      }
      candidates.length = 0;
      return {
        version: 1,
        sourceSHA: binding.sourceSHA,
        runId: binding.runId,
        attempt: binding.attempt,
        job: binding.job,
        closure: {
          closeObserved: true,
          stdioDrained: true,
          intervened: false,
          exitCode: outcome.code,
        },
        classification: responses.length ? 'HTTP_500' : 'UNKNOWN',
        owningError: owningErrors.length ? 'CAPTURED' : 'UNKNOWN',
        owningErrors,
        responses,
        dropped,
        rejections: { ...rejections },
        droppedSaturated,
      };
    },
  };
}
function validateBinding(binding) {
  assert.ok(
    typeof binding.sourceSHA === 'string' &&
      /^[a-f0-9]{40}$/.test(binding.sourceSHA),
    'Invalid diagnostic source'
  );
  assert.ok(
    typeof binding.runId === 'string' && /^\d{1,20}$/.test(binding.runId),
    'Invalid diagnostic run'
  );
  assert.ok(
    typeof binding.attempt === 'string' && /^\d{1,8}$/.test(binding.attempt),
    'Invalid diagnostic attempt'
  );
  assert.ok(
    ['calendar-native', 'calendar-artifact-restore'].includes(binding.job),
    'Invalid diagnostic job'
  );
}
function validatedPacket(packet) {
  assert.ok(
    packet &&
      Object.keys(packet).sort().join(',') ===
        'attempt,classification,closure,dropped,droppedSaturated,job,owningError,owningErrors,rejections,responses,runId,sourceSHA,version',
    'Invalid sanitized packet fields'
  );
  validateBinding(packet);
  assert.ok(
    packet.version === 1 &&
      Number.isInteger(packet.dropped) &&
      packet.dropped >= 0 &&
      packet.dropped <= 1000000,
    'Invalid packet limits'
  );
  assert.ok(
    Array.isArray(packet.owningErrors) &&
      packet.owningErrors.length <= 16 &&
      Array.isArray(packet.responses) &&
      packet.responses.length <= 16,
    'Invalid packet records'
  );
  const reasons = packet.rejections;
  assert.ok(
    reasons &&
      Object.keys(reasons).sort().join(',') === 'limit,overflow,parse,schema' &&
      Object.values(reasons).every(
        (value) => Number.isInteger(value) && value >= 0 && value <= 1000000
      ) &&
      Object.values(reasons).reduce((total, value) => total + value, 0) ===
        packet.dropped &&
      typeof packet.droppedSaturated === 'boolean' &&
      (!packet.droppedSaturated || packet.dropped === 1000000),
    'Invalid rejection counts'
  );
  const owningErrors = packet.owningErrors.map(parseCalendarSsrErrorRecord),
    responses = packet.responses.map(parseCalendarResponseRecord);
  assert.ok(
    owningErrors.every(Boolean) && responses.every(Boolean),
    'Invalid sanitized records'
  );
  const closure = packet.closure;
  assert.ok(
    closure &&
      Object.keys(closure).sort().join(',') ===
        'closeObserved,exitCode,intervened,stdioDrained' &&
      closure.closeObserved === true &&
      closure.stdioDrained === true &&
      closure.intervened === false &&
      Number.isInteger(closure.exitCode) &&
      closure.exitCode >= 0 &&
      closure.exitCode <= 255,
    'Invalid sanitized closure'
  );
  const classification = responses.length ? 'HTTP_500' : 'UNKNOWN',
    owningError = owningErrors.length ? 'CAPTURED' : 'UNKNOWN';
  assert.ok(
    packet.classification === classification &&
      packet.owningError === owningError,
    'Invalid diagnostic classification'
  );
  return {
    version: 1,
    sourceSHA: packet.sourceSHA,
    runId: packet.runId,
    attempt: packet.attempt,
    job: packet.job,
    closure: {
      closeObserved: true,
      stdioDrained: true,
      intervened: false,
      exitCode: closure.exitCode,
    },
    classification,
    owningError,
    owningErrors,
    responses,
    dropped: packet.dropped,
    rejections: {
      parse: reasons.parse,
      schema: reasons.schema,
      overflow: reasons.overflow,
      limit: reasons.limit,
    },
    droppedSaturated: packet.droppedSaturated,
  };
}
export async function writeCalendarSsrPacket(path, packet) {
  const clean = validatedPacket(packet);
  assert.ok(
    isAbsolute(path) && !/[\r\n]/.test(path),
    'Invalid diagnostic destination'
  );
  assert.ok(
    (await realpath(dirname(path))) === dirname(path),
    'Noncanonical diagnostic destination'
  );
  const bytes = `${JSON.stringify(clean)}\n`;
  assert.ok(Buffer.byteLength(bytes) <= 32768, 'Oversized sanitized packet');
  const handle = await open(path, 'wx+', 0o600);
  try {
    await handle.writeFile(bytes);
    const info = await handle.stat();
    assert.ok(
      info.isFile() && (info.mode & 0o777) === 0o600,
      'Nonprivate sanitized packet'
    );
    const expected = Buffer.from(bytes);
    const readback = Buffer.alloc(expected.length + 1);
    let length = 0;
    while (length < readback.length) {
      const { bytesRead } = await handle.read(
        readback,
        length,
        readback.length - length,
        length
      );
      if (bytesRead === 0) break;
      length += bytesRead;
    }
    assert.ok(
      readback.subarray(0, length).equals(expected),
      'Sanitized packet readback failed'
    );
  } finally {
    await handle.close();
  }
}
