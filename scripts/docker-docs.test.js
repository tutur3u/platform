const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DEFAULT_DOCS_PORT,
  DOCS_COMPOSE_FILE,
  getDocsComposeArgs,
  parseArgs,
  runDockerDocsWorkflow,
} = require('./docker-docs.js');

test('parseArgs defaults to bringing the docs stack up on port 3000', () => {
  assert.deepEqual(parseArgs([]), {
    action: 'up',
    composeArgs: [],
    port: DEFAULT_DOCS_PORT,
  });
});

test('parseArgs accepts a custom port and forwards extra compose args', () => {
  assert.deepEqual(parseArgs(['up', '--port', '3333', '-d']), {
    action: 'up',
    composeArgs: ['-d'],
    port: '3333',
  });
});

test('parseArgs validates the action and port', () => {
  assert.throws(() => parseArgs(['start']), /Unsupported action/);
  assert.throws(() => parseArgs(['up', '--port', 'abc']), /numeric value/);
  assert.throws(
    () => parseArgs(['up', '--port', '70000']),
    /between 1 and 65535/
  );
});

test('getDocsComposeArgs builds the expected compose command', () => {
  assert.deepEqual(getDocsComposeArgs('up', ['-d']), [
    'compose',
    '-f',
    DOCS_COMPOSE_FILE,
    'up',
    '--build',
    '--remove-orphans',
    '-d',
  ]);
  assert.deepEqual(getDocsComposeArgs('down'), [
    'compose',
    '-f',
    DOCS_COMPOSE_FILE,
    'down',
    '--remove-orphans',
  ]);
});

test('runDockerDocsWorkflow runs docker compose with the requested port', async () => {
  const calls = [];

  await runDockerDocsWorkflow(parseArgs(['up', '--port', '3333']), {
    env: { PATH: 'test-path' },
    runCommand: async (command, args, options = {}) => {
      calls.push({
        args,
        command,
        env: options.env,
        stdio: options.stdio ?? 'inherit',
      });

      return { code: 0, signal: null, stderr: '', stdout: '' };
    },
  });

  assert.deepEqual(
    calls.map((call) => [call.command, call.args]),
    [
      ['docker', ['compose', 'version']],
      [
        'docker',
        [
          'compose',
          '-f',
          DOCS_COMPOSE_FILE,
          'up',
          '--build',
          '--remove-orphans',
        ],
      ],
    ]
  );
  assert.equal(calls[0].stdio, 'ignore');
  assert.equal(calls[1].env.DOCS_PORT, '3333');
  assert.equal(calls[1].env.PATH, 'test-path');
});
