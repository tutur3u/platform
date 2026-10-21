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

export async function projectMeetServerFailure(response, path) {
  if (response.status !== 500)
    throw new Error('Only HTTP500 diagnostic responses supported');
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
    drain: 'complete',
    bytes: 0,
    truncated: false,
    owners: [],
    errorNames: [],
    category: 'UNKNOWN',
  };
  const reader = response.body?.getReader();
  const chunks = [];
  if (reader) {
    try {
      for (;;) {
        const next = await reader.read();
        if (next.done) break;
        fact.bytes += next.value.byteLength;
        if (fact.bytes > LIMIT) {
          fact.bytes = LIMIT;
          fact.truncated = true;
          fact.drain = 'cancelled';
          await reader.cancel();
          break;
        }
        chunks.push(Buffer.from(next.value));
      }
    } catch {
      fact.drain = 'failed';
    } finally {
      reader.releaseLock();
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
