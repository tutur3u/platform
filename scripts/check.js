#!/usr/bin/env node

/**
 * Unified Check Runner
 *
 * Runs all quality checks (formatting, tests, type-check, i18n, migrations),
 * plus path-sensitive checks such as Discord Python validation, and displays a
 * summary at the end.
 *
 * Usage:
 *   node scripts/check.js [--table] [--timing] [--details] [--run-all] [--force-now]
 *   bun check [--table] [--timing] [--details] [--run-all] [--force-now]
 *
 * Exit codes:
 *   0 - All checks passed
 *   1 - One or more checks failed
 */

const crypto = require('node:crypto');
const { execFileSync, spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT_DIR = path.resolve(__dirname, '..');
const CHECK_QUEUE_ROOT = path.join(os.tmpdir(), 'tuturuuu-bun-check');
const CHECK_QUEUE_POLL_MS = 250;

const useTable = process.argv.includes('--table');
const showTiming = process.argv.includes('--timing');
const showDetails = process.argv.includes('--details');
const runAll = process.argv.includes('--run-all');
const forceNow = process.argv.includes('--force-now');
const failFast = !runAll;
const failFastRequiredChecks = new Set(['tests', 'type-check']);
const DISCORD_PYTHON_PATH_PREFIX = 'apps/discord/';
const DISCORD_PYTHON_WORKFLOW_PATH = '.github/workflows/discord-python-ci.yml';
const PLATFORM_RELEASE_VERSION_PATHS = new Set([
  '.release-please-manifest.json',
  'platform-version.txt',
  'release-please-config.json',
]);
let activeCheckProcess = null;
let activeQueueHandle = null;
let shutdownSignalHandled = false;

/**
 * Strip ANSI escape codes from a string
 */
const ESC = String.fromCharCode(27);
const ANSI_REGEX = new RegExp(`${ESC}\\[[0-9;]*m`, 'g');
function stripAnsi(str) {
  return str.replace(ANSI_REGEX, '');
}

function getLastNumberMatch(output, regex) {
  let lastMatch = null;

  for (const match of output.matchAll(regex)) {
    lastMatch = match;
  }

  return lastMatch ? Number.parseInt(lastMatch[1], 10) : 0;
}

function parseBiomeIssueStats(output) {
  const clean = stripAnsi(output);
  const filesChecked = getLastNumberMatch(
    clean,
    /\bChecked\s+(\d+)\s+files?\b/giu
  );
  const errors = getLastNumberMatch(clean, /\b(\d+)\s+errors?\b/giu);
  const warnings = getLastNumberMatch(clean, /\b(\d+)\s+warnings?\b/giu);
  const infos = getLastNumberMatch(clean, /\b(\d+)\s+infos?\b/giu);
  const totalFromSummary = getLastNumberMatch(
    clean,
    /\bFound\s+(\d+)\s+(?:lint\s+|formatting\s+)?issues?\b/giu
  );
  const typedTotal = errors + warnings + infos;

  return {
    errors,
    filesChecked,
    infos,
    totalIssues: Math.max(typedTotal, totalFromSummary),
    warnings,
  };
}

function formatBiomeIssueStats(stats) {
  return `${stats.errors} error(s), ${stats.warnings} warning(s), ${stats.infos} info(s)`;
}

function validateBiomeOutput(output) {
  const stats = parseBiomeIssueStats(output);

  if (stats.totalIssues === 0) {
    return null;
  }

  return `Found ${stats.totalIssues} Biome issue(s): ${formatBiomeIssueStats(stats)}`;
}

/**
 * Calculate the display width of a string
 */
function getDisplayWidth(str) {
  return stripAnsi(str).length;
}

/**
 * Filter node --test TAP output down to failures and summary lines
 */
function formatScriptTestErrors(stdout, stderr) {
  const lines = stdout.split(/\r?\n/);
  const failureBlocks = [];
  const summaryLines = [];
  let pendingSubtest = null;
  let currentFailure = null;

  function flushFailure() {
    if (currentFailure && currentFailure.length > 0) {
      failureBlocks.push(currentFailure.join('\n').trimEnd());
    }
    currentFailure = null;
  }

  for (const line of lines) {
    if (currentFailure) {
      if (/^(# Subtest: |ok \d+ - |not ok \d+ - |1\.\.)/.test(line)) {
        flushFailure();
      } else {
        currentFailure.push(line);
        continue;
      }
    }

    if (line.startsWith('# Subtest: ')) {
      pendingSubtest = line;
      continue;
    }

    if (/^not ok \d+ - /.test(line)) {
      currentFailure = pendingSubtest ? [pendingSubtest, line] : [line];
      pendingSubtest = null;
      continue;
    }

    if (/^ok \d+ - /.test(line)) {
      pendingSubtest = null;
      continue;
    }

    if (
      /^1\.\./.test(line) ||
      /^# (tests|suites|pass|fail|cancelled|skipped|todo|duration_ms)\b/.test(
        line
      )
    ) {
      summaryLines.push(line);
    }
  }

  flushFailure();

  const stderrLines = stderr.split(/\r?\n/).filter(Boolean);
  const sections = [...failureBlocks];

  if (summaryLines.length > 0) {
    sections.push(summaryLines.join('\n'));
  }

  if (stderrLines.length > 0) {
    sections.push(stderrLines.join('\n'));
  }

  return sections.join('\n\n');
}

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

// Check definitions - ordered by priority: tests/type-check first (fail-fast protected), then fast checks, then slow ones
const checks = [
  {
    name: 'tests',
    command: 'bun',
    args: showDetails
      ? ['run', 'test']
      : ['run', 'test', '--', '--output-logs=errors-only'],
    parseOutput: (stdout) => {
      const clean = stripAnsi(stdout);
      const testMatches = [...clean.matchAll(/Tests\s+(\d+)\s+passed/gi)];
      let totalTests = 0;
      for (const match of testMatches) {
        totalTests += parseInt(match[1], 10);
      }
      if (totalTests > 0) {
        return `${totalTests} tests passed`;
      }
      return 'All passed';
    },
  },
  {
    name: 'type-check',
    command: 'bun',
    args: showDetails
      ? ['type-check']
      : ['type-check', '--', '--output-logs=errors-only'],
    parseOutput: (stdout) => {
      const clean = stripAnsi(stdout);
      const tasksMatch = clean.match(
        /Tasks:\s+(\d+)\s+successful,\s+(\d+)\s+total/i
      );
      if (tasksMatch) {
        return `${tasksMatch[1]}/${tasksMatch[2]} packages`;
      }
      return 'Passed';
    },
  },
  {
    name: 'biome',
    command: 'bun',
    args: ['biome', 'check', '--error-on-warnings'],
    parseOutput: (stdout) => {
      const stats = parseBiomeIssueStats(stdout);
      return stats.filesChecked > 0
        ? `${stats.filesChecked} files checked`
        : 'Passed';
    },
    validateOutput: validateBiomeOutput,
  },
  {
    name: 'server-console',
    command: 'node',
    args: ['scripts/check-server-console.js'],
    parseOutput: () => 'Server logs use native console methods',
  },
  {
    name: 'internal-app-auth',
    command: 'node',
    args: ['scripts/check-internal-app-auth.js'],
    parseOutput: () => 'Registered app auth surfaces use app sessions',
  },
  {
    name: 'tanstack-api-access',
    command: 'node',
    args: ['scripts/check-tanstack-api-access.js'],
    parseOutput: () => 'TanStack app uses server-owned API facades',
  },
  {
    name: 'legacy-api-route-wrappers',
    command: 'node',
    args: ['scripts/generate-web-api-route-wrappers.js', '--check'],
    parseOutput: () => 'Legacy API routes have concrete wrappers',
  },
  {
    name: 'platform-release-version',
    command: 'node',
    args: ['scripts/sync-platform-release-version.js', '--check'],
    parseOutput: (stdout) => {
      const clean = stripAnsi(stdout);
      const match = clean.match(/aligned at ([0-9A-Za-z.+-]+)/i);
      return match ? `Platform release ${match[1]}` : 'Release files aligned';
    },
  },
  {
    name: 'mobile-dependency-compat',
    command: 'node',
    args: ['scripts/check-mobile-dependencies.js'],
    parseOutput: (stdout) => {
      if (stdout.includes('Mobile dependency compatibility checks passed')) {
        return 'Apple CI-compatible dependency locks';
      }
      return 'Passed';
    },
  },
  {
    name: 'mobile-ios-project-settings',
    command: 'node',
    args: ['scripts/check-mobile-ios-project.js'],
    parseOutput: (stdout) => {
      if (stdout.includes('Mobile iOS project settings checks passed')) {
        return 'Xcode recommended project settings';
      }
      return 'Passed';
    },
  },
  {
    name: 'script-tests',
    command: 'bun',
    args: ['run', 'test:scripts'],
    errorsOnly: true,
    formatFailureOutput: formatScriptTestErrors,
    parseOutput: (stdout) => {
      const clean = stripAnsi(stdout);
      const match = clean.match(/# tests (\d+)/i);
      if (match) {
        return `${match[1]} tests passed`;
      }
      return 'Passed';
    },
  },
  {
    name: 'i18n-check',
    command: 'bun',
    args: ['i18n:check'],
    parseOutput: (stdout) => {
      if (
        stdout.includes('No missing keys found') &&
        stdout.includes('No invalid translations found')
      ) {
        return 'No missing/invalid keys';
      }
      return 'Passed';
    },
  },
  {
    name: 'i18n-key-parity',
    command: 'bun',
    args: ['i18n:key-parity'],
    parseOutput: (stdout) => {
      if (
        stdout.includes('All translation files have matching keys') ||
        stdout.includes('All keys are in sync')
      ) {
        return 'All keys in sync (en/vi)';
      }
      return 'Passed';
    },
  },
  {
    name: 'i18n-sort',
    command: 'bun',
    args: ['i18n:sort:check'],
    parseOutput: (stdout) => {
      if (stdout.includes('All translation files are properly sorted')) {
        return 'All files properly sorted';
      }
      return 'Passed';
    },
  },
  {
    name: 'i18n-namespace-check',
    command: 'bun',
    args: ['i18n:namespace-check'],
    parseOutput: (stdout) => {
      if (stdout.includes('All namespace and key checks passed')) {
        return 'All namespaces & keys present';
      }
      if (stdout.includes('All namespace checks passed')) {
        return 'All namespaces present';
      }
      return 'Passed';
    },
  },
  {
    name: 'migration-timestamps',
    command: 'bun',
    args: ['migration:timestamps:check'],
    parseOutput: (stdout) => {
      const clean = stripAnsi(stdout);
      const match = clean.match(/Found (\d+) migration file/i);
      if (match && clean.includes('All migration timestamps are valid')) {
        return `All ${match[1]} valid`;
      }
      if (clean.includes('All migration timestamps are valid')) {
        return 'All valid';
      }
      return 'Passed';
    },
  },
];

const discordPythonCheck = {
  name: 'discord-python',
  command: 'node',
  args: ['scripts/check-discord-python.js'],
  parseOutput: (stdout) => {
    if (stdout.includes('Discord Python checks passed')) {
      return 'Ruff, mypy, pytest, compile/import passed';
    }
    return 'Passed';
  },
};

function normalizeChangedFilePath(filePath) {
  return filePath.trim().replace(/\\/g, '/').replace(/^\.\//, '');
}

function splitChangedFiles(output) {
  return output.split(/\r?\n/).map(normalizeChangedFilePath).filter(Boolean);
}

function getChangedFiles(options = {}) {
  const execFile = options.execFile ?? execFileSync;
  const rootDir = options.rootDir ?? ROOT_DIR;
  const changedFiles = new Set();
  const gitCommands = [
    ['diff', '--name-only', '--diff-filter=ACMRD', 'HEAD', '--'],
    ['ls-files', '--others', '--exclude-standard', '--'],
  ];

  for (const args of gitCommands) {
    try {
      const output = execFile('git', args, {
        cwd: rootDir,
        encoding: 'utf8',
      });

      for (const filePath of splitChangedFiles(output)) {
        changedFiles.add(filePath);
      }
    } catch {
      // Keep bun check usable outside a Git checkout or before an initial commit.
    }
  }

  return [...changedFiles].sort();
}

function touchesDiscordPython(files) {
  return files.some((file) => {
    const normalizedFile = normalizeChangedFilePath(file);

    return (
      normalizedFile === 'apps/discord' ||
      normalizedFile.startsWith(DISCORD_PYTHON_PATH_PREFIX) ||
      normalizedFile === DISCORD_PYTHON_WORKFLOW_PATH
    );
  });
}

function touchesPlatformReleaseVersion(files) {
  return files.some((file) =>
    PLATFORM_RELEASE_VERSION_PATHS.has(normalizeChangedFilePath(file))
  );
}

function getActiveChecks(options = {}) {
  const changedFiles = options.changedFiles ?? getChangedFiles(options);
  const activeChecks = checks.filter(
    (check) =>
      check.name !== 'platform-release-version' ||
      touchesPlatformReleaseVersion(changedFiles)
  );

  if (touchesDiscordPython(changedFiles)) {
    const scriptTestsIndex = activeChecks.findIndex(
      (check) => check.name === 'script-tests'
    );
    const insertIndex =
      scriptTestsIndex === -1 ? activeChecks.length : scriptTestsIndex + 1;

    activeChecks.splice(insertIndex, 0, discordPythonCheck);
  }

  return activeChecks;
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function realpathOrFallback(targetPath, fsImpl = fs) {
  try {
    if (typeof fsImpl.realpathSync?.native === 'function') {
      return fsImpl.realpathSync.native(targetPath);
    }
    return fsImpl.realpathSync(targetPath);
  } catch {
    return path.resolve(targetPath);
  }
}

function removeFileIfExists(filePath, fsImpl = fs) {
  try {
    fsImpl.unlinkSync(filePath);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }
}

function removeDirIfExists(dirPath, fsImpl = fs) {
  try {
    fsImpl.rmSync(dirPath, { recursive: true, force: true });
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }
}

function readJsonFile(filePath, fsImpl = fs) {
  try {
    return JSON.parse(fsImpl.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function isProcessActive(pid, killImpl = process.kill) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }

  try {
    killImpl(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

function signalProcess(pid, signal = 'SIGTERM', killImpl = process.kill) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }

  try {
    killImpl(pid, signal);
    return true;
  } catch (error) {
    if (error.code === 'ESRCH') {
      return false;
    }

    throw error;
  }
}

function formatSignalError(pid, signal, error) {
  const detail =
    error?.code === 'EPERM'
      ? 'permission denied'
      : error?.message || 'unknown error';
  return new Error(
    `Failed to send ${signal} to bun check pid ${pid}: ${detail}`
  );
}

function readProcessCommand(pid, execFile = execFileSync) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return '';
  }

  try {
    return execFile('ps', ['-p', String(pid), '-o', 'command='], {
      encoding: 'utf8',
    }).trim();
  } catch {
    return '';
  }
}

function isCheckQueueProcess(pid, options = {}) {
  const readCommand = options.readProcessCommand ?? readProcessCommand;
  const command = readCommand(pid);
  if (!command) {
    return false;
  }

  const normalizedCommand = command.replace(/\0/g, ' ').replace(/\\/g, '/');
  const hasCheckScript =
    /(^|\s)(?:\.\/)?(?:[^ ]+\/)?scripts\/check\.js(?:\s|$)/.test(
      normalizedCommand
    );
  const hasCheckPackageScript =
    /(^|\s)(?:[^ ]+\/)?bun(?:\s+run)?\s+check(?::now)?(?:\s|$)/.test(
      normalizedCommand
    );
  const hasExpectedRuntime =
    /(^|\s)(?:[^ ]+\/)?(?:bun|node)(?:\s|$)/.test(normalizedCommand) ||
    /(^|\s)(?:[^ ]+\/)?bun(?:\s+run)?\s+check(?::now)?(?:\s|$)/.test(
      normalizedCommand
    );

  return hasExpectedRuntime && (hasCheckScript || hasCheckPackageScript);
}

function isTrustedCheckQueuePid(pid, options = {}) {
  const currentPid = options.pid ?? process.pid;
  if (pid === currentPid) {
    return true;
  }

  return isCheckQueueProcess(pid, {
    readProcessCommand: options.readProcessCommand,
  });
}

function getCheckQueuePaths(rootDir = ROOT_DIR, options = {}) {
  const fsImpl = options.fsImpl ?? fs;
  const queueRoot = options.queueRoot ?? CHECK_QUEUE_ROOT;
  const resolvedRoot = realpathOrFallback(rootDir, fsImpl);
  const queueKey = crypto
    .createHash('sha1')
    .update(resolvedRoot)
    .digest('hex')
    .slice(0, 16);
  const queueDir = path.join(queueRoot, queueKey);

  return {
    queueDir,
    ticketsDir: path.join(queueDir, 'tickets'),
    lockDir: path.join(queueDir, 'lock'),
    lockMetaPath: path.join(queueDir, 'lock', 'owner.json'),
  };
}

function createQueueTicket(paths, options = {}) {
  const fsImpl = options.fsImpl ?? fs;
  const now = options.now ?? Date.now;
  const pid = options.pid ?? process.pid;
  const argv = options.argv ?? process.argv.slice(2);
  const createdAt = now();
  const ticketId = [
    String(createdAt).padStart(13, '0'),
    String(pid).padStart(8, '0'),
    crypto.randomBytes(4).toString('hex'),
  ].join('-');
  const ticketPath = path.join(paths.ticketsDir, `${ticketId}.json`);

  fsImpl.mkdirSync(paths.ticketsDir, { recursive: true });
  fsImpl.writeFileSync(
    ticketPath,
    JSON.stringify({ argv, createdAt, pid, ticketId }, null, 2)
  );

  return {
    argv,
    createdAt,
    pid,
    ticketId,
    ticketPath,
  };
}

function listActiveTickets(paths, options = {}) {
  const fsImpl = options.fsImpl ?? fs;
  const isPidActive = options.isPidActive ?? isProcessActive;
  const isPidTrusted = options.isPidTrusted ?? (() => true);
  const entries = [];

  fsImpl.mkdirSync(paths.ticketsDir, { recursive: true });

  for (const fileName of fsImpl.readdirSync(paths.ticketsDir)) {
    if (!fileName.endsWith('.json')) {
      continue;
    }

    const ticketPath = path.join(paths.ticketsDir, fileName);
    const ticket = readJsonFile(ticketPath, fsImpl);
    const ticketPid = Number(ticket?.pid);

    if (!ticket || !isPidActive(ticketPid) || !isPidTrusted(ticketPid)) {
      removeFileIfExists(ticketPath, fsImpl);
      continue;
    }

    entries.push({
      createdAt: Number(ticket.createdAt) || 0,
      pid: ticketPid,
      ticketId: ticket.ticketId || fileName.replace(/\.json$/, ''),
      ticketPath,
    });
  }

  entries.sort((left, right) => {
    if (left.createdAt !== right.createdAt) {
      return left.createdAt - right.createdAt;
    }

    return left.ticketId.localeCompare(right.ticketId);
  });

  return entries;
}

function pruneStaleLock(paths, options = {}) {
  const fsImpl = options.fsImpl ?? fs;
  const isPidActive = options.isPidActive ?? isProcessActive;
  const isPidTrusted = options.isPidTrusted ?? (() => true);

  if (!fsImpl.existsSync(paths.lockDir)) {
    return;
  }

  const owner = readJsonFile(paths.lockMetaPath, fsImpl);
  const ownerPid = Number(owner?.pid);

  if (!owner || !isPidActive(ownerPid) || !isPidTrusted(ownerPid)) {
    removeDirIfExists(paths.lockDir, fsImpl);
  }
}

function releaseCheckQueueLock(handle, options = {}) {
  if (!handle || handle.released) {
    return;
  }

  const fsImpl = options.fsImpl ?? handle.fsImpl ?? fs;

  handle.released = true;
  removeFileIfExists(handle.ticket.ticketPath, fsImpl);

  const owner = readJsonFile(handle.paths.lockMetaPath, fsImpl);
  if (!owner || owner.ticketId === handle.ticket.ticketId) {
    removeDirIfExists(handle.paths.lockDir, fsImpl);
  }
}

function listTrackedCheckProcesses(paths, options = {}) {
  const fsImpl = options.fsImpl ?? fs;
  const isPidActive = options.isPidActive ?? isProcessActive;
  const trackedProcesses = new Map();

  pruneStaleLock(paths, { fsImpl, isPidActive });

  const owner = readJsonFile(paths.lockMetaPath, fsImpl);
  const ownerPid = Number(owner?.pid);
  if (owner && isPidActive(ownerPid)) {
    trackedProcesses.set(ownerPid, {
      pid: ownerPid,
      source: 'lock',
      ticketId: owner.ticketId || 'lock-owner',
    });
  }

  for (const ticket of listActiveTickets(paths, { fsImpl, isPidActive })) {
    trackedProcesses.set(ticket.pid, {
      pid: ticket.pid,
      source: 'ticket',
      ticketId: ticket.ticketId,
    });
  }

  return [...trackedProcesses.values()];
}

async function forceClearCheckQueue(options = {}) {
  const fsImpl = options.fsImpl ?? fs;
  const stdoutWriter =
    options.stdoutWriter ?? ((str) => process.stdout.write(str));
  const killImpl = options.killImpl ?? process.kill;
  const isPidActive = options.isPidActive ?? isProcessActive;
  const sleepImpl = options.sleepImpl ?? sleep;
  const currentPid = options.pid ?? process.pid;
  const forceGraceMs = options.forceGraceMs ?? 1500;
  const forceKillSignal = options.forceKillSignal ?? 'SIGKILL';
  const paths = getCheckQueuePaths(options.rootDir ?? ROOT_DIR, {
    fsImpl,
    queueRoot: options.queueRoot,
  });

  const trackedProcesses = listTrackedCheckProcesses(paths, {
    fsImpl,
    isPidActive,
  }).filter((entry) => entry.pid !== currentPid);
  const trustedProcesses = trackedProcesses.filter((entry) =>
    isCheckQueueProcess(entry.pid, {
      readProcessCommand: options.readProcessCommand,
    })
  );
  const untrustedProcesses = trackedProcesses.filter(
    (entry) => !trustedProcesses.some((trusted) => trusted.pid === entry.pid)
  );

  if (trackedProcesses.length === 0) {
    return;
  }

  if (untrustedProcesses.length > 0) {
    stdoutWriter(
      `${colors.yellow}Discarding ${untrustedProcesses.length} unverified bun check queue record${untrustedProcesses.length === 1 ? '' : 's'} without signaling their PID${untrustedProcesses.length === 1 ? '' : 's'}.${colors.reset}\n`
    );
  }

  if (trustedProcesses.length === 0) {
    removeDirIfExists(paths.lockDir, fsImpl);
    removeDirIfExists(paths.ticketsDir, fsImpl);
    return;
  }

  stdoutWriter(
    `${colors.yellow}${colors.bold}Force stopping ${trustedProcesses.length} earlier bun check invocation${trustedProcesses.length === 1 ? '' : 's'}...${colors.reset}\n`
  );

  for (const processInfo of trustedProcesses) {
    try {
      signalProcess(processInfo.pid, 'SIGTERM', killImpl);
    } catch (error) {
      throw formatSignalError(processInfo.pid, 'SIGTERM', error);
    }
  }

  const waitUntil = Date.now() + forceGraceMs;
  while (
    trustedProcesses.some((processInfo) => isPidActive(processInfo.pid)) &&
    Date.now() < waitUntil
  ) {
    await sleepImpl(Math.min(CHECK_QUEUE_POLL_MS, forceGraceMs));
  }

  const stubbornProcesses = trustedProcesses.filter((processInfo) =>
    isPidActive(processInfo.pid)
  );

  if (stubbornProcesses.length > 0) {
    stdoutWriter(
      `${colors.yellow}Escalating to ${forceKillSignal} for ${stubbornProcesses.length} bun check invocation${stubbornProcesses.length === 1 ? '' : 's'}...${colors.reset}\n`
    );

    for (const processInfo of stubbornProcesses) {
      try {
        signalProcess(processInfo.pid, forceKillSignal, killImpl);
      } catch (error) {
        throw formatSignalError(processInfo.pid, forceKillSignal, error);
      }
    }
  }

  removeDirIfExists(paths.lockDir, fsImpl);
  removeDirIfExists(paths.ticketsDir, fsImpl);
}

async function acquireCheckQueueLock(options = {}) {
  if (options.forceNow) {
    await forceClearCheckQueue(options);
  }

  const fsImpl = options.fsImpl ?? fs;
  const stdoutWriter =
    options.stdoutWriter ?? ((str) => process.stdout.write(str));
  const pollMs = options.pollMs ?? CHECK_QUEUE_POLL_MS;
  const paths = getCheckQueuePaths(options.rootDir ?? ROOT_DIR, {
    fsImpl,
    queueRoot: options.queueRoot,
  });
  const ticket = createQueueTicket(paths, {
    argv: options.argv,
    fsImpl,
    now: options.now,
    pid: options.pid,
  });
  const isPidActive = options.isPidActive ?? isProcessActive;
  const isPidTrusted = (pid) =>
    isTrustedCheckQueuePid(pid, {
      pid: ticket.pid,
      readProcessCommand: options.readProcessCommand,
    });
  const sleepImpl = options.sleepImpl ?? sleep;
  let lastAnnouncedBlockers = -1;

  try {
    while (true) {
      pruneStaleLock(paths, { fsImpl, isPidActive, isPidTrusted });

      const activeTickets = listActiveTickets(paths, {
        fsImpl,
        isPidActive,
        isPidTrusted,
      });
      const position = activeTickets.findIndex(
        (entry) => entry.ticketId === ticket.ticketId
      );

      if (position === -1) {
        throw new Error('Lost bun check queue ticket before lock acquisition');
      }

      if (position === 0) {
        try {
          fsImpl.mkdirSync(paths.lockDir);
          fsImpl.writeFileSync(
            paths.lockMetaPath,
            JSON.stringify(
              {
                argv: ticket.argv,
                createdAt: ticket.createdAt,
                pid: ticket.pid,
                ticketId: ticket.ticketId,
              },
              null,
              2
            )
          );
          removeFileIfExists(ticket.ticketPath, fsImpl);

          const handle = {
            fsImpl,
            paths,
            release: () => releaseCheckQueueLock(handle),
            released: false,
            ticket,
          };

          return handle;
        } catch (error) {
          if (error.code !== 'EEXIST') {
            throw error;
          }
        }
      }

      const blockers = position + (fsImpl.existsSync(paths.lockDir) ? 1 : 0);
      if (blockers > 0 && blockers !== lastAnnouncedBlockers) {
        stdoutWriter(
          `${colors.dim}Queued behind ${blockers} earlier bun check invocation${blockers === 1 ? '' : 's'}...${colors.reset}\n`
        );
        lastAnnouncedBlockers = blockers;
      }

      await sleepImpl(pollMs);
    }
  } catch (error) {
    removeFileIfExists(ticket.ticketPath, fsImpl);
    throw error;
  }
}

/**
 * Run a single check and capture output
 */
function runCheck(check, options = {}) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    let stdout = '';
    let stderr = '';
    const streamOutput = options.forceBuffered === true ? false : showDetails;

    const proc = spawn(check.command, check.args, {
      cwd: process.cwd(),
      env: {
        ...process.env,
        FORCE_COLOR: '1',
        CHECK_DETAILS: showDetails ? '1' : '0',
      },
    });
    activeCheckProcess = proc;

    proc.stdout.on('data', (data) => {
      const str = data.toString();
      stdout += str;
      if (streamOutput) {
        process.stdout.write(str);
      }
    });

    proc.stderr.on('data', (data) => {
      const str = data.toString();
      stderr += str;
      if (streamOutput) {
        process.stderr.write(str);
      }
    });

    proc.on('close', (code) => {
      activeCheckProcess = null;
      const duration = Date.now() - startTime;
      const combinedOutput = stdout + stderr;
      const validationFailure =
        code === 0 && typeof check.validateOutput === 'function'
          ? check.validateOutput(combinedOutput)
          : null;
      const success = code === 0 && !validationFailure;

      if (!streamOutput && options.forceBuffered !== true && !success) {
        const failureOutput = check.formatFailureOutput
          ? check.formatFailureOutput(stdout, stderr)
          : combinedOutput;
        if (failureOutput) {
          process.stderr.write(
            failureOutput.endsWith('\n') ? failureOutput : `${failureOutput}\n`
          );
        }
      } else if (
        !streamOutput &&
        options.forceBuffered !== true &&
        success &&
        check.quietSuccessMessage
      ) {
        console.log(check.quietSuccessMessage);
      }
      resolve({
        duration,
        name: check.name,
        status: success
          ? check.parseOutput(combinedOutput)
          : (validationFailure ?? 'Failed'),
        stderr,
        stdout,
        success,
      });
    });

    proc.on('error', (err) => {
      activeCheckProcess = null;
      resolve({
        duration: Date.now() - startTime,
        name: check.name,
        status: 'Error',
        stderr: err.message,
        stdout,
        success: false,
      });
    });
  });
}

function getSignalExitCode(signal) {
  const signalNumber = os.constants.signals?.[signal];
  return typeof signalNumber === 'number' ? 128 + signalNumber : 1;
}

function handleShutdownSignal(signal) {
  if (shutdownSignalHandled) {
    return;
  }

  shutdownSignalHandled = true;

  if (activeCheckProcess) {
    try {
      activeCheckProcess.kill(signal);
    } catch (error) {
      if (error.code !== 'ESRCH') {
        throw error;
      }
    }
  }

  if (activeQueueHandle) {
    activeQueueHandle.release();
    activeQueueHandle = null;
  }

  process.exit(getSignalExitCode(signal));
}

process.on('SIGINT', () => handleShutdownSignal('SIGINT'));
process.on('SIGTERM', () => handleShutdownSignal('SIGTERM'));

/**
 * Format duration in human-readable form
 */
function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  const seconds = (ms / 1000).toFixed(1);
  return `${seconds}s`;
}

