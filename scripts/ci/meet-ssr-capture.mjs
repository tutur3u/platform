import assert from 'node:assert/strict';
import { StringDecoder } from 'node:string_decoder';
import {
  MEET_SSR_MARKER,
  parseMeetSsrRecord,
} from '../../apps/meet/src/runtime/ssr-diagnostics.ts';

// The callback only holds bounded candidates. Projection happens after natural close/drain.
export function createMeetSsrCollector(
  forward = (stream, bytes) => process[stream].write(bytes)
) {
  const streams = new Map(
    ['stdout', 'stderr'].map((name) => [
      name,
      { decoder: new StringDecoder('utf8'), text: '', overflow: false },
    ])
  );
  const candidates = [];
  const phases = (records) =>
    Object.fromEntries(
      ['loader-import', 'loader-model', 'handler', 'render-boundary'].map(
        (phase) => [
          phase,
          records.some((record) => record.phase === phase)
            ? 'CAPTURED'
            : 'UNKNOWN',
        ]
      )
    );
  let dropped = 0,
    finished = false;
  const drop = () => {
    dropped = Math.min(1_000_000, dropped + 1);
  };
  function line(stream, text, overflow) {
    if (overflow) {
      drop();
      return;
    }
    const offset = text.indexOf(MEET_SSR_MARKER);
    if (offset < 0) {
      forward(stream, `${text}\n`);
      return;
    }
    if (candidates.length === 64) {
      drop();
      return;
    }
    candidates.push(text.slice(offset + MEET_SSR_MARKER.length));
  }
  function consume(stream, text) {
    const state = streams.get(stream);
    let start = 0;
    while (start < text.length) {
      const end = text.indexOf('\n', start);
      const part = text.slice(start, end < 0 ? text.length : end);
      if (!state.overflow && state.text.length + part.length <= 2048)
        state.text += part;
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
  }
  return {
    forward(stream, chunk) {
      assert.ok(
        !finished && streams.has(stream),
        'Unsupported diagnostic stream'
      );
      assert.ok(Buffer.isBuffer(chunk), 'Unsupported diagnostic bytes');
      consume(stream, streams.get(stream).decoder.write(chunk));
    },
    finish(outcome, sourceSHA) {
      assert.equal(finished, false, 'Diagnostics already finalized');
      assert.match(sourceSHA, /^[a-f0-9]{40}$/);
      finished = true;
      const closed =
        outcome?.closeObserved === true &&
        outcome?.stdioDrained === true &&
        outcome?.intervened === false &&
        outcome?.signal === null &&
        outcome?.error === undefined &&
        Number.isInteger(outcome?.code) &&
        outcome.code >= 0 &&
        outcome.code <= 255;
      if (!closed) {
        candidates.length = 0;
        return {
          version: 1,
          sourceSHA,
          availability: 'UNKNOWN',
          closure: 'UNKNOWN',
          phases: phases([]),
          records: [],
          dropped,
        };
      }
      for (const [stream, state] of streams) {
        consume(stream, state.decoder.end());
        if (state.text || state.overflow)
          line(stream, state.text, state.overflow);
        state.text = '';
      }
      const records = [];
      for (const candidate of candidates) {
        try {
          const value = JSON.parse(candidate);
          const record = parseMeetSsrRecord(value);
          // Parent revalidates the closed record instead of persisting callback payloads.
          const clean = record && parseMeetSsrRecord(record);
          if (clean) records.push(clean);
          else drop();
        } catch {
          drop();
        }
      }
      candidates.length = 0;
      return {
        version: 1,
        sourceSHA,
        availability: records.length ? 'CAPTURED' : 'UNKNOWN',
        closure: 'NATURAL_CLOSE_DRAINED',
        phases: phases(records),
        records,
        dropped,
      };
    },
  };
}
