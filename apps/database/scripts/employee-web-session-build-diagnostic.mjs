import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { stripVTControlCharacters } from 'node:util';
import { dartCaseNames } from './chat-initial-settings-qualification.mjs';

export const buildCategories = Object.freeze([
  'module-resolution',
  'missing-export',
  'type-error',
  'syntax-error',
  'configuration',
  'prerender',
  'out-of-memory',
  'build-failed',
]);
export const buildCodes = Object.freeze([
  'TS2307',
  'TS2322',
  'TS2339',
  'TS2345',
  'TS2554',
  'TS2769',
  'TS7006',
  'TS18046',
  'MODULE_NOT_FOUND',
  'ERR_MODULE_NOT_FOUND',
  'ERR_PACKAGE_PATH_NOT_EXPORTED',
  'ENOENT',
  'EACCES',
  'ENOMEM',
]);
export function buildSourcePaths() {
  try {
    return new Set(
      execFileSync('git', ['ls-files', '-z', '--', 'apps/web', 'packages'], {
        encoding: 'utf8',
        maxBuffer: 4 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'ignore'],
      })
        .split('\0')
        .filter((entry) =>
          /^(apps\/web|packages)\/[\w/()[\].@-]+\.(?:tsx?|m?js|json)$/.test(
            entry
          )
        )
    );
  } catch {
    return new Set();
  }
}

const streamLimit = 65536;
const byteCountLimit = 1024 ** 3;
const processIndicators = [
  ['native-panic', /panicked at|non-unwinding panic|\bpanic:/iu],
  ['native-assertion', /assertion[^\r\n]*failed/iu],
  ['out-of-memory', /heap out of memory|\bENOMEM\b/iu],
  ['runtime-fatal', /fatal (?:error|runtime error):/iu],
];
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const exactKeys = (value, keys) =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).length === keys.length &&
  keys.every((key) => Object.hasOwn(value, key));

export function projectProcessOutput(value) {
  if (
    !exactKeys(value, ['version', 'indicators', 'streams', 'truncated']) ||
    value.version !== 1 ||
    typeof value.truncated !== 'boolean' ||
    !Array.isArray(value.indicators) ||
    value.indicators.length < 1 ||
    value.indicators.length > 4 ||
    new Set(value.indicators).size !== value.indicators.length ||
    value.indicators.some(
      (entry) =>
        !['unknown', ...processIndicators.map(([name]) => name)].includes(entry)
    ) ||
    (value.indicators.includes('unknown') && value.indicators.length !== 1) ||
    !Array.isArray(value.streams) ||
    value.streams.length !== 2
  )
    throw new Error('Invalid process output summary');
  const streams = value.streams.map((entry, index) => {
    if (
      !exactKeys(entry, [
        'stream',
        'totalBytes',
        'tailBytes',
        'totalSha256',
        'tailSha256',
        'countTruncated',
        'truncated',
      ]) ||
      entry.stream !== ['stdout', 'stderr'][index] ||
      !Number.isSafeInteger(entry.totalBytes) ||
      entry.totalBytes < 0 ||
      entry.totalBytes > byteCountLimit ||
      !Number.isSafeInteger(entry.tailBytes) ||
      entry.tailBytes < 0 ||
      entry.tailBytes > streamLimit ||
      entry.tailBytes !== Math.min(entry.totalBytes, streamLimit) ||
      ![entry.totalSha256, entry.tailSha256].every(
        (hash) => typeof hash === 'string' && /^[a-f0-9]{64}$/u.test(hash)
      ) ||
      typeof entry.countTruncated !== 'boolean' ||
      (entry.countTruncated && entry.totalBytes !== byteCountLimit) ||
      entry.truncated !==
        (entry.countTruncated || entry.totalBytes > entry.tailBytes)
    )
      throw new Error('Invalid process stream summary');
    return {
      stream: entry.stream,
      totalBytes: entry.totalBytes,
      tailBytes: entry.tailBytes,
      totalSha256: entry.totalSha256,
      tailSha256: entry.tailSha256,
      countTruncated: entry.countTruncated,
      truncated: entry.truncated,
    };
  });
  if (value.truncated !== streams.some((entry) => entry.truncated))
    throw new Error('Invalid process truncation summary');
  return {
    version: 1,
    indicators: [...value.indicators],
    streams,
    truncated: value.truncated,
  };
}

