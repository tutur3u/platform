#!/usr/bin/env node

/**
 * Unified Check Runner
 *
 * Runs all quality checks (formatting, tests, type-check, i18n, migrations)
 * and displays a summary at the end.
 *
 * Usage:
 *   node scripts/check.js [--table] [--timing] [--details] [--fail-fast]
 *   bun check [--table] [--timing] [--details] [--fail-fast]
 *
 * Exit codes:
 *   0 - All checks passed
 *   1 - One or more checks failed
 */

const { spawn } = require('node:child_process');
const os = require('node:os');

const useTable = process.argv.includes('--table');
const showTiming = process.argv.includes('--timing');
const showDetails = process.argv.includes('--details');
const forceSerial = process.argv.includes('--serial');
const failFastNoFlag = process.argv.includes('--no-fail-fast');
const failFast = !failFastNoFlag;
const failFastRequiredChecks = new Set(['tests', 'type-check']);

function getNumericFlagValue(flagName) {
  const direct = process.argv.find((arg) => arg.startsWith(`${flagName}=`));
  if (direct) {
    const raw = direct.slice(flagName.length + 1);
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  const index = process.argv.indexOf(flagName);
  if (index !== -1 && process.argv[index + 1]) {
    const parsed = Number.parseInt(process.argv[index + 1], 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  return null;
}

function getRecommendedConcurrency(totalChecks) {
  const cpuCount = os.cpus()?.length ?? 1;
  const totalMemoryGb = os.totalmem() / 1024 / 1024 / 1024;
  const availableMemoryBytes =
    typeof os.availableMemory === 'function'
      ? os.availableMemory()
      : os.freemem();
  const availableMemoryGb = availableMemoryBytes / 1024 / 1024 / 1024;
  const availableRatio =
    totalMemoryGb > 0 ? availableMemoryGb / totalMemoryGb : 0;

  let concurrency = 2;
  if (cpuCount <= 4 || totalMemoryGb < 8) {
    concurrency = 1;
  } else if (cpuCount >= 12 && totalMemoryGb >= 24) {
    concurrency = 4;
  } else if (cpuCount >= 8 && totalMemoryGb >= 16) {
    concurrency = 3;
  }

  if (availableMemoryGb < 4 || availableRatio < 0.2) {
    concurrency = 1;
  } else if (availableMemoryGb < 8 || availableRatio < 0.35) {
    concurrency = Math.min(concurrency, 2);
  } else if (availableMemoryGb < 12 || availableRatio < 0.5) {
    concurrency = Math.min(concurrency, 3);
  }

  return Math.max(1, Math.min(totalChecks, concurrency));
}

const concurrencyFromFlag = getNumericFlagValue('--concurrency');
const concurrencyFromEnv = Number.parseInt(
  process.env.CHECK_CONCURRENCY ?? '',
  10
);
const requestedConcurrency =
  concurrencyFromFlag ??
  (Number.isFinite(concurrencyFromEnv) && concurrencyFromEnv > 0
    ? concurrencyFromEnv
    : null);

/**
 * Strip ANSI escape codes from a string
 */
const ESC = String.fromCharCode(27); // ESC character (0x1B)
const ANSI_REGEX = new RegExp(`${ESC}\\[[0-9;]*m`, 'g');
function stripAnsi(str) {
  return str.replace(ANSI_REGEX, '');
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
    args: ['biome', 'check'],
    parseOutput: (stdout) => {
      const clean = stripAnsi(stdout);
      const match = clean.match(/Checked (\d+) files?/i);
      return match ? `${match[1]} files checked` : 'Passed';
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

/**
 * Run a single check and capture output
 */
function runCheck(check, options = {}) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    let stdout = '';
    let stderr = '';
    const streamOutput =
      options.forceBuffered === true ? false : showDetails || !check.errorsOnly;

    const proc = spawn(check.command, check.args, {
      cwd: process.cwd(),
      shell: true,
      env: {
        ...process.env,
        FORCE_COLOR: '1',
        CHECK_DETAILS: showDetails ? '1' : '0',
      },
    });

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
      const duration = Date.now() - startTime;
      if (!streamOutput && options.forceBuffered !== true && code !== 0) {
        const failureOutput = check.formatFailureOutput
          ? check.formatFailureOutput(stdout, stderr)
          : `${stdout}${stderr}`;
        if (failureOutput) {
          process.stderr.write(
            failureOutput.endsWith('\n') ? failureOutput : `${failureOutput}\n`
          );
        }
      } else if (
        !streamOutput &&
        options.forceBuffered !== true &&
        code === 0 &&
        check.quietSuccessMessage
      ) {
        console.log(check.quietSuccessMessage);
      }
      resolve({
        name: check.name,
        success: code === 0,
        stdout,
        stderr,
        duration,
        status: code === 0 ? check.parseOutput(stdout + stderr) : 'Failed',
      });
    });

    proc.on('error', (err) => {
      resolve({
        name: check.name,
        success: false,
        stdout,
        stderr: err.message,
        duration: Date.now() - startTime,
        status: 'Error',
      });
    });
  });
}

