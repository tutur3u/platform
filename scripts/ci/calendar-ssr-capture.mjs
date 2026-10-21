import assert from 'node:assert/strict';
import { readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute } from 'node:path';
import {
  CALENDAR_SSR_MARKER,
  parseCalendarSsrErrorRecord,
} from '../../apps/calendar/src/runtime/ssr-diagnostics.ts';
import {
  CALENDAR_RESPONSE_MARKER,
  parseCalendarResponseRecord,
} from './calendar-response-diagnostics.mjs';

export function createCalendarSsrCollector(
  forward = (stream, chunk) => process[stream].write(chunk)
) {
  const streams = new Map(
    ['stdout', 'stderr'].map((name) => [name, { text: '', overflow: false }])
  );
  const candidates = [];
  let dropped = 0,
    finished = false;
  function line(stream, text, overflow) {
    if (overflow) {
      dropped = Math.min(dropped + 1, 1000000);
      return;
    }
    const marker = [CALENDAR_SSR_MARKER, CALENDAR_RESPONSE_MARKER].find((key) =>
      text.includes(key)
    );
    if (!marker) {
      forward(stream, `${text}\n`);
      return;
    }
    if (candidates.length === 32) {
      dropped = Math.min(dropped + 1, 1000000);
      return;
    }
    candidates.push({
      marker,
      text: text.slice(text.indexOf(marker) + marker.length),
    });
  }
  return {
    forward(stream, chunk) {
      assert.ok(
        !finished && streams.has(stream),
        'Unsupported diagnostic stream'
      );
      const state = streams.get(stream);
      const text = Buffer.isBuffer(chunk)
        ? chunk.toString('utf8')
        : String(chunk);
      let start = 0;
      while (start < text.length) {
        const end = text.indexOf('\n', start);
        const part = text.slice(start, end < 0 ? text.length : end);
        if (state.text.length + part.length <= 2048) state.text += part;
        else {
          state.text = '';
          state.overflow = true;
        }
        if (end < 0) break;
        line(stream, state.text, state.overflow);
        state.text = '';
        state.overflow = false;
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
        if (state.text || state.overflow)
          line(stream, state.text, state.overflow);
      finished = true;
      const owningErrors = [],
        responses = [];
      for (const candidate of candidates) {
        let value;
        try {
          value = JSON.parse(candidate.text);
        } catch {
          dropped += 1;
          continue;
        }
        const record =
          candidate.marker === CALENDAR_SSR_MARKER
            ? parseCalendarSsrErrorRecord(value)
            : parseCalendarResponseRecord(value);
        if (!record) {
          dropped += 1;
          continue;
        }
        const target =
          candidate.marker === CALENDAR_SSR_MARKER ? owningErrors : responses;
        if (target.length < 16) target.push(record);
        else dropped += 1;
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
        'attempt,classification,closure,dropped,job,owningError,owningErrors,responses,runId,sourceSHA,version',
    'Invalid sanitized packet fields'
  );
  validateBinding(packet);
  assert.ok(
    packet.version === 1 &&
      Number.isInteger(packet.dropped) &&
      packet.dropped >= 0 &&
      packet.dropped <= 1000032,
    'Invalid packet limits'
  );
  assert.ok(
    Array.isArray(packet.owningErrors) &&
      packet.owningErrors.length <= 16 &&
      Array.isArray(packet.responses) &&
      packet.responses.length <= 16,
    'Invalid packet records'
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
  await writeFile(path, bytes, { flag: 'wx', mode: 0o600 });
  const info = await stat(path);
  assert.ok(
    info.isFile() && (info.mode & 0o777) === 0o600,
    'Nonprivate sanitized packet'
  );
  assert.ok(
    (await readFile(path, 'utf8')) === bytes,
    'Sanitized packet readback failed'
  );
}
