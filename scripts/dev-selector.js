#!/usr/bin/env node

const { spawn } = require('child_process');
const readline = require('readline');
const path = require('path');

let devProcess = null; // Keep a reference to the dev server process

const isWindows = process.platform === 'win32';

// On Windows, fallback to legacy mode due to terminal interaction issues
if (isWindows) {
  console.log('🪟 Windows detected - using legacy mode (running all apps)');
  console.log('💡 For interactive selection, please use WSL or PowerShell with better TTY support');
  
  // Run dev:legacy which runs all apps
  const legacyProcess = spawn('bun', ['run', 'dev:legacy'], {
    stdio: 'inherit',
    shell: true,
    cwd: process.cwd(),
  });

  legacyProcess.on('close', (code) => {
    process.exit(code);
  });

  legacyProcess.on('error', (err) => {
    console.error('❌ Error starting development servers:', err);
    process.exit(1);
  });

  // Handle cleanup for legacy mode
  const cleanupLegacy = () => {
    console.log('\n👋 Goodbye! Cleaning up...');
    if (legacyProcess && legacyProcess.pid) {
      spawn('taskkill', ['/pid', legacyProcess.pid, '/t', '/f'], {
        stdio: 'ignore',
      });
    }
    setTimeout(() => process.exit(0), 300);
  };

  process.on('SIGINT', cleanupLegacy);
  process.on('SIGTERM', cleanupLegacy);
  
  return; // Exit early, don't run the rest of the script
}

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

const colorize = (text, color) => {
  // On Windows, especially in older terminals, ANSI codes can cause issues.
  // Disabling colors improves compatibility.
  if (isWindows) return text;
  return `${colors[color]}${text}${colors.reset}`;
};

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const apps = [
  { name: 'web', filter: '@tuturuuu/web' },
  { name: 'calendar', filter: '@tuturuuu/calendar -F @tuturuuu/web' },
  { name: 'rewise', filter: '@tuturuuu/rewise -F @tuturuuu/web' },
  { name: 'upskii', filter: '@tuturuuu/upskii -F @tuturuuu/web' },
  { name: 'famigo', filter: '@tuturuuu/famigo -F @tuturuuu/web' },
  { name: 'nova', filter: '@tuturuuu/nova -F @tuturuuu/web' },
];

function showMenu() {
  console.log(colorize('\n' + '─'.repeat(50), 'gray'));
  console.log(
    colorize('🚀 Select which app(s) to run in development mode:', 'cyan')
  );
  console.log(colorize('─'.repeat(50), 'gray'));
  console.log(
    colorize('0.', 'yellow') +
      colorize(' All apps', 'bright') +
      colorize(' (parallel)', 'gray')
  );
  apps.forEach((app, index) => {
    const includesWeb =
      app.filter.includes('@tuturuuu/web') && app.name !== 'web';
    const webNote = includesWeb ? colorize(' (+ web)', 'blue') : '';
    console.log(
      colorize(`${index + 1}.`, 'yellow') +
        colorize(` ${app.name}`, 'bright') +
        webNote
    );
  });
  console.log(colorize('─'.repeat(50), 'gray'));
  console.log(colorize('q.', 'red') + colorize(' Quit', 'bright'));
  console.log(
    colorize(
      '💡 Tip: Use comma-separated numbers for multiple apps (e.g., 2,4,6)',
      'gray'
    )
  );
}

function askForSelection() {
  return new Promise((resolve) => {
    const promptUser = () => {
      showMenu();
      rl.question(
        colorize(
          '\nEnter your choice (number, comma-separated numbers, or q): ',
          'bright'
        ),
        (answer) => {
          const trimmed = answer.trim();

          // Handle quit
          if (trimmed.toLowerCase() === 'q') {
            resolve('q');
            return;
          }

          // Handle empty input - re-prompt
          if (trimmed === '') {
            console.log(
              colorize('❌ Please select at least one option.', 'red')
            );
            promptUser();
            return;
          }

          // Validate input
          const selections = trimmed.split(',').map((s) => s.trim());
          const validSelections = selections.every((s) => {
            const num = parseInt(s);
            return !isNaN(num) && num >= 0 && num <= apps.length;
          });

          if (!validSelections) {
            console.log(
              colorize(
                '❌ Invalid selection. Please enter valid numbers (0-' +
                  apps.length +
                  ') or q to quit.',
                'red'
              )
            );
            promptUser();
            return;
          }

          resolve(trimmed);
        }
      );
    };

    promptUser();
  });
}

function buildTurboCommand(selections) {
  if (selections.includes('0')) {
    return 'turbo run dev --parallel';
  }

  const selectedApps = selections
    .split(',')
    .map((s) => parseInt(s.trim()))
    .filter((num) => num > 0 && num <= apps.length)
    .map((num) => apps[num - 1]);

  if (selectedApps.length === 1) {
    return `turbo run dev -F ${selectedApps[0].filter}`;
  }

  // For multiple apps, we need to build a filter string
  const filters = selectedApps.map((app) => `-F ${app.filter}`).join(' ');
  return `turbo run dev ${filters}`;
}

