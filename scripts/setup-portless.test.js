const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getSetupArgs,
  parsePortlessProxyReady,
  runPortlessSetup,
  shouldSkipPortlessSetup,
} = require('./setup-portless');

function createRunner({ statusOutput = '', statusCode = 0 } = {}) {
  const calls = [];
  const runner = (command, args, options = {}) => {
    calls.push({ args, command, options });

    if (args.join(' ') === 'service status') {
      return { status: statusCode, stdout: statusOutput, stderr: '' };
    }

    return { status: 0, stdout: '', stderr: '' };
  };

  return { calls, runner };
}

test('parsePortlessProxyReady detects an active 443 proxy', () => {
  assert.equal(
    parsePortlessProxyReady(`
portless service
  Installed: no
  Manager state: not installed
  Proxy on 443: responding
`),
    true
  );
  assert.equal(parsePortlessProxyReady('Proxy on 443: not responding'), false);
});

test('shouldSkipPortlessSetup skips CI, disabled, and non-interactive shells', () => {
  assert.equal(shouldSkipPortlessSetup({ CI: 'true' }, true), true);
  assert.equal(
    shouldSkipPortlessSetup({ SKIP_PORTLESS_SETUP: '1' }, true),
    true
  );
  assert.equal(shouldSkipPortlessSetup({ PORTLESS_SETUP: '0' }, true), true);
  assert.equal(shouldSkipPortlessSetup({}, false), true);
  assert.equal(shouldSkipPortlessSetup({}, true), false);
});

test('runPortlessSetup exits without starting when proxy is already ready', () => {
  const { calls, runner } = createRunner({
    statusOutput: 'Proxy on 443: responding',
  });
  const messages = [];

  const exitCode = runPortlessSetup({
    isTTY: true,
    log: (message) => messages.push(message),
    runner,
  });

  assert.equal(exitCode, 0);
  assert.equal(calls.length, 1);
  assert.match(messages.join('\n'), /already responding/iu);
});

test('runPortlessSetup starts the proxy daemon by default', () => {
  const { calls, runner } = createRunner({
    statusOutput: 'Proxy on 443: not responding',
  });

  const exitCode = runPortlessSetup({
    isTTY: true,
    log: () => {},
    runner,
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(
    calls.map((call) => call.args),
    [
      ['service', 'status'],
      ['proxy', 'start'],
    ]
  );
});

test('runPortlessSetup can install the startup service on request', () => {
  const { calls, runner } = createRunner({
    statusOutput: 'Proxy on 443: not responding',
  });

  const exitCode = runPortlessSetup({
    args: ['--service'],
    isTTY: true,
    log: () => {},
    runner,
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(
    calls.map((call) => call.args),
    [
      ['service', 'status'],
      ['service', 'install'],
    ]
  );
  assert.deepEqual(getSetupArgs(['--service']), ['service', 'install']);
});

test('runPortlessSetup skips setup in non-interactive shells', () => {
  const { calls, runner } = createRunner({
    statusOutput: 'Proxy on 443: not responding',
  });
  const messages = [];

  const exitCode = runPortlessSetup({
    isTTY: false,
    log: (message) => messages.push(message),
    runner,
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(
    calls.map((call) => call.args),
    [['service', 'status']]
  );
  assert.match(messages.join('\n'), /Skipping Portless setup/iu);
});
