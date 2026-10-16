import { execFileSync } from 'node:child_process';
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

// Raw bytes exist only in these bounded in-memory stream tails, never in receipts.
export function buildOutputCapture(paths = buildSourcePaths()) {
  const limit = 65536;
  const streams = new Map();
  let truncated = false;
  return {
    append(stream, chunk) {
      if (!['stdout', 'stderr'].includes(stream)) return;
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
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
      streams.clear();
      return { diagnostics, truncated };
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