const dartFlags = [
  'malformed',
  'unknownEvent',
  'unknownTest',
  'eventOverflow',
  'testOverflow',
  'suiteOverflow',
  'errorOverflow',
  'tailTruncated',
  'incomplete',
  'reorderedEvent',
  'lateEvent',
  'interleaved',
];
const dartKinds = [
  'assertion',
  'non-assertion',
  'compiler-diagnostic',
  'load-diagnostic',
];
const dartEvents = [
  'start',
  'allSuites',
  'suite',
  'testStart',
  'testDone',
  'error',
  'print',
  'debug',
  'done',
];
const validId = (value) => Number.isSafeInteger(value) && value >= 0;

// Only fixed labels and digests cross the process boundary, never event text.
export function dartTestDiagnostic(bytes, tailTruncated = false) {
  tailTruncated ||= bytes.length > streamLimit;
  bytes = bytes.subarray(-streamLimit);
  const flags = new Set(tailTruncated ? ['tailTruncated'] : []);
  const tests = new Map(),
    suites = new Set(),
    errors = [];
  const counts = Object.fromEntries(dartEvents.map((name) => [name, 0]));
  let done = null,
    events = 0;
  const testFor = (id) => {
    if (!validId(id)) {
      flags.add('malformed');
      return null;
    }
    if (!tests.has(id)) {
      if (tests.size === 32) {
        flags.add('testOverflow');
        return null;
      }
      tests.set(id, {
        name: 'unknown',
        started: false,
        result: null,
        suite: null,
      });
    }
    return tests.get(id);
  };
  for (const line of bytes.toString('utf8').split(/\r?\n/u)) {
    if (!line.trim()) continue;
    if (events === 256) {
      flags.add('eventOverflow');
      break;
    }
    events++;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      flags.add('malformed');
      continue;
    }
    if (
      !event ||
      typeof event !== 'object' ||
      Array.isArray(event) ||
      typeof event.type !== 'string'
    ) {
      flags.add('malformed');
      continue;
    }
    if (!dartEvents.includes(event.type)) {
      flags.add('unknownEvent');
      continue;
    }
    counts[event.type]++;
    if (done !== null) flags.add('lateEvent');
    if (event.type === 'suite') {
      if (!validId(event.suite?.id)) flags.add('malformed');
      else if (!suites.has(event.suite.id) && suites.size === 4)
        flags.add('suiteOverflow');
      else suites.add(event.suite.id);
    } else if (event.type === 'testStart') {
      const test = testFor(event.test?.id);
      if (!test) continue;
      if (
        test.started ||
        typeof event.test.name !== 'string' ||
        !validId(event.test.suiteID)
      ) {
        flags.add('malformed');
        continue;
      }
      if (
        [...tests.values()].some((item) => item.started && item.result === null)
      )
        flags.add('interleaved');
      test.started = true;
      test.suite = event.test.suiteID;
      test.name = dartCaseNames.includes(event.test.name)
        ? event.test.name
        : 'unknown';
    } else if (event.type === 'testDone') {
      const test = testFor(event.testID);
      if (!test) continue;
      if (!test.started) flags.add('reorderedEvent');
      if (
        test.result !== null ||
        !['success', 'failure', 'error'].includes(event.result) ||
        typeof event.skipped !== 'boolean'
      )
        flags.add('malformed');
      else test.result = event.skipped ? 'skipped' : event.result;
    } else if (event.type === 'error') {
      if (
        !testFor(event.testID) ||
        typeof event.error !== 'string' ||
        typeof event.stackTrace !== 'string' ||
        typeof event.isFailure !== 'boolean'
      ) {
        flags.add('malformed');
        continue;
      }
      const owner = tests.get(event.testID);
      if (!owner.started) flags.add('reorderedEvent');
      if (owner.result !== null) flags.add('lateEvent');
      if (errors.length === 4) {
        flags.add('errorOverflow');
        continue;
      }
      const kind = event.isFailure
        ? 'assertion'
        : /(?:^|\n)[^\n]+:\d+:\d+: Error: /u.test(event.error)
          ? 'compiler-diagnostic'
          : /^Failed to load ["']/mu.test(event.error)
            ? 'load-diagnostic'
            : 'non-assertion';
      errors.push({
        id: event.testID,
        kind,
        bytes: Buffer.byteLength(event.error),
        sha256: digest(event.error),
        stackBytes: Buffer.byteLength(event.stackTrace),
        stackSha256: digest(event.stackTrace),
      });
    } else if (event.type === 'done') {
      if (done !== null || typeof event.success !== 'boolean')
        flags.add('malformed');
      else done = event.success;
    }
  }
  for (const test of tests.values()) {
    if (test.name === 'unknown') flags.add('unknownTest');
    if (!test.started || test.result === null || !suites.has(test.suite))
      flags.add('incomplete');
  }
  if (done === null || tests.size === 0) flags.add('incomplete');
  const summary = {
    version: 1,
    events,
    counts,
    doneSuccess: done,
    flags: dartFlags.filter((flag) => flags.has(flag)),
    cases: dartCaseNames.map((name) => ({
      name,
      started: [...tests.values()].filter(
        (test) => test.name === name && test.started
      ).length,
      results: Object.fromEntries(
        ['success', 'failure', 'error', 'skipped'].map((result) => [
          result,
          [...tests.values()].filter(
            (test) => test.name === name && test.result === result
          ).length,
        ])
      ),
    })),
    errors: errors.map(({ id, ...error }) => ({
      case: tests.get(id)?.name ?? 'unknown',
      ...error,
    })),
  };
  return projectDartTestDiagnostic(summary);
}

