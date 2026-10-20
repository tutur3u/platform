import { constants } from 'node:fs';
import fs from 'node:fs/promises';

const statuses = new Set([
  'passed',
  'failed',
  'timedOut',
  'skipped',
  'interrupted',
]);
const record = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const marker = '[lettin-e2e] profile navigation diagnostics ';
const invalid = () => {
  throw new Error('invalid diagnostic');
};
const enumeration =
  (...values) =>
  (value) =>
    values.includes(value) ? value : invalid();
const integer =
  (max, min = 0) =>
  (value) =>
    Number.isInteger(value) && value >= min && value <= max ? value : invalid();
const nullable = (schema) => (value) => (value === null ? null : schema(value));
const boolean = enumeration(true, false);
const list = (schema, max) => (value) => {
  if (!Array.isArray(value) || value.length > max) return invalid();
  return value.map(schema);
};
const object =
  (fields, optional = {}) =>
  (value) => {
    if (
      !record(value) ||
      Object.keys(value).some(
        (key) => !(Object.hasOwn(fields, key) || Object.hasOwn(optional, key))
      ) ||
      Object.keys(fields).some((key) => !Object.hasOwn(value, key))
    )
      return invalid();
    const result = {};
    for (const [key, schema] of Object.entries(fields))
      result[key] = schema(value[key]);
    for (const [key, schema] of Object.entries(optional))
      if (Object.hasOwn(value, key)) result[key] = schema(value[key]);
    return result;
  };
const enums = (values) => enumeration(...values.split(' '));
const routes =
  'profile login verify-token dashboard other-local external unparseable';
const locales = 'en vi unprefixed external unparseable';
const route = enums(routes);
const targetRoute = enums(`${routes} unavailable`);
const locale = enums(locales);
const targetLocale = enums(`${locales} unavailable`);
const originClass = enumeration(
  'local',
  'external',
  'unparseable',
  'unavailable'
);
const timing = nullable(integer(2147483647));
const requestId = nullable(integer(64, 1));
const frameId = nullable(integer(16, 1));
const proxy = object({
  stage: enums(
    'canonical-locale canonical-public verify-token login auth-login workspace-route-status intl'
  ),
  requestLocale: enumeration('en', 'vi', 'unprefixed'),
  nextLocale: enumeration('en', 'vi', 'unprefixed'),
  sameRequestPath: boolean,
});
const hop = object(
  {
    route,
    locale,
    targetRoute,
    targetLocale,
    samePath: nullable(boolean),
    sameOrigin: nullable(boolean),
    status: integer(599, 100),
    body: enumeration('pending', 'finished', 'failed', 'unavailable'),
  },
  {
    proxy,
    requestId: (value) =>
      typeof value === 'string' && /^[a-f0-9]{32}$/u.test(value)
        ? value
        : invalid(),
  }
);
const request = object({
  id: integer(64, 1),
  frame: frameId,
  route,
  origin: originClass,
  resource: enums(
    'document stylesheet image media font script texttrack xhr fetch eventsource websocket manifest other'
  ),
  method: enums('GET HEAD POST PUT PATCH DELETE OPTIONS other'),
  navigation: nullable(boolean),
  start: timing,
  response: timing,
  finish: timing,
  fail: timing,
  status: nullable(integer(599, 100)),
  terminal: enumeration(
    'outstanding-at-snapshot',
    'finished',
    'failed',
    'unknown'
  ),
});
const frame = object({
  id: integer(16, 1),
  parent: frameId,
  main: nullable(boolean),
  route,
  origin: originClass,
  initial: timing,
  attached: timing,
  navigated: timing,
  detached: timing,
  load: enumeration('unknown'),
});
const event = object({
  kind: enums(
    'initial attached navigated detached start response finished failed'
  ),
  request: requestId,
  frame: frameId,
  at: timing,
});
const countFields = Object.fromEntries(
  [
    'starts',
    'responses',
    'finishes',
    'failures',
    'frameEvents',
    'orphan',
    'droppedRequests',
    'droppedFrames',
    'droppedEvents',
    'errors',
    'timingErrors',
  ].map((key) => [key, integer(65535)])
);
const diagnostic = object({
  version: enumeration(1),
  lifecycle: object({ domContentLoaded: boolean, load: boolean }),
  hops: list(hop, 20),
  truncated: boolean,
  loadObservation: object({
    version: enumeration(1),
    observedAt: enumeration('callback-rejection'),
    coverage: enumeration('unknown'),
    limits: object({
      requests: enumeration(64),
      frames: enumeration(16),
      events: enumeration(128),
      bytes: enumeration(49152),
      counter: enumeration(65535),
    }),
    counts: object(countFields),
    saturated: boolean,
    byteTruncated: boolean,
    omitted: object({
      requests: integer(64),
      frames: integer(16),
      events: integer(128),
    }),
    requests: list(request, 64),
    frames: list(frame, 16),
    events: list(event, 128),
  }),
});
const unknown = (reason) => ({ state: 'unknown', coverage: 'unknown', reason });
function navigationDiagnostics(result) {
  if (result.retry !== 0) return unknown('attempt');
  if (result.stderr === undefined) return unknown('absent');
  if (!Array.isArray(result.stderr)) return unknown('stream');
  if (result.stderr.length > 256) return unknown('entries');
  let bytes = 0;
  const chunks = [];
  for (const entry of result.stderr) {
    if (
      !record(entry) ||
      Object.keys(entry).length !== 1 ||
      typeof entry.text !== 'string'
    )
      return unknown('chunk');
    bytes += Buffer.byteLength(entry.text, 'utf8');
    if (bytes > 131072) return unknown('bytes');
    chunks.push(entry.text);
  }
  const text = chunks.join('');
  const label = marker.trimEnd();
  const first = text.indexOf(label);
  if (first < 0) return unknown('absent');
  if (text.indexOf(label, first + label.length) >= 0)
    return unknown('duplicate');
  if (
    (first > 0 && text[first - 1] !== '\n') ||
    !text.startsWith(marker, first)
  )
    return unknown('framing');
  const end = text.indexOf('\n', first);
  if (end < 0) return unknown('partial');
  const payload = text.slice(first + marker.length, end);
  if (Buffer.byteLength(payload, 'utf8') > 49152) return unknown('payload');
  try {
    const safe = diagnostic(JSON.parse(payload));
    const observation = safe.loadObservation;
    const requestIds = observation.requests.map((item) => item.id);
    const frameIds = observation.frames.map((item) => item.id);
    if (
      new Set(requestIds).size !== requestIds.length ||
      new Set(frameIds).size !== frameIds.length
    )
      return unknown('schema');
    for (const item of observation.requests) {
      if (
        (item.terminal === 'finished' && item.fail !== null) ||
        (item.terminal === 'failed' && item.finish !== null) ||
        (item.terminal === 'outstanding-at-snapshot' &&
          (item.finish !== null || item.fail !== null))
      )
        return unknown('schema');
    }
    return { state: 'observed', coverage: 'unknown', record: safe };
  } catch {
    return unknown('schema');
  }
}

