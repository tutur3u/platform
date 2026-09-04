#!/usr/bin/env node

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_LIMIT = 700;
const ROOT_DIR = path.resolve(__dirname, '..');
const SOURCE_EXTENSIONS = new Set([
  '.cjs',
  '.dart',
  '.js',
  '.jsx',
  '.mjs',
  '.py',
  '.rs',
  '.sh',
  '.sql',
  '.ts',
  '.tsx',
]);
const EXCLUDED_COMPONENTS = new Set([
  '.next',
  '.worktrees',
  'coverage',
  'dist',
  'node_modules',
  'target',
]);
const EXACT_EXCLUSIONS = new Set(['packages/types/src/supabase.ts']);
const GENERATED_DART_SUFFIXES = ['.freezed.dart', '.g.dart', '.gen.dart'];
const sourceSizeCheck = {
  name: 'source-size',
  command: 'bun',
  args: ['check:source-size'],
  parseOutput: (stdout) => {
    const match = stdout.match(
      /Source-size check passed \((\d+) changed authored source files? checked\)/iu
    );
    return match ? `${match[1]} changed source files checked` : 'Passed';
  },
};

function normalizePath(filePath) {
  return filePath
    .replaceAll('\\', '/')
    .replace(/^\.\//u, '')
    .replace(/\/+/gu, '/');
}

function isAuthoredSourcePath(filePath) {
  const normalized = normalizePath(filePath);
  const components = normalized.split('/');
  const basename = components.at(-1) ?? '';

  if (
    !normalized ||
    EXACT_EXCLUSIONS.has(normalized) ||
    components.some((component) => EXCLUDED_COMPONENTS.has(component)) ||
    basename === 'routeTree.gen.ts' ||
    GENERATED_DART_SUFFIXES.some((suffix) => basename.endsWith(suffix))
  ) {
    return false;
  }

  return SOURCE_EXTENSIONS.has(path.posix.extname(basename));
}

function countPhysicalLines(content) {
  const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content);

  if (buffer.length === 0) {
    return 0;
  }

  let lineFeeds = 0;
  for (const byte of buffer) {
    if (byte === 10) {
      lineFeeds += 1;
    }
  }

  return lineFeeds + (buffer.at(-1) === 10 ? 0 : 1);
}

function isBinaryContent(content) {
  const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content);
  return buffer.includes(0);
}

function parseNameStatusZ(output, source) {
  const fields = output.split('\0');
  const changes = [];

  for (let index = 0; index < fields.length; ) {
    const rawStatus = fields[index++];
    if (!rawStatus) {
      continue;
    }

    const status = rawStatus[0];
    if (status === 'R' || status === 'C') {
      const oldPath = normalizePath(fields[index++] ?? '');
      const currentPath = normalizePath(fields[index++] ?? '');
      changes.push({
        basePath: oldPath,
        currentPath,
        deleted: false,
        source,
        status,
      });
      continue;
    }

    const currentPath = normalizePath(fields[index++] ?? '');
    changes.push({
      basePath: currentPath,
      currentPath,
      deleted: status === 'D',
      source,
      status,
    });
  }

  return changes;
}

function parseUntrackedZ(output) {
  return output
    .split('\0')
    .filter(Boolean)
    .map((filePath) => {
      const currentPath = normalizePath(filePath);
      return {
        basePath: currentPath,
        currentPath,
        deleted: false,
        source: 'untracked',
        status: 'A',
      };
    });
}

