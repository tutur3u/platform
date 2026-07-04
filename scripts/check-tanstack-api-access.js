#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = path.resolve(__dirname, '..');
const TANSTACK_SOURCE_DIR = path.join('apps', 'tanstack-web', 'src');
const SOURCE_FILE_PATTERN = /\.(ts|tsx)$/u;
const IGNORED_FILE_PATTERN =
  /(?:^|[/.])(?:routeTree\.gen|.*\.(?:test|spec|stories))\.(?:ts|tsx)$/u;
const PROTECTED_RELATIVE_PATH_PATTERN = String.raw`(?:\/api(?:\/|$)|\/internal(?:\/|$)|\/trpc(?:\/|$))`;
const RAW_PROTECTED_FETCH_PATTERN = new RegExp(
  String.raw`\bfetch\s*\(\s*(?:["'\x60]\s*${PROTECTED_RELATIVE_PATH_PATTERN}|new\s+Request\s*\(\s*["'\x60]\s*${PROTECTED_RELATIVE_PATH_PATTERN})`,
  'gu'
);
const RAW_PROTECTED_AXIOS_PATTERN = new RegExp(
  String.raw`\baxios\.(?:delete|get|head|options|patch|post|put)\s*\(\s*["'\x60]\s*${PROTECTED_RELATIVE_PATH_PATTERN}`,
  'gu'
);
const SUPABASE_IMPORT_PATTERN =
  /\bfrom\s+["'](?:@tuturuuu\/supabase(?:\/[^"']*)?|@supabase\/[^"']+)["']/gu;
const SUPABASE_CLIENT_PATTERN =
  /\b(?:createBrowserClient|createServerClient|createClient|supabase\s*\.\s*(?:auth|channel|from|functions|rpc|storage))/gu;

const CHECKS = [
  {
    message:
      'Use packages/internal-api helpers or a TanStack server function instead of raw protected app API fetches.',
    pattern: RAW_PROTECTED_FETCH_PATTERN,
  },
  {
    message:
      'Use packages/internal-api helpers or a TanStack server function instead of raw protected app API axios calls.',
    pattern: RAW_PROTECTED_AXIOS_PATTERN,
  },
  {
    message:
      'Do not import Supabase clients in apps/tanstack-web; keep protected data behind server-owned APIs.',
    pattern: SUPABASE_IMPORT_PATTERN,
  },
  {
    message:
      'Do not create or use Supabase clients in apps/tanstack-web; call server-owned API facades instead.',
    pattern: SUPABASE_CLIENT_PATTERN,
    requires: (source) =>
      /(?:@tuturuuu\/supabase|@supabase\/|createBrowserClient|createServerClient|\bsupabase\s*\.\s*(?:auth|channel|from|functions|rpc|storage))/u.test(
        source
      ),
  },
];

function toPosixPath(filePath) {
  return filePath.split(path.sep).join('/');
}

function walkSourceFiles(
  rootDir = ROOT_DIR,
  relativeDir = TANSTACK_SOURCE_DIR
) {
  const absoluteDir = path.join(rootDir, relativeDir);

  if (!fs.existsSync(absoluteDir)) {
    return [];
  }

  return fs.readdirSync(absoluteDir).flatMap((entry) => {
    const relativePath = path.join(relativeDir, entry);
    const absolutePath = path.join(rootDir, relativePath);
    const stat = fs.statSync(absolutePath);

    if (stat.isDirectory()) {
      return walkSourceFiles(rootDir, relativePath);
    }

    const normalizedPath = toPosixPath(relativePath);

    if (
      !SOURCE_FILE_PATTERN.test(entry) ||
      IGNORED_FILE_PATTERN.test(normalizedPath)
    ) {
      return [];
    }

    return [normalizedPath];
  });
}

function lineAndColumn(source, index) {
  const prefix = source.slice(0, index);
  const lines = prefix.split(/\r?\n/u);
  const line = lines.length;
  const column = lines[lines.length - 1].length + 1;

  return { column, line };
}

function scanSource(source, filePath) {
  const violations = [];

  for (const check of CHECKS) {
    if (check.requires && !check.requires(source)) {
      continue;
    }

    check.pattern.lastIndex = 0;

    for (const match of source.matchAll(check.pattern)) {
      const { column, line } = lineAndColumn(source, match.index ?? 0);
      violations.push({
        column,
        filePath,
        line,
        message: check.message,
      });
    }
  }

  return violations;
}

function findTanstackApiAccessViolations(rootDir = ROOT_DIR) {
  return walkSourceFiles(rootDir).flatMap((filePath) => {
    const source = fs.readFileSync(path.join(rootDir, filePath), 'utf8');
    return scanSource(source, filePath);
  });
}

function formatViolations(violations) {
  return violations
    .map(
      (violation) =>
        `${violation.filePath}:${violation.line}:${violation.column}: ${violation.message}`
    )
    .join('\n');
}

if (require.main === module) {
  const violations = findTanstackApiAccessViolations();

  if (violations.length > 0) {
    console.error(
      [
        'TanStack migration code must not call protected app APIs or Supabase directly.',
        'Move access through packages/internal-api helpers, TanStack server functions, or Rust backend endpoints.',
        '',
        formatViolations(violations),
      ].join('\n')
    );
    process.exit(1);
  }

  console.log('TanStack API access guard passed.');
}

module.exports = {
  findTanstackApiAccessViolations,
  formatViolations,
  scanSource,
  walkSourceFiles,
};