/**
 * Create a horizontal line for the table
 */
function createLine(leftChar, midChar, rightChar, colWidths) {
  const segments = colWidths.map((w) => '─'.repeat(w + 2));
  return leftChar + segments.join(midChar) + rightChar;
}

/**
 * Create a table row
 */
function createRow(cells, colWidths) {
  const paddedCells = cells.map((cell, i) => {
    const displayWidth = getDisplayWidth(cell);
    const padding = colWidths[i] - displayWidth + 1;
    return ` ${cell}${' '.repeat(Math.max(0, padding))}`;
  });
  return `│${paddedCells.join('│')}│`;
}

/**
 * Print the summary table
 */
function printSummary(results, options = {}) {
  const { hideSkipped = false } = options;
  const displayedResults = hideSkipped
    ? results.filter((r) => !r.cancelled)
    : results;
  const allPassed = displayedResults.every((r) => r.success);

  console.log('\n');

  if (allPassed) {
    console.log(
      `${colors.green}${colors.bold}All checks passed successfully:${colors.reset}`
    );
  } else {
    console.log(
      `${colors.red}${colors.bold}Some checks failed:${colors.reset}`
    );
  }

  if (useTable) {
    const col1Header = 'Check';
    const col2Header = 'Status';
    const col3Header = 'Details';
    const col4Header = 'Time';
    const col1Width = Math.max(
      col1Header.length,
      ...displayedResults.map((r) => r.name.length)
    );
    const col2Width = Math.max(
      col2Header.length,
      ...displayedResults.map((r) => {
        const prefix = r.success ? 'PASS' : 'FAIL';
        return getDisplayWidth(prefix);
      })
    );
    const detailsValues = displayedResults.map((r) => r.status);
    const timeValues = displayedResults.map((r) => formatDuration(r.duration));
    const colWidths = [col1Width, col2Width];
    if (showDetails) {
      colWidths.push(
        Math.max(
          getDisplayWidth(col3Header),
          ...detailsValues.map((v) => getDisplayWidth(v))
        )
      );
    }
    if (showTiming) {
      colWidths.push(
        Math.max(
          getDisplayWidth(col4Header),
          ...timeValues.map((v) => getDisplayWidth(v))
        )
      );
    }

    console.log(createLine('┌', '┬', '┐', colWidths));
    const headerCells = [
      `${colors.bold}${col1Header}${colors.reset}`,
      `${colors.bold}${col2Header}${colors.reset}`,
    ];
    if (showDetails) {
      headerCells.push(`${colors.bold}${col3Header}${colors.reset}`);
    }
    if (showTiming) {
      headerCells.push(`${colors.bold}${col4Header}${colors.reset}`);
    }
    console.log(createRow(headerCells, colWidths));
    console.log(createLine('├', '┼', '┤', colWidths));

    for (const result of displayedResults) {
      const statusText = result.success
        ? `${colors.green}PASS${colors.reset}`
        : result.cancelled
          ? `${colors.yellow}SKIP${colors.reset}`
          : `${colors.red}FAIL${colors.reset}`;
      const rowCells = [result.name, statusText];
      if (showDetails) rowCells.push(result.status);
      if (showTiming) {
        rowCells.push(
          `${colors.dim}${formatDuration(result.duration)}${colors.reset}`
        );
      }
      console.log(createRow(rowCells, colWidths));

      if (result !== displayedResults[displayedResults.length - 1]) {
        console.log(createLine('├', '┼', '┤', colWidths));
      }
    }

    console.log(createLine('└', '┴', '┘', colWidths));
  } else {
    for (const result of displayedResults) {
      const statusLabel = result.success
        ? 'PASS'
        : result.cancelled
          ? 'SKIP'
          : 'FAIL';
      const statusColor = result.success
        ? colors.green
        : result.cancelled
          ? colors.yellow
          : colors.red;
      let output = `${statusColor}${statusLabel}${colors.reset} ${result.name}`;
      if (showDetails) output += `: ${result.status}`;
      if (showTiming) output += ` (${formatDuration(result.duration)})`;
      console.log(output);
    }
  }
}