export function projectDartTestDiagnostic(value) {
  const count = (n, max = 256) => Number.isInteger(n) && n >= 0 && n <= max;
  if (
    Buffer.byteLength(JSON.stringify(value) ?? '') > 8192 ||
    !exactKeys(value, [
      'version',
      'events',
      'counts',
      'doneSuccess',
      'flags',
      'cases',
      'errors',
    ]) ||
    value.version !== 1 ||
    !count(value.events) ||
    !exactKeys(value.counts, dartEvents) ||
    Object.values(value.counts).some((n) => !count(n)) ||
    Object.values(value.counts).reduce((a, b) => a + b, 0) > value.events ||
    ![true, false, null].includes(value.doneSuccess) ||
    !Array.isArray(value.flags) ||
    value.flags.length > dartFlags.length ||
    new Set(value.flags).size !== value.flags.length ||
    value.flags.some((flag) => !dartFlags.includes(flag)) ||
    !Array.isArray(value.cases) ||
    value.cases.length !== dartCaseNames.length ||
    !Array.isArray(value.errors) ||
    value.errors.length > 4
  )
    throw new Error('Invalid Dart test diagnostic');
  const cases = value.cases.map((entry, index) => {
    if (
      !exactKeys(entry, ['name', 'started', 'results']) ||
      entry.name !== dartCaseNames[index] ||
      !count(entry.started, 32) ||
      !exactKeys(entry.results, ['success', 'failure', 'error', 'skipped']) ||
      Object.values(entry.results).some((n) => !count(n, 32))
    )
      throw new Error('Invalid Dart case diagnostic');
    return {
      name: entry.name,
      started: entry.started,
      results: { ...entry.results },
    };
  });
  const errors = value.errors.map((entry) => {
    if (
      !exactKeys(entry, [
        'case',
        'kind',
        'bytes',
        'sha256',
        'stackBytes',
        'stackSha256',
      ]) ||
      ![...dartCaseNames, 'unknown'].includes(entry.case) ||
      !dartKinds.includes(entry.kind) ||
      !count(entry.bytes, streamLimit) ||
      !count(entry.stackBytes, streamLimit) ||
      ![entry.sha256, entry.stackSha256].every(
        (hash) => typeof hash === 'string' && /^[a-f0-9]{64}$/u.test(hash)
      )
    )
      throw new Error('Invalid Dart error diagnostic');
    return { ...entry };
  });
  return {
    version: 1,
    events: value.events,
    counts: { ...value.counts },
    doneSuccess: value.doneSuccess,
    flags: [...value.flags],
    cases,
    errors,
  };
}

