const patterns = Object.freeze([
  ['address-in-use', /\bEADDRINUSE\b/u],
  ['permission-denied', /\bEACCES\b/u],
  ['storage-quota', /\b(?:EDQUOT|ENOSPC)\b/u],
  [
    'missing-module',
    /\b(?:MODULE_NOT_FOUND|ERR_MODULE_NOT_FOUND)\b|Cannot find (?:module|package)/u,
  ],
  [
    'module-export-contract',
    /\b(?:ERR_PACKAGE_PATH_NOT_EXPORTED|ERR_REQUIRE_ESM|ERR_UNSUPPORTED_DIR_IMPORT)\b|does not provide an export named/u,
  ],
  [
    'next-config-load',
    /Failed to load next\.config\.(?:js|mjs|ts)|Failed to transpile "next\.config\.ts"|Invalid next\.config\.(?:js|mjs|ts) options detected/u,
  ],
  ['missing-production-build', /Could not find a production build/u],
  [
    'missing-project-directory',
    /Invalid project directory provided, no such directory:/u,
  ],
  [
    'unsupported-cli-option',
    /unknown option|unrecognized option|ERR_PARSE_ARGS_UNKNOWN_OPTION/iu,
  ],
  ['node-option-rejected', /bad option:|is not allowed in NODE_OPTIONS/u],
  ['runtime-syntax', /\bSyntaxError:/u],
  ['out-of-memory', /heap out of memory|\bENOMEM\b/iu],
]);

export const startupCategories = Object.freeze(patterns.map(([name]) => name));
export const startupStreamLimit = 16384;

export function projectStartupOutput(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    !Array.isArray(value.categories) ||
    value.categories.length > startupCategories.length ||
    new Set(value.categories).size !== value.categories.length ||
    value.categories.some((entry) => !startupCategories.includes(entry)) ||
    typeof value.truncated !== 'boolean'
  )
    throw new Error('Web startup output invalid');
  return { categories: [...value.categories], truncated: value.truncated };
}

// Keep only the first fixed byte budget. Later output is drained without scanning.
export function startupOutputCapture() {
  const streams = new Map(
    ['stdout', 'stderr'].map((name) => [
      name,
      {
        bytes: Buffer.alloc(startupStreamLimit),
        length: 0,
      },
    ])
  );
  let truncated = false;
  let projected;
  return {
    append(stream, chunk) {
      const target = streams.get(stream);
      if (!target || !Buffer.isBuffer(chunk) || projected) return;
      const count = Math.min(chunk.length, startupStreamLimit - target.length);
      if (count < chunk.length) truncated = true;
      if (count) {
        chunk.copy(target.bytes, target.length, 0, count);
        target.length += count;
      }
    },
    truncate() {
      if (!projected) truncated = true;
    },
    receipt() {
      if (!projected) {
        const texts = [...streams.values()].map(({ bytes, length }) =>
          bytes.toString('utf8', 0, length)
        );
        projected = {
          categories: patterns
            .filter(([, pattern]) => texts.some((text) => pattern.test(text)))
            .map(([name]) => name),
          truncated,
        };
        streams.clear();
      }
      return projectStartupOutput(projected);
    },
  };
}