function startCheck(check, options = {}) {
  const startTime = Date.now();
  let stdout = '';
  let stderr = '';
  let wasCancelled = false;
  let settled = false;
  const streamOutput =
    options.forceBuffered === true ? false : showDetails || !check.errorsOnly;

  const proc = spawn(check.command, check.args, {
    cwd: process.cwd(),
    shell: true,
    env: {
      ...process.env,
      FORCE_COLOR: '1',
      CHECK_DETAILS: showDetails ? '1' : '0',
    },
  });

  function terminate() {
    if (settled || proc.killed) return;
    wasCancelled = true;

    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(proc.pid), '/t', '/f'], {
        shell: true,
        stdio: 'ignore',
      });
      return;
    }

    proc.kill('SIGTERM');
  }

  const promise = new Promise((resolve) => {
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
      settled = true;
      const duration = Date.now() - startTime;
      if (!streamOutput && options.forceBuffered !== true && code !== 0) {
        const failureOutput = check.formatFailureOutput
          ? check.formatFailureOutput(stdout, stderr)
          : `${stdout}${stderr}`;
        if (failureOutput) {
          process.stderr.write(
            failureOutput.endsWith('\n') ? failureOutput : `${failureOutput}\n`
          );
        }
      } else if (
        !streamOutput &&
        options.forceBuffered !== true &&
        code === 0 &&
        check.quietSuccessMessage
      ) {
        console.log(check.quietSuccessMessage);
      }
      resolve({
        name: check.name,
        success: !wasCancelled && code === 0,
        cancelled: wasCancelled,
        stdout,
        stderr,
        duration,
        status: wasCancelled
          ? 'Cancelled (fail-fast)'
          : code === 0
            ? check.parseOutput(stdout + stderr)
            : 'Failed',
      });
    });

    proc.on('error', (err) => {
      settled = true;
      resolve({
        name: check.name,
        success: false,
        cancelled: wasCancelled,
        stdout,
        stderr: err.message,
        duration: Date.now() - startTime,
        status: wasCancelled ? 'Cancelled (fail-fast)' : 'Error',
      });
    });
  });

  return { promise, terminate };
}

function getFailureOutput(check, stdout, stderr) {
  return check.formatFailureOutput
    ? check.formatFailureOutput(stdout, stderr)
    : `${stdout}${stderr}`;
}

function printBufferedResult(check, result) {
  if (result.cancelled) {
    return;
  }

  const combinedOutput = `${result.stdout}${result.stderr}`;

  console.log(`${colors.dim}━━━ ${check.name} ━━━${colors.reset}\n`);

  if (showDetails) {
    if (combinedOutput.trim()) {
      process.stdout.write(
        combinedOutput.endsWith('\n') ? combinedOutput : `${combinedOutput}\n`
      );
    }
  } else if (!result.success) {
    const failureOutput = getFailureOutput(check, result.stdout, result.stderr);
    if (failureOutput.trim()) {
      process.stderr.write(
        failureOutput.endsWith('\n') ? failureOutput : `${failureOutput}\n`
      );
    }
  } else if (check.quietSuccessMessage) {
    console.log(check.quietSuccessMessage);
  }

  const statusColor = result.success ? colors.green : colors.red;
  const statusLabel = result.success ? 'PASS' : 'FAIL';
  let footer = `${statusColor}${statusLabel}${colors.reset} ${check.name}`;
  if (showDetails) footer += `: ${result.status}`;
  if (showTiming) footer += ` (${formatDuration(result.duration)})`;
  console.log(footer);
  console.log('');
}