/**
 * Main function
 */
async function main(options = {}) {
  const queueHandle = await acquireCheckQueueLock({
    ...options,
    forceNow: options.forceNow ?? forceNow,
  });
  activeQueueHandle = queueHandle;

  try {
    console.log(
      `${colors.cyan}${colors.bold}Running all checks...${colors.reset}\n`
    );

    const results = [];
    let failureSeen = false;
    let failingCheckName = null;
    const activeChecks = getActiveChecks(options);

    for (const check of activeChecks) {
      const hasVisibleOutput = showDetails || false;
      if (hasVisibleOutput) {
        console.log(`${colors.dim}━━━ ${check.name} ━━━${colors.reset}\n`);
      } else {
        console.log(`${colors.dim}━━━ ${check.name} ━━━${colors.reset}`);
      }
      const result = await runCheck(check);
      results.push(result);
      if (hasVisibleOutput || !result.success) {
        console.log('');
      }

      if (
        failFast &&
        !result.success &&
        failFastRequiredChecks.has(check.name)
      ) {
        failureSeen = true;
        failingCheckName = check.name;
      }

      if (failFast && failureSeen) {
        const pendingRequiredChecks = activeChecks
          .slice(results.length)
          .some((pendingCheck) =>
            failFastRequiredChecks.has(pendingCheck.name)
          );

        if (!pendingRequiredChecks) {
          for (let i = results.length; i < activeChecks.length; i += 1) {
            results.push({
              cancelled: true,
              duration: 0,
              name: activeChecks[i].name,
              status: `Skipped (fail-fast after ${failingCheckName})`,
              stderr: '',
              stdout: '',
              success: false,
            });
          }

          console.log(
            `${colors.yellow}${colors.bold}${failingCheckName} failed; skipping remaining checks.${colors.reset}`
          );
          break;
        }
      }
    }

    printSummary(results, { hideSkipped: failFast });

    const allPassed = results.every((r) => r.success);
    return allPassed ? 0 : 1;
  } finally {
    queueHandle.release();
    activeQueueHandle = null;
  }
}

if (require.main === module) {
  main()
    .then((exitCode) => {
      process.exit(exitCode);
    })
    .catch((err) => {
      console.error('Unexpected error:', err);
      process.exit(1);
    });
}

module.exports = {
  acquireCheckQueueLock,
  checks,
  discordPythonCheck,
  forceClearCheckQueue,
  formatSignalError,
  getActiveChecks,
  getCheckQueuePaths,
  getChangedFiles,
  isCheckQueueProcess,
  isProcessActive,
  isTrustedCheckQueuePid,
  listTrackedCheckProcesses,
  main,
  parseBiomeIssueStats,
  releaseCheckQueueLock,
  runCheck,
  signalProcess,
  touchesDiscordPython,
  touchesPlatformReleaseVersion,
};