function askForDatabaseRestart(defaultValue = false) {
  return new Promise((resolve) => {
    const defaultText = defaultValue ? 'Y/n' : 'y/N';
    rl.question(
      colorize(
        `\n🗄️  Do you want to restart the database? (${defaultText}): `,
        'yellow'
      ),
      (answer) => {
        const trimmed = answer.trim().toLowerCase();
        if (trimmed === '') {
          resolve(defaultValue);
        } else {
          resolve(trimmed === 'y' || trimmed === 'yes');
        }
      }
    );
  });
}

function askForDatabaseReset(defaultValue = false) {
  return new Promise((resolve) => {
    const defaultText = defaultValue ? 'Y/n' : 'y/N';
    rl.question(
      colorize(
        `\n🗄️  Do you want to reset the database? (${defaultText}): `,
        'yellow'
      ),
      (answer) => {
        const trimmed = answer.trim().toLowerCase();
        if (trimmed === '') {
          resolve(defaultValue);
        } else {
          resolve(trimmed === 'y' || trimmed === 'yes');
        }
      }
    );
  });
}

// Helper to run shell commands in a cross-platform way
function runShellCommand(command, options = {}) {
  /**
   * Using `{ shell: true }` delegates execution to the user's default shell
   * (e.g. bash, zsh, fish on Unix; cmd.exe or PowerShell on Windows).
   * This avoids the hard dependency on `/bin/sh`, making the script
   * portable across operating systems.
   */
  // `process.platform` returns 'win32' for both 32-bit and 64-bit Windows.
  // This check is sufficient for all modern Windows versions.
  const isWindows = process.platform === 'win32';
  return spawn(command, {
    stdio: 'inherit',
    shell: true,
    cwd: process.cwd(),
    // On non-Windows, detached creates a new process group that can be killed at once.
    detached: !isWindows,
    ...options,
  });
}

async function runCommands(commands) {
  for (const { cmd, cwd, name } of commands) {
    console.log(colorize(`\n⏳ ${name}...`, 'yellow'));
    console.log(colorize(`   Running: ${cmd} in ${cwd || './'}`, 'gray'));
    await new Promise((resolve, reject) => {
      const proc = runShellCommand(cmd, { cwd });
      proc.on('close', (code) => {
        if (code === 0) {
          console.log(colorize(`✅ ${name} complete.`, 'green'));
          resolve();
        } else {
          const errorMsg = `❌ ${name} failed with exit code ${code}.`;
          console.error(colorize(errorMsg, 'red'));
          reject(new Error(errorMsg));
        }
      });
      proc.on('error', (err) => {
        const errorMsg = `❌ Error during "${name}":`;
        console.error(colorize(errorMsg, 'red'), err);
        reject(err);
      });
    });
  }
}

function startDevelopmentServers(turboCommand) {
  console.log(colorize('🚀 Starting development servers...', 'cyan'));

  const isWindows = process.platform === 'win32';

  if (isWindows) {
    const args = turboCommand.split(' ').slice(1);
    // On Windows, we must spawn the `turbo.cmd` executable directly,
    // and we must NOT use the shell. Using the shell (even `cmd.exe`)
    // interferes with the TTY and prevents keyboard input from reaching
    // the interactive turbo process.
    devProcess = spawn('turbo.cmd', args, {
      stdio: 'inherit',
      cwd: process.cwd(),
      shell: false,
    });
  } else {
    // For non-Windows platforms, the existing shell command runner works well.
    devProcess = runShellCommand(turboCommand);
  }

  devProcess.on('close', (devCode) => {
    console.log(
      colorize(`\n🏁 Development servers exited with code ${devCode}`, 'cyan')
    );
    process.exit(devCode);
  });

  devProcess.on('error', (err) => {
    console.error(
      colorize('❌ Error starting development servers:', 'red'),
      err
    );
    process.exit(1);
  });
}

