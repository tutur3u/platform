const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  getDelegatedPortlessArgs,
  parsePortlessListOutput,
  resolveCurrentAppConfig,
  runPortlessSafeDev,
} = require('./portless-safe-dev');

function createTempAppRoot() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'portless-safe-dev-'));
  const webDir = path.join(rootDir, 'apps/web');
  const chatDir = path.join(rootDir, 'apps/chat');

  fs.mkdirSync(webDir, { recursive: true });
  fs.mkdirSync(chatDir, { recursive: true });
  fs.writeFileSync(
    path.join(rootDir, 'portless.json'),
    JSON.stringify(
      {
        apps: {
          'apps/chat': {
            name: 'chat.tuturuuu',
            script: 'dev:app',
          },
          'apps/web': {
            name: 'tuturuuu',
            script: 'dev:app',
          },
        },
      },
      null,
      2
    )
  );
  fs.writeFileSync(
    path.join(webDir, 'package.json'),
    JSON.stringify(
      {
        name: '@tuturuuu/web',
        portless: {
          name: 'tuturuuu',
          script: 'dev:app',
        },
        scripts: {
          dev: 'node ../../scripts/portless-safe-dev.js',
          'dev:app': `next dev -p \${PORT:-7803}`,
        },
      },
      null,
      2
    )
  );
  fs.writeFileSync(
    path.join(chatDir, 'package.json'),
    JSON.stringify(
      {
        name: '@tuturuuu/chat',
        portless: {
          name: 'chat.tuturuuu',
          script: 'dev:app',
        },
        scripts: {
          dev: 'node ../../scripts/portless-safe-dev.js',
          'dev:app': `next dev -p \${PORT:-7821}`,
        },
      },
      null,
      2
    )
  );

  return { rootDir, webDir };
}

function createExitingChild() {
  const child = new EventEmitter();

  child.kill = () => {};
  process.nextTick(() => child.emit('exit', 0, null));

  return child;
}

test('parsePortlessListOutput reads the backend port from the route target', () => {
  const routes = parsePortlessListOutput(
    'http://zalo-qr-chat-setup.tuturuuu.localhost:1355  ->  localhost:7803  (alias)'
  );

  assert.deepEqual(routes, [
    {
      host: 'zalo-qr-chat-setup.tuturuuu.localhost',
      isAlias: true,
      line: 'http://zalo-qr-chat-setup.tuturuuu.localhost:1355  ->  localhost:7803  (alias)',
      port: 7803,
    },
  ]);
});

test('resolveCurrentAppConfig reads the nearest package and root Portless map', () => {
  const { rootDir, webDir } = createTempAppRoot();

  assert.deepEqual(resolveCurrentAppConfig({ cwd: webDir, rootDir }), {
    defaultPort: 7803,
    packageName: '@tuturuuu/web',
    path: 'apps/web',
    routeName: 'tuturuuu',
    scriptName: 'dev:app',
  });
});

test('runPortlessSafeDev removes closed same-app aliases before delegation', async () => {
  const { rootDir, webDir } = createTempAppRoot();
  const calls = [];
  const spawnCalls = [];

  await runPortlessSafeDev({
    checkPort: async () => false,
    cwd: webDir,
    rootDir,
    runner: (command, args) => {
      calls.push([command, args]);

      if (args[0] === 'list') {
        return {
          status: 0,
          stderr: '',
          stdout: [
            'Active routes:',
            '  http://zalo-qr-chat-setup.tuturuuu.localhost:1355  ->  localhost:7803  (alias)',
            '  http://chat.tuturuuu.localhost:1355  ->  localhost:7821  (alias)',
          ].join('\n'),
        };
      }

      return { status: 0, stderr: '', stdout: 'Removed alias' };
    },
    spawnImpl: (command, args) => {
      spawnCalls.push([command, args]);
      return createExitingChild();
    },
    stderr: { write() {} },
    stdout: { write() {} },
  });

  assert.deepEqual(
    calls.map(([, args]) => args),
    [['list'], ['alias', '--remove', 'zalo-qr-chat-setup.tuturuuu']]
  );
  assert.deepEqual(spawnCalls, [['portless', []]]);
});

test('runPortlessSafeDev preserves open same-app aliases', async () => {
  const { rootDir, webDir } = createTempAppRoot();
  const calls = [];

  await runPortlessSafeDev({
    checkPort: async () => true,
    cwd: webDir,
    rootDir,
    runner: (command, args) => {
      calls.push([command, args]);

      return {
        status: 0,
        stderr: '',
        stdout:
          'Active routes:\n  http://tuturuuu.localhost:1355  ->  localhost:7803  (alias)',
      };
    },
    spawnImpl: () => createExitingChild(),
    stderr: { write() {} },
    stdout: { write() {} },
  });

  assert.deepEqual(
    calls.map(([, args]) => args),
    [['list']]
  );
});

test('runPortlessSafeDev preserves unrelated app aliases', async () => {
  const { rootDir, webDir } = createTempAppRoot();
  const calls = [];

  await runPortlessSafeDev({
    checkPort: async () => false,
    cwd: webDir,
    rootDir,
    runner: (command, args) => {
      calls.push([command, args]);

      return {
        status: 0,
        stderr: '',
        stdout:
          'Active routes:\n  http://chat.tuturuuu.localhost:1355  ->  localhost:7821  (alias)',
      };
    },
    spawnImpl: () => createExitingChild(),
    stderr: { write() {} },
    stdout: { write() {} },
  });

  assert.deepEqual(
    calls.map(([, args]) => args),
    [['list']]
  );
});

test('package-local --force delegates through portless run force mode', () => {
  assert.deepEqual(
    getDelegatedPortlessArgs(['--force'], { routeName: 'tuturuuu' }),
    ['run', '--name', 'tuturuuu', '--force']
  );
  assert.deepEqual(
    getDelegatedPortlessArgs(['list'], { routeName: 'tuturuuu' }),
    ['list']
  );
});
