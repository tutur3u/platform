import assert from 'node:assert/strict';
import {
  MEET_SSR_MARKER,
  parseMeetSsrRecord,
} from '../../apps/meet/src/runtime/ssr-diagnostics.ts';

// The callback only holds bounded candidates. Projection happens after natural close/drain.
export function createMeetSsrCollector(
  forward = (stream, bytes) => process[stream].write(bytes)
) {
  // Only the raw/TAP marker or the exact observed SDK ERROR envelope qualifies.
  const sdkErrorPrefix =
    '\x1b[31m✘ \x1b[41;31m[\x1b[41;97mERROR\x1b[41;31m]\x1b[0m \x1b[1m';
  const prefixes = [
    { text: MEET_SSR_MARKER, suffix: Buffer.alloc(0) },
    { text: `# ${MEET_SSR_MARKER}`, suffix: Buffer.alloc(0) },
    {
      text: `${sdkErrorPrefix}${MEET_SSR_MARKER}`,
      suffix: Buffer.from('\x1b[0m'),
    },
  ].map(({ text, suffix }) => ({ bytes: Buffer.from(text), suffix }));
  const fresh = () => ({
    mode: 'prefix',
    prefix: Buffer.alloc(0),
    payload: Buffer.alloc(0),
    size: 0,
    suffix: Buffer.alloc(0),
    overflow: false,
  });
  const streams = new Map(['stdout', 'stderr'].map((name) => [name, fresh()]));
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
  function diagnostic(state) {
    if (state.overflow || candidates.length === 64) {
      drop();
      return;
    }
    const suffixAt = state.payload.length - state.suffix.length;
    if (
      suffixAt < 0 ||
      !state.payload.subarray(suffixAt).equals(state.suffix)
    ) {
      drop();
      return;
    }
    candidates.push(state.payload.subarray(0, suffixAt).toString('utf8'));
  }
  function reset(state) {
    Object.assign(state, fresh());
  }
  function consume(stream, chunk) {
    const state = streams.get(stream);
    let offset = 0;
    while (offset < chunk.length) {
      if (state.mode === 'prefix') {
        const byte = chunk.subarray(offset, ++offset);
        state.prefix = Buffer.concat([state.prefix, byte]);
        const possible = prefixes.filter((prefix) =>
          prefix.bytes.subarray(0, state.prefix.length).equals(state.prefix)
        );
        if (!possible.length) {
          forward(stream, state.prefix);
          state.prefix = Buffer.alloc(0);
          if (byte[0] === 10) reset(state);
          else state.mode = 'ordinary';
        } else if (
          possible.some((prefix) => prefix.bytes.length === state.prefix.length)
        ) {
          state.mode = 'diagnostic';
          state.suffix = possible.find(
            (prefix) => prefix.bytes.length === state.prefix.length
          ).suffix;
          state.size = state.prefix.length;
          state.prefix = Buffer.alloc(0);
        }
        continue;
      }
      const newline = chunk.indexOf(10, offset);
      const end = newline < 0 ? chunk.length : newline + 1;
      const part = chunk.subarray(offset, end);
      if (state.mode === 'ordinary') forward(stream, part);
      else {
        const payload = newline < 0 ? part : part.subarray(0, part.length - 1);
        state.size += payload.length;
        if (!state.overflow && state.size <= 2048)
          state.payload = Buffer.concat([state.payload, payload]);
        else {
          state.payload = Buffer.alloc(0);
          state.overflow = true;
        }
      }
      if (newline >= 0) {
        if (state.mode === 'diagnostic') diagnostic(state);
        reset(state);
      }
      offset = end;
    }
  }
  return {
    forward(stream, chunk) {
      assert.ok(
        !finished && streams.has(stream),
        'Unsupported diagnostic stream'
      );
      assert.ok(Buffer.isBuffer(chunk), 'Unsupported diagnostic bytes');
      consume(stream, chunk);
    },
    finish(outcome, sourceSHA) {
      assert.equal(finished, false, 'Diagnostics already finalized');
      assert.match(sourceSHA, /^[a-f0-9]{40}$/);
      finished = true;
      // Ordinary tails survive even a signaled child or incomplete diagnostic closure.
      for (const [stream, state] of streams) {
        if (state.mode === 'prefix' && state.prefix.length)
          forward(stream, state.prefix);
        else if (state.mode === 'diagnostic') diagnostic(state);
        reset(state);
      }
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