function runGitText(execFile, rootDir, args) {
  return execFile('git', args, {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function tryGitText(execFile, rootDir, args) {
  try {
    return runGitText(execFile, rootDir, args).trim();
  } catch {
    return null;
  }
}

function verifyCommit(ref, options) {
  const resolved = tryGitText(options.execFile, options.rootDir, [
    'rev-parse',
    '--verify',
    `${ref}^{commit}`,
  ]);

  if (!resolved) {
    throw new Error(`comparison base ${JSON.stringify(ref)} is not a commit`);
  }

  return resolved;
}

function resolveComparisonBase(options = {}) {
  const argv = options.argv ?? process.argv.slice(2);
  const env = options.env ?? process.env;
  const execFile = options.execFile ?? execFileSync;
  const rootDir = options.rootDir ?? ROOT_DIR;
  const gitOptions = { execFile, rootDir };
  const baseFlagIndex = argv.indexOf('--base');

  if (baseFlagIndex !== -1) {
    const explicitBase = argv[baseFlagIndex + 1];
    if (!explicitBase || explicitBase.startsWith('--')) {
      throw new Error('--base requires a commit SHA');
    }
    return verifyCommit(explicitBase, gitOptions);
  }

  if (env.SOURCE_SIZE_BASE_SHA) {
    return verifyCommit(env.SOURCE_SIZE_BASE_SHA, gitOptions);
  }

  if (env.GITHUB_BASE_REF) {
    const remoteBase = `origin/${env.GITHUB_BASE_REF}`;
    const mergeBase = tryGitText(execFile, rootDir, [
      'merge-base',
      'HEAD',
      remoteBase,
    ]);
    if (!mergeBase) {
      throw new Error(
        `cannot resolve merge base for HEAD and ${remoteBase}; provide SOURCE_SIZE_BASE_SHA`
      );
    }
    return mergeBase;
  }

  const head = tryGitText(execFile, rootDir, ['rev-parse', '--verify', 'HEAD']);
  const mainMergeBase = tryGitText(execFile, rootDir, [
    'merge-base',
    'HEAD',
    'origin/main',
  ]);

  if (mainMergeBase && mainMergeBase !== head) {
    return mainMergeBase;
  }

  return tryGitText(execFile, rootDir, [
    'rev-parse',
    '--verify',
    'HEAD^{commit}^',
  ]);
}

function mergeChanges(changeGroups) {
  const merged = new Map();

  for (const changes of changeGroups) {
    for (const change of changes) {
      if (!change.currentPath) {
        continue;
      }
      const previous = merged.get(change.currentPath);
      merged.set(change.currentPath, {
        ...change,
        basePath:
          change.status === 'R' || change.status === 'C'
            ? change.basePath
            : (previous?.basePath ?? change.basePath),
        sources: [...(previous?.sources ?? []), change.source],
      });
    }
  }

  return [...merged.values()].sort((left, right) =>
    left.currentPath.localeCompare(right.currentPath)
  );
}

function discoverChangedFiles(base, options = {}) {
  const execFile = options.execFile ?? execFileSync;
  const rootDir = options.rootDir ?? ROOT_DIR;
  const commands = [
    {
      args: [
        'diff',
        '--name-status',
        '-z',
        '--find-renames',
        base,
        'HEAD',
        '--',
      ],
      source: 'committed',
    },
    {
      args: ['diff', '--cached', '--name-status', '-z', '--find-renames', '--'],
      source: 'staged',
    },
    {
      args: ['diff', '--name-status', '-z', '--find-renames', '--'],
      source: 'unstaged',
    },
  ];
  const groups = commands.map(({ args, source }) =>
    parseNameStatusZ(runGitText(execFile, rootDir, args), source)
  );
  const untracked = runGitText(execFile, rootDir, [
    'ls-files',
    '--others',
    '--exclude-standard',
    '-z',
    '--',
  ]);
  groups.push(parseUntrackedZ(untracked));
  return mergeChanges(groups);
}

function readBaseFile(base, filePath, options = {}) {
  const execFile = options.execFile ?? execFileSync;
  const rootDir = options.rootDir ?? ROOT_DIR;

  try {
    return execFile('git', ['show', `${base}:${filePath}`], {
      cwd: rootDir,
      encoding: null,
      maxBuffer: 32 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch {
    return null;
  }
}

function evaluateChangedFiles(changes, base, options = {}) {
  const fsImpl = options.fsImpl ?? fs;
  const limit = options.limit ?? DEFAULT_LIMIT;
  const rootDir = options.rootDir ?? ROOT_DIR;
  const readBase =
    options.readBase ?? ((filePath) => readBaseFile(base, filePath, options));
  const violations = [];
  let checked = 0;

  for (const change of changes) {
    if (change.deleted || !isAuthoredSourcePath(change.currentPath)) {
      continue;
    }

    const absolutePath = path.join(rootDir, change.currentPath);
    if (
      !fsImpl.existsSync(absolutePath) ||
      !fsImpl.statSync(absolutePath).isFile()
    ) {
      continue;
    }

    const currentContent = fsImpl.readFileSync(absolutePath);
    if (isBinaryContent(currentContent)) {
      continue;
    }

    checked += 1;
    const currentLines = countPhysicalLines(currentContent);
    const baseContent = readBase(change.basePath);

    if (baseContent === null || isBinaryContent(baseContent)) {
      if (currentLines > limit) {
        violations.push({
          baseLines: null,
          currentLines,
          path: change.currentPath,
          reason: 'new',
        });
      }
      continue;
    }

    const baseLines = countPhysicalLines(baseContent);
    if (currentLines > limit && currentLines > baseLines) {
      violations.push({
        baseLines,
        currentLines,
        path: change.currentPath,
        reason: baseLines <= limit ? 'crossed' : 'grew',
      });
    }
  }

  return { checked, violations };
}

function formatViolations(violations, limit = DEFAULT_LIMIT) {
  return [
    `Source-size ceiling violations (limit: ${limit} lines):`,
    ...violations.map((violation) => {
      if (violation.reason === 'new') {
        return `- ${violation.path}: ${violation.currentLines} lines (new file)`;
      }
      return `- ${violation.path}: ${violation.currentLines} lines (base: ${violation.baseLines}; ${violation.reason})`;
    }),
    'Split the file or reduce it without adding a source-size exclusion.',
  ].join('\n');
}

function runSourceSizeCheck(options = {}) {
  const stderr = options.stderr ?? process.stderr;
  const stdout = options.stdout ?? process.stdout;

  try {
    const base = resolveComparisonBase(options);
    if (!base) {
      throw new Error(
        'cannot resolve a stable comparison base without fetching; pass --base <sha> or SOURCE_SIZE_BASE_SHA'
      );
    }

    const changes = discoverChangedFiles(base, options);
    const result = evaluateChangedFiles(changes, base, options);
    if (result.violations.length > 0) {
      stderr.write(`${formatViolations(result.violations, options.limit)}\n`);
      return 1;
    }

    stdout.write(
      `Source-size check passed (${result.checked} changed authored source file${result.checked === 1 ? '' : 's'} checked).\n`
    );
    return 0;
  } catch (error) {
    stderr.write(`Source-size check failed: ${error.message}\n`);
    return 1;
  }
}

if (require.main === module) {
  process.exitCode = runSourceSizeCheck();
}

module.exports = {
  DEFAULT_LIMIT,
  countPhysicalLines,
  discoverChangedFiles,
  evaluateChangedFiles,
  formatViolations,
  isAuthoredSourcePath,
  isBinaryContent,
  mergeChanges,
  normalizePath,
  parseNameStatusZ,
  parseUntrackedZ,
  readBaseFile,
  resolveComparisonBase,
  runSourceSizeCheck,
  sourceSizeCheck,
};
