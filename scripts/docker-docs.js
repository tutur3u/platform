#!/usr/bin/env node

const path = require('node:path');

const { runChecked, runCommand } = require('./docker-web/compose.js');

const ROOT_DIR = path.resolve(__dirname, '..');
const DOCS_COMPOSE_FILE = path.join(ROOT_DIR, 'docker-compose.docs.yml');
const DEFAULT_DOCS_PORT = '3000';

function parseArgs(argv) {
  const args = [...argv];
  const action = args.shift() ?? 'up';

  if (action !== 'up' && action !== 'down') {
    throw new Error(`Unsupported action "${action}". Use "up" or "down".`);
  }

  const composeArgs = [];
  let port = DEFAULT_DOCS_PORT;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--port' || arg === '-p') {
      const value = args[index + 1];

      if (!value || !/^\d+$/u.test(value)) {
        throw new Error('Expected --port to be followed by a numeric value.');
      }

      const numericPort = Number(value);

      if (
        !Number.isInteger(numericPort) ||
        numericPort < 1 ||
        numericPort > 65_535
      ) {
        throw new Error('Expected --port to be between 1 and 65535.');
      }

      port = value;
      index += 1;
      continue;
    }

    composeArgs.push(arg);
  }

  return {
    action,
    composeArgs,
    port,
  };
}

function getDocsComposeArgs(action, composeArgs = []) {
  if (action === 'down') {
    return [
      'compose',
      '-f',
      DOCS_COMPOSE_FILE,
      'down',
      '--remove-orphans',
      ...composeArgs,
    ];
  }

  return [
    'compose',
    '-f',
    DOCS_COMPOSE_FILE,
    'up',
    '--build',
    '--remove-orphans',
    ...composeArgs,
  ];
}

async function runDockerDocsWorkflow(parsed, options = {}) {
  const env = {
    ...(options.env ?? process.env),
    DOCS_PORT: parsed.port,
  };

  await runChecked('docker', ['compose', 'version'], {
    env,
    runCommand: options.runCommand ?? runCommand,
    stdio: 'ignore',
  });

  await runChecked(
    'docker',
    getDocsComposeArgs(parsed.action, parsed.composeArgs),
    {
      env,
      runCommand: options.runCommand ?? runCommand,
    }
  );
}

async function main() {
  await runDockerDocsWorkflow(parseArgs(process.argv.slice(2)));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}

module.exports = {
  DEFAULT_DOCS_PORT,
  DOCS_COMPOSE_FILE,
  getDocsComposeArgs,
  parseArgs,
  runDockerDocsWorkflow,
};
