export const CALENDAR_RESPONSE_MARKER = 'calendar-response-diagnostic ';
export const DRAIN_READ_LIMIT = 8;
export const DRAIN_BYTE_LIMIT = 65536;
const initial = () => ({
  version: 1,
  status: 500,
  stage: 'assertion',
  state: 'NOT_STARTED',
  reads: 0,
  bytes: 0,
  readPending: false,
  cancelPending: false,
  cancel: 'not-needed',
  release: 'not-needed',
  underlyingCancellation: 'UNKNOWN',
});

// No consumer of this ledger awaits an underlying read or cancellation. Pending
// operations remain UNKNOWN; the existing test signal is the only stop fence.
export function beginCalendar500Discard(response, signal) {
  const result = initial();
  let reader,
    stopped = false,
    cancelRequested = false;
  const detach = () => signal?.removeEventListener('abort', stop);
  const release = () => {
    if (
      !reader ||
      result.readPending ||
      ['settled', 'failed'].includes(result.release)
    )
      return;
    try {
      reader.releaseLock();
      result.release = 'settled';
    } catch {
      result.release = 'failed';
    }
  };
  const cancel = () => {
    if (!reader || cancelRequested) return;
    cancelRequested = true;
    result.cancel = 'pending';
    result.cancelPending = true;
    // Both late fulfillment and rejection are observed. Neither is awaited by
    // the test/teardown path or described as natural body/SDK closure.
    try {
      Promise.resolve(reader.cancel()).then(
        () => {
          result.cancel = 'settled';
          result.cancelPending = false;
          release();
        },
        () => {
          result.cancel = 'failed';
          result.cancelPending = false;
          release();
        }
      );
    } catch {
      result.cancel = 'failed';
      result.cancelPending = false;
      release();
    }
  };
  function stop() {
    if (stopped) return;
    stopped = true;
    result.state = 'ABORTED';
    detach();
    cancel();
    release();
  }
  function failedRead() {
    result.readPending = false;
    if (!stopped) {
      stopped = true;
      result.state = 'READ_ERROR';
    }
    detach();
    cancel();
    release();
  }
  function read() {
    if (stopped || signal?.aborted) {
      if (!stopped) stop();
      return;
    }
    if (result.reads === DRAIN_READ_LIMIT || result.bytes >= DRAIN_BYTE_LIMIT) {
      stopped = true;
      result.state = 'LIMIT';
      detach();
      cancel();
      release();
      return;
    }
    result.reads += 1;
    result.readPending = true;
    result.state = 'READ_PENDING';
    try {
      Promise.resolve(reader.read())
        .then((part) => {
          result.readPending = false;
          if (!part.done && part.value instanceof Uint8Array)
            result.bytes += part.value.byteLength;
          if (stopped) {
            release();
            return;
          }
          if (signal?.aborted) {
            stop();
            return;
          }
          if (part.done) {
            stopped = true;
            result.state = 'DRAINED';
            detach();
            release();
            return;
          }
          if (!(part.value instanceof Uint8Array)) {
            failedRead();
            return;
          }
          read();
        }, failedRead)
        .catch(failedRead);
    } catch {
      failedRead();
    }
  }
  try {
    if (!response.body) result.state = 'NO_BODY';
    else {
      reader = response.body.getReader();
      result.release = 'pending';
      signal?.addEventListener('abort', stop, { once: true });
      if (signal?.aborted) stop();
      else read();
    }
  } catch {
    failedRead();
  }
  return { snapshot: () => ({ ...result }) };
}

export function createCalendar500Diagnostics(emit = console.error) {
  const ledgers = [];
  const publish = (record) => {
    try {
      emit(`${CALENDAR_RESPONSE_MARKER}${JSON.stringify(record)}`);
    } catch {
      /* Reporting cannot replace an already registered status assertion. */
    }
  };
  return {
    fail(primary, response, signal) {
      // The caller registers primary before entering here. Publish before any
      // stream operation, and throw that exact primary without awaiting work.
      try {
        if (response.status === 500 && ledgers.length < 4) {
          publish(initial());
          ledgers.push(beginCalendar500Discard(response, signal));
        }
      } catch {
        /* The exact primary remains authoritative. */
      }
      throw primary;
    },
    afterDispose() {
      for (const ledger of ledgers)
        publish({ ...ledger.snapshot(), stage: 'post-dispose' });
    },
  };
}
export function parseCalendarResponseRecord(value) {
  if (
    !value ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    Object.keys(value).sort().join(',') !==
      'bytes,cancel,cancelPending,readPending,reads,release,stage,state,status,underlyingCancellation,version'
  )
    return;
  if (
    value.version !== 1 ||
    value.status !== 500 ||
    value.underlyingCancellation !== 'UNKNOWN' ||
    !['assertion', 'post-dispose'].includes(value.stage) ||
    ![
      'NOT_STARTED',
      'NO_BODY',
      'READ_PENDING',
      'DRAINED',
      'LIMIT',
      'READ_ERROR',
      'ABORTED',
    ].includes(value.state)
  )
    return;
  if (
    !Number.isInteger(value.reads) ||
    value.reads < 0 ||
    value.reads > DRAIN_READ_LIMIT ||
    !Number.isSafeInteger(value.bytes) ||
    value.bytes < 0 ||
    value.bytes > DRAIN_READ_LIMIT * 2 ** 32
  )
    return;
  if (
    typeof value.readPending !== 'boolean' ||
    typeof value.cancelPending !== 'boolean' ||
    !['not-needed', 'pending', 'settled', 'failed'].includes(value.cancel) ||
    !['not-needed', 'pending', 'settled', 'failed'].includes(value.release)
  )
    return;
  if (value.cancelPending !== (value.cancel === 'pending')) return;
  return {
    version: 1,
    status: 500,
    stage: value.stage,
    state: value.state,
    reads: value.reads,
    bytes: value.bytes,
    readPending: value.readPending,
    cancelPending: value.cancelPending,
    cancel: value.cancel,
    release: value.release,
    underlyingCancellation: 'UNKNOWN',
  };
}