// Raw bytes exist only in these bounded in-memory stream tails, never in receipts.
export function buildOutputCapture(
  paths = buildSourcePaths(),
  { dartTestOutput = false } = {}
) {
  const limit = streamLimit;
  const streams = new Map();
  const totals = new Map();
  let truncated = false;
  return {
    append(stream, chunk) {
      if (!['stdout', 'stderr'].includes(stream)) return;
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      const total = totals.get(stream) ?? {
        bytes: 0,
        countTruncated: false,
        hash: createHash('sha256'),
      };
      const nextBytes = total.bytes + bytes.length;
      total.countTruncated ||= nextBytes > byteCountLimit;
      total.bytes = Math.min(nextBytes, byteCountLimit);
      total.hash.update(bytes);
      totals.set(stream, total);
      const previous = streams.get(stream) ?? Buffer.alloc(0);
      if (previous.length + bytes.length > limit) truncated = true;
      streams.set(
        stream,
        Buffer.from(
          Buffer.concat([previous, bytes.subarray(-limit)]).subarray(-limit)
        )
      );
    },
    receipt() {
      const diagnostics = [];
      for (const bytes of streams.values()) {
        let sourcePath = null;
        for (const raw of bytes.toString('utf8').split(/\r?\n/)) {
          const line = stripVTControlCharacters(raw);
          const location = line.match(
            /^(?:\.\/|\.\.\/\.\.\/)?((?:src|apps\/web|packages)\/[\w/()[\].@-]+\.(?:tsx?|m?js|json))(?::\d+(?::\d+)?)?\s*$/
          );
          if (location) {
            const candidate = location[1].startsWith('src/')
              ? `apps/web/${location[1]}`
              : location[1];
            sourcePath = paths.has(candidate) ? candidate : null;
            continue;
          }
          const category =
            /Module not found|Cannot find (?:module|package)|Can't resolve|ERR_MODULE_NOT_FOUND|MODULE_NOT_FOUND|ERR_PACKAGE_PATH_NOT_EXPORTED/i.test(
              line
            )
              ? 'module-resolution'
              : /export .*doesn.t exist|not exported from|has no exported member/i.test(
                    line
                  )
                ? 'missing-export'
                : /Type error:|error TS\d+/.test(line)
                  ? 'type-error'
                  : /SyntaxError|syntax error|Parsing ecmascript source code failed/i.test(
                        line
                      )
                    ? 'syntax-error'
                    : /Invalid next.config|Failed to load next.config|Invalid configuration/i.test(
                          line
                        )
                      ? 'configuration'
                      : /prerendering page|Error occurred prerendering/i.test(
                            line
                          )
                        ? 'prerender'
                        : /heap out of memory|ENOMEM/i.test(line)
                          ? 'out-of-memory'
                          : /Build error occurred|Failed to compile|Build failed/i.test(
                                line
                              )
                            ? 'build-failed'
                            : null;
          const diagnosticPath = sourcePath;
          sourcePath = null;
          if (!category) continue;
          const code =
            buildCodes.find((entry) =>
              new RegExp(`\\b${entry}\\b`).test(line)
            ) ?? null;
          const value = { category, code, path: diagnosticPath };
          if (
            !diagnostics.some(
              (entry) => JSON.stringify(entry) === JSON.stringify(value)
            )
          ) {
            if (diagnostics.length < 8) diagnostics.push(value);
            else truncated = true;
          }
        }
      }
      const indicators = processIndicators
        .filter(([, pattern]) =>
          [...streams.values()].some((bytes) =>
            pattern.test(stripVTControlCharacters(bytes.toString('utf8')))
          )
        )
        .map(([name]) => name);
      const processStreams = ['stdout', 'stderr'].map((stream) => {
        const tail = streams.get(stream) ?? Buffer.alloc(0);
        const total = totals.get(stream);
        const totalBytes = total?.bytes ?? 0;
        const countTruncated = total?.countTruncated ?? false;
        return {
          stream,
          totalBytes,
          tailBytes: tail.length,
          totalSha256: total ? total.hash.digest('hex') : digest(tail),
          tailSha256: digest(tail),
          countTruncated,
          truncated: countTruncated || totalBytes > tail.length,
        };
      });
      const processOutput = {
        version: 1,
        indicators: indicators.length ? indicators : ['unknown'],
        streams: processStreams,
        truncated: processStreams.some((entry) => entry.truncated),
      };
      const dartTest = dartTestOutput
        ? dartTestDiagnostic(
            streams.get('stdout') ?? Buffer.alloc(0),
            processStreams[0].truncated
          )
        : undefined;
      streams.clear();
      totals.clear();
      return {
        diagnostics,
        truncated,
        processOutput,
        ...(dartTestOutput ? { dartTest } : {}),
      };
    },
  };
}

export function projectBuildDiagnostic(value, paths = buildSourcePaths()) {
  if (
    !value ||
    typeof value !== 'object' ||
    typeof value.truncated !== 'boolean' ||
    !Array.isArray(value.diagnostics) ||
    value.diagnostics.length > 8
  )
    throw 0;
  return {
    diagnostics: value.diagnostics.map((entry) => {
      if (
        !entry ||
        !buildCategories.includes(entry.category) ||
        !(entry.code === null || buildCodes.includes(entry.code)) ||
        !(entry.path === null || paths.has(entry.path))
      )
        throw 0;
      return { category: entry.category, code: entry.code, path: entry.path };
    }),
    truncated: value.truncated,
  };
}
