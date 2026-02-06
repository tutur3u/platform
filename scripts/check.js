#!/usr/bin/env node

/**
 * Unified Check Runner
 *
 * Runs all quality checks (formatting, tests, type-check, i18n, migrations)
 * and displays a formatted summary table at the end.
 *
 * Usage:
 *   node scripts/check.js
 *   bun check
 *
 * Exit codes:
 *   0 - All checks passed
 *   1 - One or more checks failed
 */

const { spawn } = require('node:child_process');

/**
 * Strip ANSI escape codes from a string
 * Uses String.fromCharCode to avoid control character in regex literal
 */
const ESC = String.fromCharCode(27); // ESC character (0x1B)
const ANSI_REGEX = new RegExp(`${ESC}\\[[0-9;]*m`, 'g');
function stripAnsi(str) {
  return str.replace(ANSI_REGEX, '');
}

/**
 * Calculate the display width of a string, accounting for emojis
 * Emojis like ✅ and ❌ take up 2 display columns
 */
function getDisplayWidth(str) {
  const stripped = stripAnsi(str);
  let width = 0;
  for (const char of stripped) {
    const code = char.codePointAt(0);
    // Emojis and other wide characters (simplified check)
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

// Check definitions
const checks = [
  {
    name: 'Biome (format & lint)',
    command: 'bun',
    args: ['biome', 'check'],
    parseOutput: (stdout) => {
      const clean = stripAnsi(stdout);
      const match = clean.match(/Checked (\d+) files?/i);
      return match ? `${match[1]} files checked` : 'Passed';
    },
  },
  {
    name: 'Tests',
    command: 'bun',
    args: ['test'],
    parseOutput: (stdout) => {
      const clean = stripAnsi(stdout);
      // Find all "Tests  X passed" patterns (Vitest format) and sum them
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
    name: 'Type-check',
    command: 'bun',
    args: ['type-check'],
    parseOutput: (stdout) => {
      const clean = stripAnsi(stdout);
      // Look for turbo task summary: "Tasks:    33 successful, 33 total"
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
    name: 'Migration timestamps',
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
  {
    name: 'Native dependencies',
    command: 'bun',
    args: ['native:check'],
    parseOutput: (stdout) => {
      const clean = stripAnsi(stdout);
      if (clean.includes('Dependencies are up to date')) {
        return 'Dependencies up to date';
      }
      if (clean.includes('All dependencies are in sync')) {
        return 'All in sync';
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
      cwd: process.cwd(),
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

  // Calculate column widths
  const col1Header = 'Check';
  const col2Header = 'Status';
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
  const colWidths = [col1Width, col2Width];

  // Print table
  console.log(createLine('┌', '┬', '┐', colWidths));
  console.log(
    createRow(
      [
        `${colors.bold}${col1Header}${colors.reset}`,
        `${colors.bold}${col2Header}${colors.reset}`,
      ],
      colWidths
    )
  );
  console.log(createLine('├', '┼', '┤', colWidths));

  for (const result of results) {
    const icon = result.success ? '✅' : '❌';
    const statusColor = result.success ? colors.green : colors.red;
    const statusText = `${icon} ${statusColor}${result.status}${colors.reset}`;
    console.log(createRow([result.name, statusText], colWidths));

    // Add separator between rows except for the last one
    if (result !== results[results.length - 1]) {
      console.log(createLine('├', '┼', '┤', colWidths));
    }
  }

  console.log(createLine('└', '┴', '┘', colWidths));
}

/**
 * Main function
 */
async function main() {
  console.log(
    `${colors.cyan}${colors.bold}Running all checks...${colors.reset}\n`
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
