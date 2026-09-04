#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const DEFAULT_ROOTS = ['scripts'];
const DEFAULT_SUPPLEMENTAL_PATHS = [
  '.github/actions/run-with-turbo-remote-cache/action.test.js',
  'apps/database/scripts/delete-storage-buckets.test.js',
  'apps/database/scripts/new-migration.test.js',
  'apps/database/scripts/rls-perf-initplan-migration.test.js',
  'apps/database/scripts/seed-sql.test.js',
  'plugins/tuturuuu/skills/tuturuuu-pr-merge-sync/scripts/watchers.test.mjs',
];

// These trees contain dependencies, generated output, fixtures, or test output.
// They are not repository-owned Node test roots.
const DEFAULT_EXCLUDED_DIRECTORIES = new Set([
  '__fixtures__',
  'coverage',
  'dist',
  'fixtures',
  'generated',
  'node_modules',
]);

function toRepoPath(repoRoot, filePath) {
  return path.relative(repoRoot, filePath).split(path.sep).join('/');
}

function isScriptTest(filePath) {
  return filePath.endsWith('.test.js') || filePath.endsWith('.test.mjs');
}

function walkDirectory(directory, options, selected) {
  const entries = options.fsImpl.readdirSync(directory, {
    withFileTypes: true,
  });

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!options.excludedDirectories.has(entry.name)) {
        walkDirectory(entryPath, options, selected);
      }
      continue;
    }

    if (entry.isFile() && isScriptTest(entry.name)) {
      selected.add(toRepoPath(options.repoRoot, entryPath));
    }
  }
}

function addConfiguredPath(configuredPath, options, selected) {
  const absolutePath = path.resolve(options.repoRoot, configuredPath);
  if (!options.fsImpl.existsSync(absolutePath)) {
    throw new Error(
      `Configured script-test root is missing: ${configuredPath}`
    );
  }

  const stat = options.fsImpl.statSync(absolutePath);
  if (stat.isDirectory()) {
    walkDirectory(absolutePath, options, selected);
    return;
  }

  if (!stat.isFile() || !isScriptTest(absolutePath)) {
    throw new Error(
      `Configured script-test path is not a test: ${configuredPath}`
    );
  }
  selected.add(toRepoPath(options.repoRoot, absolutePath));
}

function discoverScriptTests({
  repoRoot = path.resolve(__dirname, '..'),
  roots = DEFAULT_ROOTS,
  supplementalPaths = DEFAULT_SUPPLEMENTAL_PATHS,
  excludedDirectories = DEFAULT_EXCLUDED_DIRECTORIES,
  fsImpl = fs,
} = {}) {
  const options = {
    excludedDirectories: new Set(excludedDirectories),
    fsImpl,
    repoRoot,
  };
  const selected = new Set();

  for (const root of roots) {
    addConfiguredPath(root, options, selected);
  }
  for (const supplementalPath of supplementalPaths) {
    addConfiguredPath(supplementalPath, options, selected);
  }

  const files = [...selected].sort((left, right) => left.localeCompare(right));
  if (files.length === 0) {
    throw new Error(
      `Script-test discovery returned zero files for roots: ${roots.join(', ')}`
    );
  }
  return files;
}

function runScriptTests({
  repoRoot = path.resolve(__dirname, '..'),
  listOnly = false,
  spawnImpl = spawnSync,
  ...discoveryOptions
} = {}) {
  const files = discoverScriptTests({ repoRoot, ...discoveryOptions });
  console.log(`Discovered ${files.length} script test files.`);

  if (listOnly) {
    for (const file of files) console.log(file);
    return 0;
  }

  const result = spawnImpl(process.execPath, ['--test', ...files], {
    cwd: repoRoot,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

function main(argv = process.argv.slice(2)) {
  const unknownArguments = argv.filter((argument) => argument !== '--list');
  if (unknownArguments.length > 0) {
    throw new Error(`Unknown argument: ${unknownArguments[0]}`);
  }
  return runScriptTests({ listOnly: argv.includes('--list') });
}

if (require.main === module) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

module.exports = {
  DEFAULT_EXCLUDED_DIRECTORIES,
  DEFAULT_ROOTS,
  DEFAULT_SUPPLEMENTAL_PATHS,
  discoverScriptTests,
  isScriptTest,
  main,
  runScriptTests,
};