async function runDevelopment() {
  const mode = process.argv[2]; // 'devx', 'devrs', or 'dev'
  let shouldRestartDb = false;
  let shouldReset = false;

  if (mode === 'dev') {
    console.log(colorize('\n' + '═'.repeat(60), 'cyan'));
    console.log(colorize('🔧 Interactive Development Mode', 'cyan'));
    console.log(colorize('═'.repeat(60), 'cyan'));
    console.log(
      colorize('   📦 Packages will be installed automatically', 'gray')
    );
    console.log(
      colorize('   🚀 Development servers will start immediately', 'gray')
    );
    console.log(
      colorize(
        '   ⚡ Default: No database restart, no reset (press ENTER)',
        'gray'
      )
    );
    shouldRestartDb = await askForDatabaseRestart(false); // Default: no restart
    if (shouldRestartDb) {
      shouldReset = await askForDatabaseReset(false); // Default: no reset
    }
  } else if (mode === 'devx') {
    console.log(colorize('\n' + '═'.repeat(60), 'cyan'));
    console.log(colorize('🔧 Development Mode with Database Restart', 'cyan'));
    console.log(colorize('═'.repeat(60), 'cyan'));
    console.log(
      colorize('   🗄️  Database will be restarted automatically', 'gray')
    );
    console.log(colorize('   📦 Packages will be installed', 'gray'));
    shouldRestartDb = true;
    shouldReset = false;
  } else if (mode === 'devrs') {
    console.log(colorize('\n' + '═'.repeat(60), 'cyan'));
    console.log(colorize('🔧 Development Mode with Database Reset', 'cyan'));
    console.log(colorize('═'.repeat(60), 'cyan'));
    console.log(
      colorize(
        '   🗄️  Database will be restarted and reset automatically',
        'gray'
      )
    );
    console.log(colorize('   📦 Packages will be installed', 'gray'));
    shouldRestartDb = true;
    shouldReset = true;
  }

  try {
    const selection = await askForSelection();

    if (selection.toLowerCase() === 'q') {
      console.log(colorize('👋 Goodbye!', 'cyan'));
      rl.close();
      return;
    }

    const turboCommand = buildTurboCommand(selection);

    // Show what apps will be started
    const selectedNumbers = selection.split(',').map((s) => parseInt(s.trim()));
    const webAutostarted = selectedNumbers.some((num) => {
      if (num === 0) return true; // All apps includes web
      if (num > 0 && num <= apps.length) {
        const app = apps[num - 1];
        return app.filter.includes('@tuturuuu/web') && app.name !== 'web';
      }
      return false;
    });

    console.log(colorize(`\n🏃 Running: ${turboCommand}`, 'green'));
    if (webAutostarted && !selectedNumbers.includes(1)) {
      // 1 is the web app index
      console.log(
        colorize('   ℹ️  Web app will auto-start with selected apps', 'blue')
      );
    }
    rl.close();

    if (shouldRestartDb) {
      const resetText = shouldReset ? ' and resetting' : '';
      console.log(
        colorize(
          `\n🗄️  Setting up database (stop, install,${resetText} start)...`,
          'cyan'
        )
      );

      const dbDir = path.join('apps', 'db');
      const dbSetupCommands = [];

      dbSetupCommands.push({
        cmd: 'bun i',
        cwd: '.',
        name: 'Installing dependencies',
      });

      // If we are not resetting, we might need to stop it first.
      // If we are resetting, the reset command handles this.
      if (!shouldReset) {
        dbSetupCommands.push({
          cmd: 'bun supabase stop',
          cwd: dbDir,
          name: 'Stopping database',
        });
      }

      if (shouldReset) {
        dbSetupCommands.push(
          // Start is required for reset to work
          {
            cmd: 'bun sb:start',
            cwd: dbDir,
            name: 'Ensuring DB is running for reset',
          },
          { cmd: 'bun sb:reset', cwd: dbDir, name: 'Resetting database' },
          { cmd: 'bun sb:typegen', cwd: dbDir, name: 'Generating DB types' }
        );
      } else {
        // If not resetting, just start it.
        dbSetupCommands.push({
          cmd: 'bun sb:start',
          cwd: dbDir,
          name: 'Starting database',
        });
      }

      try {
        await runCommands(dbSetupCommands);
        console.log(
          colorize(
            '\n✅ Database setup complete. Starting development servers...\n',
            'green'
          )
        );
        startDevelopmentServers(turboCommand);
      } catch (error) {
        console.error(colorize('\n❌ Database setup failed. Aborting.', 'red'));
        console.error(colorize(String(error), 'red'));
        process.exit(1);
      }
    } else {
      try {
        await runCommands([
          {
            cmd: 'bun i',
            name: 'Installing dependencies',
          },
        ]);
        console.log(
          colorize(
            '\n✅ Packages installed. Starting development servers...\n',
            'green'
          )
        );
        startDevelopmentServers(turboCommand);
      } catch (error) {
        console.error(
          colorize('\n❌ Package installation failed. Aborting.', 'red')
        );
        console.error(colorize(String(error), 'red'));
        process.exit(1);
      }
    }
  } catch (error) {
    console.error(colorize('❌ Error:', 'red'), error);
    rl.close();
    process.exit(1);
  }
}

function cleanupAndExit() {
  console.log(colorize('\n👋 Goodbye! Cleaning up...', 'cyan'));
  rl.close();

  if (devProcess && devProcess.pid) {
    const isWindows = process.platform === 'win32';
    if (isWindows) {
      // On Windows, use taskkill to recursively kill the process tree.
      // `taskkill` is a standard utility on Windows XP and later.
      spawn('taskkill', ['/pid', devProcess.pid, '/t', '/f'], {
        stdio: 'ignore',
      });
    } else {
      // On Unix, kill the entire process group by sending a signal to -pid.
      // This requires the `detached` option to be set on the child process.
      try {
        process.kill(-devProcess.pid, 'SIGINT');
      } catch (e) {
        // Fallback for cases where process group kill fails
        devProcess.kill('SIGINT');
      }
    }
  }

  // Allow a moment for cleanup before exiting
  setTimeout(() => process.exit(0), 300);
}

// Handle termination signals gracefully
process.on('SIGINT', cleanupAndExit); // Ctrl+C
process.on('SIGTERM', cleanupAndExit); // Kill command

runDevelopment();
