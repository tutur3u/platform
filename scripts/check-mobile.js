#!/usr/bin/env node

/**
 * Mobile Check Runner
 *
 * Runs all Flutter/Dart quality checks (format, analyze, test)
 * from apps/mobile/ and displays a formatted summary table.
 *
 * Usage:
 *   node scripts/check-mobile.js
 *   bun check:mobile
 *
 * Exit codes:
 *   0 - All checks passed
 *   1 - One or more checks failed
 */

const { spawn } = require('node:child_process');
const path = require('node:path');

const MOBILE_DIR = path.resolve(__dirname, '..', 'apps', 'mobile');

/**
 * Strip ANSI escape codes from a string
 */
const ESC = String.fromCharCode(27);
const ANSI_REGEX = new RegExp(`${ESC}\\[[0-9;]*m`, 'g');
function stripAnsi(str) {
  return str.replace(ANSI_REGEX, '');
}

/**
 * Calculate the display width of a string, accounting for emojis
 */
function getDisplayWidth(str) {
  const stripped = stripAnsi(str);
  let width = 0;
  for (const char of stripped) {
    const code = char.codePointAt(0);
    if (
      code > 0x1f600 ||
      (code >= 0x2600 && code <= 0x27bf) ||
      (code >= 0x2700 && code <= 0x27bf)
    ) {
      width += 2;
    } else {
      width += 1;
    }
  }
  return width;
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

// Check definitions — mirrors the CI's very_good_workflows pipeline
const checks = [
  {
    name: 'Dart format',
    command: 'dart',
    args: ['format', '--set-exit-if-changed', 'lib', 'test'],
    parseOutput: (stdout) => {
      const clean = stripAnsi(stdout);
      const match = clean.match(/Formatted (\d+) files? \((\d+) changed\)/i);
      if (match) {
        return `${match[1]} files checked`;
      }
      return 'Passed';
    },
  },
  {
    name: 'Flutter analyze',
    command: 'flutter',
    args: ['analyze'],
    parseOutput: (stdout) => {
      const clean = stripAnsi(stdout);
      if (clean.includes('No issues found')) {
        return 'No issues found';
      }
      const match = clean.match(/(\d+) issues? found/i);
      if (match) {
        return `${match[1]} issues found`;
      }
      return 'Passed';
    },
  },
  {
    name: 'Flutter test',
    command: 'flutter',
    args: ['test'],
    parseOutput: (stdout) => {
      const clean = stripAnsi(stdout);
      // Match "All tests passed!" or "+N: All tests passed!"
      if (clean.includes('All tests passed')) {
        const countMatch = clean.match(/\+(\d+):\s*All tests passed/i);
        if (countMatch) {
          return `${countMatch[1]} tests passed`;
        }
        return 'All tests passed';
      }
      // Match "X tests passed, Y failed"
      const resultMatch = clean.match(/(\d+) tests? passed.*?(\d+) failed/i);
      if (resultMatch) {
        return `${resultMatch[1]} passed, ${resultMatch[2]} failed`;
      }
      // No test files
      if (clean.includes('No tests ran') || clean.includes('no test files')) {
        return 'No tests found';
      }
      return 'Passed';
    },
  },
];

/**
 * Run a single check and capture output
 */
function runCheck(check) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    let stdout = '';
    let stderr = '';

    const proc = spawn(check.command, check.args, {
      cwd: MOBILE_DIR,
      shell: true,
      env: { ...process.env, FORCE_COLOR: '1' },
    });

    proc.stdout.on('data', (data) => {
      const str = data.toString();
      stdout += str;
      process.stdout.write(str);
    });

    proc.stderr.on('data', (data) => {
      const str = data.toString();
      stderr += str;
      process.stderr.write(str);
    });

    proc.on('close', (code) => {
      const duration = Date.now() - startTime;
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

/**
 * Format duration in human-readable form
 */
function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  const seconds = (ms / 1000).toFixed(1);
  if (ms < 60000) return `${seconds}s`;
  const minutes = Math.floor(ms / 60000);
  const remainingSeconds = ((ms % 60000) / 1000).toFixed(0);
  return `${minutes}m ${remainingSeconds}s`;
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
function printSummaryTable(results) {
  const allPassed = results.every((r) => r.success);
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

  console.log('\n');

  if (allPassed) {
    console.log(
      `${colors.green}${colors.bold}All mobile checks passed successfully:${colors.reset}`
    );
  } else {
    console.log(
      `${colors.red}${colors.bold}Some mobile checks failed:${colors.reset}`
    );
  }

  // Calculate column widths
  const col1Header = 'Check';
  const col2Header = 'Status';
  const col3Header = 'Time';
  const col1Width = Math.max(
    col1Header.length,
    ...results.map((r) => r.name.length)
  );
  const col2Width = Math.max(
    col2Header.length,
    ...results.map((r) => {
      const prefix = r.success ? '✅ ' : '❌ ';
      return getDisplayWidth(prefix) + r.status.length;
    })
  );
  const col3Width = Math.max(
    col3Header.length,
    ...results.map((r) => formatDuration(r.duration).length)
  );
  const colWidths = [col1Width, col2Width, col3Width];

  // Print table
  console.log(createLine('┌', '┬', '┐', colWidths));
  console.log(
    createRow(
      [
        `${colors.bold}${col1Header}${colors.reset}`,
        `${colors.bold}${col2Header}${colors.reset}`,
        `${colors.bold}${col3Header}${colors.reset}`,
      ],
      colWidths
    )
  );
  console.log(createLine('├', '┼', '┤', colWidths));

  for (const result of results) {
    const icon = result.success ? '✅' : '❌';
    const statusColor = result.success ? colors.green : colors.red;
    const statusText = `${icon} ${statusColor}${result.status}${colors.reset}`;
    const timeText = `${colors.dim}${formatDuration(result.duration)}${colors.reset}`;
    console.log(createRow([result.name, statusText, timeText], colWidths));

    if (result !== results[results.length - 1]) {
      console.log(createLine('├', '┼', '┤', colWidths));
    }
  }

  console.log(createLine('└', '┴', '┘', colWidths));
  console.log(
    `\n${colors.dim}Total time: ${formatDuration(totalDuration)}${colors.reset}`
  );
}

/**
 * Main function
 */
async function main() {
  console.log(
    `${colors.cyan}${colors.bold}Running mobile checks (apps/mobile/)...${colors.reset}\n`
  );

  const results = [];

  for (const check of checks) {
    console.log(`${colors.dim}━━━ ${check.name} ━━━${colors.reset}\n`);
    const result = await runCheck(check);
    results.push(result);
    console.log('\n');
  }

  printSummaryTable(results);

  const allPassed = results.every((r) => r.success);
  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
