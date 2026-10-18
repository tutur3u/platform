import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { stripVTControlCharacters } from 'node:util';

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

// Raw bytes exist only in these bounded in-memory stream tails, never in receipts.
export function buildOutputCapture(paths = buildSourcePaths()) {
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
      streams.clear();
      totals.clear();
      return { diagnostics, truncated, processOutput };
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
