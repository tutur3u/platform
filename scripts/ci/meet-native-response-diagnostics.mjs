import assert from 'node:assert/strict';

const LIMIT = 65536;
const owners = [
  'LoginPage',
  'loadPageModel',
  'loadResolvedPageModel',
  'meetRequest',
  'createServerFn',
  'ErrorPage',
];
const errors = [
  'TypeError',
  'ReferenceError',
  'SyntaxError',
  'ZodError',
  'Error',
];
const messages = [
  ['Meet request context is unavailable', 'request-context'],
  ['Meet login did not redirect', 'login-returned'],
  ['Invalid Meet page origin', 'page-origin'],
];

async function withinSignal(start, signal, onAbort = () => {}) {
  let abort;
  const stopped = new Promise((resolve) => {
    abort = () => {
      onAbort();
      resolve({ status: 'aborted' });
    };
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  });
  let operation;
  try {
    operation = Promise.resolve(start()).then(
      (value) => ({ status: 'fulfilled', value }),
      () => ({ status: 'rejected' })
    );
  } catch {
    operation = Promise.resolve({ status: 'rejected' });
  }
  try {
    return await Promise.race([stopped, operation]);
  } finally {
    signal.removeEventListener('abort', abort);
  }
}

export async function projectMeetServerFailure(
  response,
  path,
  { signal, onFact = () => {} } = {}
) {
  if (response.status !== 500)
    throw new Error('Only HTTP500 diagnostic responses supported');
  assert.ok(
    signal instanceof AbortSignal,
    'Existing test abort signal required'
  );
  const pathname = new URL(path, 'https://meet.tuturuuu.com').pathname;
  const route = /^\/(?:en\/|vi\/)?login$/.test(pathname)
    ? 'login'
    : /^\/(?:en\/|vi\/)?verify-token$/.test(pathname)
      ? 'callback'
      : 'other';
  const type = response.headers.get('content-type') ?? '';
  const fact = {
    schema: 1,
    route,
    status: response.status,
    format: type.includes('json')
      ? 'json'
      : type.includes('html')
        ? 'html'
        : 'other',
    drain: 'pending',
    read: 'not-started',
    cancel: 'not-attempted',
    underlyingCancellation: 'UNKNOWN',
    bytes: 0,
    truncated: false,
    owners: [],
    errorNames: [],
    category: 'UNKNOWN',
  };
  onFact(fact);
  const chunks = [];
  let reader;
  try {
    reader = response.body?.getReader();
    let cancelRequired = false;
    if (!reader) fact.drain = 'complete';
    else {
      for (;;) {
        if (signal.aborted) {
          fact.drain = 'incomplete';
          cancelRequired = true;
          break;
        }
        fact.read = 'pending';
        const result = await withinSignal(
          () => reader.read(),
          signal,
          () => {
            fact.drain = 'incomplete';
          }
        );
        if (result.status !== 'fulfilled') {
          fact.read = result.status === 'aborted' ? 'pending' : 'rejected';
          fact.drain = result.status === 'aborted' ? 'incomplete' : 'failed';
          cancelRequired = true;
          break;
        }
        fact.read = 'fulfilled';
        const next = result.value;
        if (next.done) {
          fact.drain = 'complete';
          break;
        }
        fact.bytes += next.value.byteLength;
        if (fact.bytes > LIMIT) {
          fact.bytes = LIMIT;
          fact.truncated = true;
          fact.drain = 'incomplete';
          cancelRequired = true;
          break;
        }
        chunks.push(Buffer.from(next.value));
      }
      if (cancelRequired) {
        fact.cancel = 'pending';
        const cancelled = await withinSignal(
          () => reader.cancel(),
          signal,
          () => {
            if (fact.truncated) fact.drain = 'cancel-unsettled';
          }
        );
        fact.cancel =
          cancelled.status === 'aborted' ? 'pending' : cancelled.status;
        if (fact.truncated)
          fact.drain =
            cancelled.status === 'fulfilled'
              ? 'cancelled'
              : cancelled.status === 'aborted'
                ? 'cancel-unsettled'
                : 'failed';
      }
    }
  } catch {
    fact.drain = 'failed';
  } finally {
    if (reader) {
      try {
        reader.releaseLock();
        fact.lockRelease = 'released';
      } catch {
        fact.lockRelease = 'failed';
      }
    }
  }
  const text = Buffer.concat(chunks).toString('utf8');
  fact.owners = owners.filter((owner) =>
    new RegExp(`\\bat [^\\n]{0,160}\\b${owner}\\b`).test(text)
  );
  fact.errorNames = errors.filter((name) =>
    new RegExp(`\\b${name}\\b`).test(text)
  );
  fact.category =
    messages.find(([message]) => text.includes(message))?.[1] ?? 'UNKNOWN';
  return fact;
}

export async function rejectMeetServerFailure(
  response,
  path,
  { signal, recordPrimary, recordFact }
) {
  let primary;
  try {
    assert.notEqual(response.status, 500, 'Meet Worker returned HTTP500');
  } catch (error) {
    primary = error;
  }
  assert.ok(primary, 'Only HTTP500 diagnostic responses supported');
  recordPrimary(primary);
  try {
    await projectMeetServerFailure(response, path, {
      signal,
      onFact: recordFact,
    });
  } catch {
    recordFact({
      schema: 1,
      status: 500,
      drain: 'failed',
      category: 'diagnostic-unavailable',
      underlyingCancellation: 'UNKNOWN',
    });
  }
  throw primary;
}