async function runChecksWithConcurrency(checkList, concurrency, options = {}) {
  const results = new Array(checkList.length);
  let nextIndex = 0;
  let activeCount = 0;
  let failureSeen = false;
  let continuationLogged = false;
  let stopScheduling = false;
  let failingCheckName = null;
  const activeRuns = new Map();
  const requiredOnFailure = options.requiredOnFailure ?? new Set();

  function isRequiredOnFailure(checkName) {
    return requiredOnFailure.has(checkName);
  }

  function hasPendingRequiredChecks() {
    for (let i = nextIndex; i < checkList.length; i += 1) {
      if (!results[i] && isRequiredOnFailure(checkList[i].name)) {
        return true;
      }
    }

    for (const activeIndex of activeRuns.keys()) {
      if (
        !results[activeIndex] &&
        isRequiredOnFailure(checkList[activeIndex].name)
      ) {
        return true;
      }
    }

    return false;
  }

  function cancelNonRequiredActive(exceptIndex = null) {
    for (const [activeIndex, activeRun] of activeRuns.entries()) {
      if (activeIndex === exceptIndex) continue;
      if (isRequiredOnFailure(checkList[activeIndex].name)) continue;
      activeRun.terminate();
    }
  }

  return new Promise((resolve) => {
    function finalizeAndResolve() {
      if (!stopScheduling || nextIndex >= checkList.length) {
        resolve(results);
        return;
      }

      for (let i = nextIndex; i < checkList.length; i += 1) {
        if (!results[i]) {
          results[i] = {
            name: checkList[i].name,
            success: false,
            cancelled: true,
            stdout: '',
            stderr: '',
            duration: 0,
            status: `Skipped (fail-fast after ${failingCheckName})`,
          };
        }
      }

      resolve(results);
    }

    function launchNext() {
      while (
        activeCount < concurrency &&
        nextIndex < checkList.length &&
        (!stopScheduling || hasPendingRequiredChecks())
      ) {
        if (stopScheduling && !isRequiredOnFailure(checkList[nextIndex].name)) {
          results[nextIndex] = {
            name: checkList[nextIndex].name,
            success: false,
            cancelled: true,
            stdout: '',
            stderr: '',
            duration: 0,
            status: `Skipped (fail-fast after ${failingCheckName})`,
          };
          nextIndex += 1;
          continue;
        }

        const index = nextIndex;
        const check = checkList[index];
        nextIndex += 1;
        activeCount += 1;

        const run = startCheck(check, { forceBuffered: true });
        activeRuns.set(index, run);

        run.promise
          .then((result) => {
            results[index] = result;
            printBufferedResult(check, result);

            if (options.failFast && !result.success && !result.cancelled) {
              failureSeen = true;
              failingCheckName = check.name;
            }

            if (
              options.failFast &&
              failureSeen &&
              !stopScheduling &&
              !hasPendingRequiredChecks()
            ) {
              stopScheduling = true;
              console.log(
                `${colors.yellow}${colors.bold}${failingCheckName} failed; skipping remaining checks.${colors.reset}`
              );
              cancelNonRequiredActive(index);
            } else if (
              options.failFast &&
              failureSeen &&
              !stopScheduling &&
              hasPendingRequiredChecks()
            ) {
              if (!continuationLogged) {
                console.log(
                  `${colors.yellow}${failingCheckName} failed; running tests/type-check for full context...${colors.reset}`
                );
                continuationLogged = true;
              }
            }
          })
          .finally(() => {
            activeRuns.delete(index);
            activeCount -= 1;
            if (nextIndex >= checkList.length && activeCount === 0) {
              finalizeAndResolve();
              return;
            }

            if (activeCount === 0 && stopScheduling) {
              finalizeAndResolve();
              return;
            }

            if (!stopScheduling) {
              launchNext();
            }
          });
      }
    }

    launchNext();
  });
}

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
async function main() {
  const defaultConcurrency = getRecommendedConcurrency(checks.length);
  const concurrency = forceSerial
    ? 1
    : requestedConcurrency
      ? Math.min(Math.max(1, requestedConcurrency), checks.length)
      : defaultConcurrency;

  console.log(
    `${colors.cyan}${colors.bold}Running all checks...${colors.reset}\n`
  );

  let results = [];

  if (concurrency === 1) {
    let failureSeen = false;
    let failingCheckName = null;

    for (const check of checks) {
      console.log(`${colors.dim}━━━ ${check.name} ━━━${colors.reset}\n`);
      const result = await runCheck(check);
      results.push(result);
      console.log('\n');

      if (failFast && !result.success) {
        failureSeen = true;
        failingCheckName = check.name;
      }

      if (failFast && failureSeen) {
        const pendingRequiredChecks = checks
          .slice(results.length)
          .some((pendingCheck) =>
            failFastRequiredChecks.has(pendingCheck.name)
          );

        if (!pendingRequiredChecks) {
          for (let i = results.length; i < checks.length; i += 1) {
            results.push({
              name: checks[i].name,
              success: false,
              cancelled: true,
              stdout: '',
              stderr: '',
              duration: 0,
              status: `Skipped (fail-fast after ${failingCheckName})`,
            });
          }

          console.log(
            `${colors.yellow}${colors.bold}${failingCheckName} failed; skipping remaining checks.${colors.reset}`
          );
          break;
        }
      }
    }
  } else {
    results = await runChecksWithConcurrency(checks, concurrency, {
      failFast,
      requiredOnFailure: failFastRequiredChecks,
    });
  }

  printSummary(results, { hideSkipped: failFast });

  const allPassed = results.every((r) => r.success);
  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
