#!/usr/bin/env node
// Copy apps/web's local env file to app-local env files for quick dev setup.

const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = path.resolve(__dirname, '..');
const DEFAULT_SOURCE = path.join('apps', 'web', '.env.local');
const DEFAULT_ENV_FILE_NAME = '.env.local';

function toRelative(rootDir, filePath) {
  return path.relative(rootDir, filePath) || path.basename(filePath);
}

function resolveInsideRoot(rootDir, maybeRelativePath) {
  return path.isAbsolute(maybeRelativePath)
    ? maybeRelativePath
    : path.join(rootDir, maybeRelativePath);
}

function listAppEnvTargets({
  envFileName = DEFAULT_ENV_FILE_NAME,
  fsImpl = fs,
  includeMissing = false,
  rootDir = ROOT_DIR,
  sourcePath = path.join(rootDir, DEFAULT_SOURCE),
} = {}) {
  const appsDir = path.join(rootDir, 'apps');
  const targets = [];

  if (!fsImpl.existsSync(appsDir)) {
    return targets;
  }

  for (const entry of fsImpl.readdirSync(appsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }

    const targetPath = path.join(appsDir, entry.name, envFileName);
    if (path.resolve(targetPath) === path.resolve(sourcePath)) {
      continue;
    }

    const exists = fsImpl.existsSync(targetPath);
    if (!exists && !includeMissing) {
      continue;
    }

    targets.push({
      app: entry.name,
      exists,
      path: targetPath,
      relativePath: toRelative(rootDir, targetPath),
    });
  }

  return targets.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

function syncAppEnvFiles({
  dryRun = false,
  envFileName = DEFAULT_ENV_FILE_NAME,
  fsImpl = fs,
  includeMissing = false,
  rootDir = ROOT_DIR,
  source = DEFAULT_SOURCE,
} = {}) {
  const sourcePath = resolveInsideRoot(rootDir, source);

  if (!fsImpl.existsSync(sourcePath)) {
    throw new Error(
      `Missing source env file: ${toRelative(rootDir, sourcePath)}`
    );
  }

  const targets = listAppEnvTargets({
    envFileName,
    fsImpl,
    includeMissing,
    rootDir,
    sourcePath,
  });

  if (!dryRun) {
    const content = fsImpl.readFileSync(sourcePath);
    for (const target of targets) {
      fsImpl.writeFileSync(target.path, content);
    }
  }

  return {
    dryRun,
    source: toRelative(rootDir, sourcePath),
    targets,
  };
}

function usage() {
  return `Usage: bun dev:sync:apps [--dry-run] [--include-missing] [--source <path>] [--env-file <name>]

Copy apps/web/.env.local to app-local .env.local files for quick local development.

Options:
  --dry-run          Show target files without writing.
  --include-missing  Create missing app env files too. By default only existing
                     apps/*/.env.local files are replaced.
  --source <path>    Source env file. Defaults to apps/web/.env.local.
  --env-file <name>  Target env filename. Defaults to .env.local.
`;
}

function parseArgs(argv) {
  const options = {
    dryRun: false,
    envFileName: DEFAULT_ENV_FILE_NAME,
    includeMissing: false,
    source: DEFAULT_SOURCE,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    if (arg === '--include-missing') {
      options.includeMissing = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }
    if (arg === '--source') {
      options.source = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg.startsWith('--source=')) {
      options.source = arg.slice('--source='.length);
      continue;
    }
    if (arg === '--env-file') {
      options.envFileName = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg.startsWith('--env-file=')) {
      options.envFileName = arg.slice('--env-file='.length);
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  if (!options.source) {
    throw new Error('Missing value for --source');
  }
  if (!options.envFileName) {
    throw new Error('Missing value for --env-file');
  }
  if (options.envFileName.includes('/') || options.envFileName.includes('\\')) {
    throw new Error('--env-file must be a filename, not a path');
  }

  return options;
}

function formatResult(result) {
  const action = result.dryRun ? 'Would copy' : 'Copied';
  const lines = [
    `${action} ${result.source} to ${result.targets.length} app env file(s).`,
  ];

  for (const target of result.targets) {
    lines.push(`- ${target.relativePath}${target.exists ? '' : ' (created)'}`);
  }

  if (result.targets.length === 0) {
    lines.push(
      'No targets found. Pass `--include-missing` to create missing app env files.'
    );
  }

  return `${lines.join('\n')}\n`;
}

function runCli({
  argv = process.argv.slice(2),
  error = console.error,
  fsImpl = fs,
  log = console.log,
  rootDir = ROOT_DIR,
} = {}) {
  try {
    const options = parseArgs(argv);

    if (options.help) {
      log(usage());
      return 0;
    }

    const result = syncAppEnvFiles({ ...options, fsImpl, rootDir });
    log(formatResult(result));
    return 0;
  } catch (err) {
    error(err instanceof Error ? err.message : String(err));
    error(usage());
    return 1;
  }
}

if (require.main === module) {
  process.exitCode = runCli();
}

module.exports = {
  DEFAULT_ENV_FILE_NAME,
  DEFAULT_SOURCE,
  formatResult,
  listAppEnvTargets,
  parseArgs,
  runCli,
  syncAppEnvFiles,
};