// Keep only caller-owned fixed titles and status enums, never report errors or attachments.
export function summarizeBrowserResults(report, titles) {
  if (!record(report) || !Array.isArray(report.suites)) return [];
  const found = new Map();
  const pending = [...report.suites];
  let visited = 0;
  while (pending.length) {
    if (++visited > 200) return [];
    const suite = pending.pop();
    if (!record(suite)) return [];
    if (suite.suites !== undefined && !Array.isArray(suite.suites)) return [];
    if (suite.specs !== undefined && !Array.isArray(suite.specs)) return [];
    for (const child of suite.suites ?? []) pending.push(child);
    for (const spec of suite.specs ?? []) {
      if (++visited > 200 || !record(spec)) return [];
      if (!titles.includes(spec.title)) continue;
      if (
        found.has(spec.title) ||
        !Array.isArray(spec.tests) ||
        spec.tests.length !== 1
      )
        return [];
      const results = spec.tests[0]?.results;
      if (
        !Array.isArray(results) ||
        results.length !== 1 ||
        !statuses.has(results[0]?.status)
      )
        return [];
      const result = results[0];
      const summary = { title: spec.title, status: result.status };
      if (
        spec.title === titles[0] &&
        ['failed', 'timedOut', 'interrupted'].includes(result.status)
      )
        summary.navigationDiagnostics = navigationDiagnostics(result);
      found.set(spec.title, summary);
    }
  }
  return titles
    .filter((title) => found.has(title))
    .map((title) => found.get(title));
}

export async function readBrowserResultSummary(filename, titles) {
  let file;
  try {
    file = await fs.open(
      filename,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK
    );
    const stat = await file.stat();
    if (
      !stat.isFile() ||
      stat.nlink !== 1 ||
      stat.uid !== process.getuid() ||
      stat.size > 2 * 1024 * 1024
    )
      return [];
    const buffer = Buffer.alloc(stat.size);
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    if (bytesRead !== stat.size) return [];
    return summarizeBrowserResults(JSON.parse(buffer.toString('utf8')), titles);
  } catch {
    return [];
  } finally {
    await file?.close().catch(() => {});
  }
}
