#!/usr/bin/env node

const { spawn } = require('child_process');
const readline = require('readline');

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

const colorize = (text, color) => `${colors[color]}${text}${colors.reset}`;

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

function startDevelopmentServers(turboCommand) {
  console.log(colorize('🚀 Starting development servers...', 'cyan'));

  // Run the turbo command
  const devProcess = spawn('sh', ['-c', turboCommand], {
    stdio: 'inherit',
    cwd: process.cwd(),
  });

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
      // Set up the database
      const resetText = shouldReset ? ' and resetting' : '';
      console.log(
        colorize(
          `\n🗄️  Stopping, installing packages${resetText}, and starting database...`,
          'yellow'
        )
      );

      const dbCommands = [
        'cd apps/db',
        'bun supabase stop',
        'bun i',
        'bun supabase start',
      ];

      if (shouldReset) {
        dbCommands.push('bun sb:reset', 'bun sb:typegen');
      }

      dbCommands.push('cd ../..');
      const dbCommand = dbCommands.join(' && ');

      // Run database setup
      const dbProcess = spawn('sh', ['-c', dbCommand], {
        stdio: 'inherit',
        cwd: process.cwd(),
      });

      dbProcess.on('close', (code) => {
        if (code === 0) {
          console.log(
            colorize(
              '✅ Database setup complete. Starting development servers...\n',
              'green'
            )
          );
          startDevelopmentServers(turboCommand);
        } else {
          console.error(colorize('❌ Database setup failed', 'red'));
          process.exit(code);
        }
      });

      dbProcess.on('error', (err) => {
        console.error(colorize('❌ Error setting up database:', 'red'), err);
        process.exit(1);
      });
    } else {
      // Just install packages and start development
      console.log(colorize('\n📦 Installing packages...', 'yellow'));

      const installProcess = spawn('bun', ['i'], {
        stdio: 'inherit',
        cwd: process.cwd(),
      });

      installProcess.on('close', (code) => {
        if (code === 0) {
          console.log(
            colorize(
              '✅ Packages installed. Starting development servers...\n',
              'green'
            )
          );
          startDevelopmentServers(turboCommand);
        } else {
          console.error(colorize('❌ Package installation failed', 'red'));
          process.exit(code);
        }
      });

      installProcess.on('error', (err) => {
        console.error(colorize('❌ Error installing packages:', 'red'), err);
        process.exit(1);
      });
    }
  } catch (error) {
    console.error(colorize('❌ Error:', 'red'), error);
    rl.close();
    process.exit(1);
  }
}

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  console.log(colorize('\n👋 Goodbye!', 'cyan'));
  rl.close();
  process.exit(0);
});

runDevelopment();
