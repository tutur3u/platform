const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  collectProjectRoutePids,
  isProjectRoute,
  loadKnownProjectHosts,
  parseArgs,
  parsePortlessRoutes,
  removeStaleProjectAliases,
  stopDev,
  stopPids,
} = require('./stop-dev');

function createFixture() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stop-dev-'));
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stop-dev-home-'));
  const portlessDir = path.join(homeDir, '.portless');
  fs.mkdirSync(portlessDir, { recursive: true });
  fs.writeFileSync(
    path.join(rootDir, 'portless.json'),
    JSON.stringify({
      apps: {
        'apps/chat': { name: 'chat.tuturuuu' },
        'apps/web': { name: 'tuturuuu' },
      },
    })
  );
  return { homeDir, portlessDir, rootDir };
}

test('parsePortlessRoutes tolerates invalid route files', () => {
  assert.deepEqual(parsePortlessRoutes('not json'), []);
  assert.deepEqual(
    parsePortlessRoutes(
      JSON.stringify([
        { hostname: 'tuturuuu.localhost', port: '4294', pid: 100 },
        { hostname: 'bad.localhost', port: 'nope', pid: 1 },
      ])
    ),
    [{ hostname: 'tuturuuu.localhost', pid: 100, port: 4294 }]
  );
});

test('loadKnownProjectHosts reads project Portless hostnames', () => {
  const { rootDir } = createFixture();

  assert.deepEqual([...loadKnownProjectHosts({ rootDir })].sort(), [
    'chat.tuturuuu.localhost',
    'tuturuuu.localhost',
  ]);
});

test('isProjectRoute includes known apps and worktree-prefixed aliases but excludes external hosts', () => {
  const knownHosts = new Set([
    'calendar.tuturuuu.localhost',
    'chat.tuturuuu.localhost',
    'tuturuuu.localhost',
  ]);

  assert.equal(
    isProjectRoute({ hostname: 'chat.tuturuuu.localhost' }, knownHosts),
    true
  );
  assert.equal(
    isProjectRoute({ hostname: 'branch.chat.tuturuuu.localhost' }, knownHosts),
    true
  );
  assert.equal(
    isProjectRoute({ hostname: 'other.tuturuuu.localhost' }, knownHosts),
    true
  );
  assert.equal(
    isProjectRoute({ hostname: 'calendar.tuturuuu.localhost' }, knownHosts),
    true
  );
  assert.equal(
    isProjectRoute({ hostname: 'external.example.localhost' }, knownHosts),
    false
  );
});

test('collectProjectRoutePids combines route pids and listener pids', async () => {
  const knownHosts = new Set(['tuturuuu.localhost']);
  const pids = await collectProjectRoutePids({
    knownHosts,
    listPids: (port) => (port === 4294 ? [22, 33] : []),
    routes: [
      { hostname: 'tuturuuu.localhost', pid: 11, port: 4294 },
      { hostname: 'external.example.localhost', pid: 44, port: 4804 },
    ],
  });

  assert.deepEqual(pids, [11, 22, 33]);
});

test('removeStaleProjectAliases removes only closed project aliases', async () => {
  const calls = [];
  const results = await removeStaleProjectAliases({
    checkPort: (port) => Promise.resolve(port === 4294),
    knownHosts: new Set(['tuturuuu.localhost']),
    routes: [
      { hostname: 'tuturuuu.localhost', pid: 0, port: 4294 },
      { hostname: 'branch.tuturuuu.localhost', pid: 0, port: 4999 },
      { hostname: 'external.example.localhost', pid: 0, port: 4804 },
    ],
    runner: (command, args) => {
      calls.push([command, args]);
      return { status: 0, stdout: '' };
    },
  });

  assert.deepEqual(calls, [
    ['bunx', ['portless', 'alias', '--remove', 'branch.tuturuuu']],
  ]);
  assert.deepEqual(
    results.map((result) => [result.hostname, result.action, result.ok]),
    [
      ['tuturuuu.localhost', 'kept-active', true],
      ['branch.tuturuuu.localhost', 'removed', true],
    ]
  );
});

test('stopPids sends SIGTERM and then SIGKILL to still-running processes', async () => {
  const calls = [];
  const processImpl = {
    kill(pid, signal) {
      calls.push([pid, signal]);
      return true;
    },
  };

  const results = await stopPids([123], {
    graceMs: 0,
    platform: 'darwin',
    processImpl,
  });

  assert.deepEqual(calls, [
    [123, 0],
    [-123, 'SIGTERM'],
    [123, 0],
    [-123, 'SIGKILL'],
  ]);
  assert.deepEqual(
    results.map((result) => result.action),
    ['SIGTERM', 'SIGKILL']
  );
});

test('stopDev dry-run previews process stops, alias cleanup, Supabase stop, and doctor', async () => {
  const { homeDir, portlessDir, rootDir } = createFixture();
  fs.writeFileSync(
    path.join(portlessDir, 'routes.json'),
    JSON.stringify([
      { hostname: 'chat.tuturuuu.localhost', port: 7811, pid: 123 },
      { hostname: 'branch.tuturuuu.localhost', port: 7803, pid: 0 },
    ])
  );
  const commands = [];
  const stdout = {
    chunks: [],
    write(chunk) {
      this.chunks.push(chunk);
    },
  };
  const stderr = {
    chunks: [],
    write(chunk) {
      this.chunks.push(chunk);
    },
  };

  const code = await stopDev({
    argv: ['--dry-run'],
    checkPort: () => Promise.resolve(false),
    homeDir,
    listPids: () => [456],
    rootDir,
    runner: (command, args) => {
      commands.push([command, args]);
      return { status: 0 };
    },
    stderr,
    stdout,
  });

  assert.equal(code, 0);
  assert.deepEqual(commands, []);
  assert.match(stdout.chunks.join(''), /Would stop 2 dev server process/u);
  assert.match(stdout.chunks.join(''), /Would remove stale Portless alias/u);
  assert.match(stdout.chunks.join(''), /Would run bun sb:stop/u);
  assert.match(stdout.chunks.join(''), /Would run bun doctor/u);
  assert.equal(stderr.chunks.join(''), '');
});

test('parseArgs supports cleanup flags', () => {
  assert.deepEqual(parseArgs(['--dry-run', '--no-doctor', '--no-supabase']), {
    dryRun: true,
    help: false,
    skipDoctor: true,
    skipSupabase: true,
  });
});
