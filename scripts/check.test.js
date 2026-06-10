const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  acquireCheckQueueLock,
  checks,
  discordPythonCheck,
  forceClearCheckQueue,
  getActiveChecks,
  getChangedFiles,
  getCheckQueuePaths,
  listTrackedCheckProcesses,
  parseBiomeIssueStats,
  touchesDiscordPython,
  touchesPlatformReleaseVersion,
} = require('./check.js');
const {
  createDiscordPythonChecks,
  getTopLevelPythonFiles,
  runDiscordPythonChecks,
} = require('./check-discord-python.js');

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'check-queue-'));
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

test('touchesDiscordPython detects Discord app and workflow paths', () => {
  assert.equal(touchesDiscordPython(['apps/discord/app.py']), true);
  assert.equal(touchesDiscordPython(['apps/discord/tests/test_app.py']), true);
  assert.equal(
    touchesDiscordPython(['.github/workflows/discord-python-ci.yml']),
    true
  );
  assert.equal(touchesDiscordPython(['apps/web/src/app/page.tsx']), false);
});

test('getChangedFiles combines tracked and untracked Git paths', () => {
  const calls = [];
  const files = getChangedFiles({
    execFile: (command, args) => {
      assert.equal(command, 'git');
      calls.push(args);

      if (args[0] === 'diff') {
        return 'apps/discord/app.py\r\napps/web/src/app/page.tsx\n';
      }

      if (args[0] === 'ls-files') {
        return './apps/discord/new_file.py\n';
      }

      throw new Error(`Unexpected git args: ${args.join(' ')}`);
    },
    rootDir: '/repo',
  });

  assert.deepEqual(calls, [
    ['diff', '--name-only', '--diff-filter=ACMRD', 'HEAD', '--'],
    ['ls-files', '--others', '--exclude-standard', '--'],
  ]);
  assert.deepEqual(files, [
    'apps/discord/app.py',
    'apps/discord/new_file.py',
    'apps/web/src/app/page.tsx',
  ]);
});

test('getActiveChecks adds Discord Python validation after script tests when Discord changes', () => {
  const unchangedChecks = getActiveChecks({
    changedFiles: ['apps/web/src/app/page.tsx'],
  });
  assert.equal(
    unchangedChecks.some((check) => check.name === discordPythonCheck.name),
    false
  );

  const activeChecks = getActiveChecks({
    changedFiles: ['apps/discord/ai_agent_gateway_watcher.py'],
  });
  const scriptTestsIndex = activeChecks.findIndex(
    (check) => check.name === 'script-tests'
  );

  assert.notEqual(scriptTestsIndex, -1);
  assert.equal(activeChecks[scriptTestsIndex + 1].name, 'discord-python');
  assert.deepEqual(discordPythonCheck.args, [
    'scripts/check-discord-python.js',
  ]);
});

test('bun check always includes mobile dependency compatibility validation', () => {
  const activeChecks = getActiveChecks({
    changedFiles: ['apps/web/src/app/page.tsx'],
  });
  const mobileDependencyCheck = activeChecks.find(
    (check) => check.name === 'mobile-dependency-compat'
  );
  const scriptTestsIndex = activeChecks.findIndex(
    (check) => check.name === 'script-tests'
  );
  const mobileDependencyIndex = activeChecks.findIndex(
    (check) => check.name === 'mobile-dependency-compat'
  );

  assert.ok(mobileDependencyCheck);
  assert.deepEqual(mobileDependencyCheck.args, [
    'scripts/check-mobile-dependencies.js',
  ]);
  assert.ok(mobileDependencyIndex > -1);
  assert.ok(mobileDependencyIndex < scriptTestsIndex);
});

test('bun check always includes mobile iOS project settings validation', () => {
  const activeChecks = getActiveChecks({
    changedFiles: ['apps/web/src/app/page.tsx'],
  });
  const mobileIosProjectCheck = activeChecks.find(
    (check) => check.name === 'mobile-ios-project-settings'
  );
  const scriptTestsIndex = activeChecks.findIndex(
    (check) => check.name === 'script-tests'
  );
  const mobileIosProjectIndex = activeChecks.findIndex(
    (check) => check.name === 'mobile-ios-project-settings'
  );

  assert.ok(mobileIosProjectCheck);
  assert.deepEqual(mobileIosProjectCheck.args, [
    'scripts/check-mobile-ios-project.js',
  ]);
  assert.ok(mobileIosProjectIndex > -1);
  assert.ok(mobileIosProjectIndex < scriptTestsIndex);
});

test('bun check includes platform release sync validation for release-please files only', () => {
  assert.equal(touchesPlatformReleaseVersion(['platform-version.txt']), true);
  assert.equal(
    touchesPlatformReleaseVersion(['.release-please-manifest.json']),
    true
  );
  assert.equal(
    touchesPlatformReleaseVersion(['packages/utils/src/platform-release.ts']),
    false
  );

  const unchangedChecks = getActiveChecks({
    changedFiles: ['packages/utils/src/platform-release.ts'],
  });
  assert.equal(
    unchangedChecks.some((check) => check.name === 'platform-release-version'),
    false
  );

  const activeChecks = getActiveChecks({
    changedFiles: ['platform-version.txt'],
  });
  const platformReleaseCheck = activeChecks.find(
    (check) => check.name === 'platform-release-version'
  );
  const scriptTestsIndex = activeChecks.findIndex(
    (check) => check.name === 'script-tests'
  );
  const platformReleaseIndex = activeChecks.findIndex(
    (check) => check.name === 'platform-release-version'
  );

  assert.ok(platformReleaseCheck);
  assert.deepEqual(platformReleaseCheck.args, [
    'scripts/sync-platform-release-version.js',
    '--check',
  ]);
  assert.ok(platformReleaseIndex > -1);
  assert.ok(platformReleaseIndex < scriptTestsIndex);
});

test('Biome check treats warnings as blocking local check issues', () => {
  const biomeCheck = checks.find((check) => check.name === 'biome');

  assert.ok(biomeCheck);
  assert.deepEqual(biomeCheck.args, ['biome', 'check', '--error-on-warnings']);

  const output = [
    'Checked 120 files in 300ms. No fixes applied.',
    'Found 2 lint issues.',
    '0 errors, 2 warnings, 0 infos',
  ].join('\n');
  const stats = parseBiomeIssueStats(output);

  assert.deepEqual(stats, {
    errors: 0,
    filesChecked: 120,
    infos: 0,
    totalIssues: 2,
    warnings: 2,
  });
  assert.equal(biomeCheck.parseOutput(output), '120 files checked');
  assert.equal(
    biomeCheck.validateOutput(output),
    'Found 2 Biome issue(s): 0 error(s), 2 warning(s), 0 info(s)'
  );
});

test('getTopLevelPythonFiles returns sorted top-level Python files only', () => {
  const fakeFs = {
    readdirSync: () => ['z.py', 'README.md', 'nested.py', 'a.py'],
    statSync: (filePath) => ({
      isFile: () => !filePath.endsWith('nested.py'),
    }),
  };

  assert.deepEqual(getTopLevelPythonFiles('/discord', fakeFs), [
    'a.py',
    'z.py',
  ]);
});

test('createDiscordPythonChecks mirrors blocking Discord Python CI commands', () => {
  const checks = createDiscordPythonChecks({
    pythonFiles: ['app.py', 'commands.py'],
  });

  assert.deepEqual(
    checks.map((check) => [check.command, check.args]),
    [
      ['uv', ['sync', '--locked']],
      ['uv', ['run', 'ruff', 'check', '.']],
      ['uv', ['run', 'ruff', 'format', '--check', '.']],
      ['uv', ['run', 'mypy', '.', '--config-file', 'mypy.ini']],
      ['uv', ['run', 'pytest']],
      ['uv', ['run', 'python', '-m', 'py_compile', 'app.py', 'commands.py']],
      [
        'uv',
        [
          'run',
          'python',
          '-c',
          'import daily_report; import commands; import discord_client; import wol_reminder',
        ],
      ],
    ]
  );
});

test('runDiscordPythonChecks stops on the first failing check', () => {
  const calls = [];
  const exitCode = runDiscordPythonChecks({
    checks: [
      { name: 'First', command: 'uv', args: ['run', 'first'] },
      { name: 'Second', command: 'uv', args: ['run', 'second'] },
      { name: 'Third', command: 'uv', args: ['run', 'third'] },
    ],
    cwd: '/discord',
    spawn: (command, args, options) => {
      calls.push([command, args, options.cwd]);
      return { status: calls.length === 1 ? 0 : 1 };
    },
  });

  assert.equal(exitCode, 1);
  assert.deepEqual(calls, [
    ['uv', ['run', 'first'], '/discord'],
    ['uv', ['run', 'second'], '/discord'],
  ]);
});

test('acquireCheckQueueLock serializes queued checks in order', async () => {
  const rootDir = createTempDir();
  const queueRoot = createTempDir();
  const queueMessages = [];
  const order = [];

  const first = await acquireCheckQueueLock({
    pollMs: 10,
    queueRoot,
    rootDir,
    stdoutWriter: (line) => queueMessages.push(line),
  });

  const secondPromise = acquireCheckQueueLock({
    pollMs: 10,
    queueRoot,
    rootDir,
    stdoutWriter: (line) => queueMessages.push(line),
  }).then((handle) => {
    order.push('second');
    return handle;
  });

  await sleep(20);

  const thirdPromise = acquireCheckQueueLock({
    pollMs: 10,
    queueRoot,
    rootDir,
    stdoutWriter: (line) => queueMessages.push(line),
  }).then((handle) => {
    order.push('third');
    return handle;
  });

  await sleep(40);
  assert.deepEqual(order, []);

  first.release();

  const second = await secondPromise;
  await sleep(40);
  assert.deepEqual(order, ['second']);

  let thirdResolved = false;
  thirdPromise.then(() => {
    thirdResolved = true;
  });

  await sleep(30);
  assert.equal(thirdResolved, false);

  second.release();

  const third = await thirdPromise;
  assert.deepEqual(order, ['second', 'third']);

  third.release();

  assert.ok(
    queueMessages.some((line) =>
      line.includes('Queued behind 1 earlier bun check invocation')
    )
  );
  assert.ok(
    queueMessages.some((line) =>
      line.includes('Queued behind 2 earlier bun check invocations')
    )
  );
});

test('acquireCheckQueueLock prunes stale tickets and stale locks', async () => {
  const rootDir = createTempDir();
  const queueRoot = createTempDir();
  const paths = getCheckQueuePaths(rootDir, { queueRoot });
  const staleTicketId = '0000000000000-99999999-deadbeef';
  const staleTicketPath = path.join(paths.ticketsDir, `${staleTicketId}.json`);

  fs.mkdirSync(paths.ticketsDir, { recursive: true });
  fs.writeFileSync(
    staleTicketPath,
    JSON.stringify(
      {
        createdAt: 0,
        pid: 999999,
        ticketId: staleTicketId,
      },
      null,
      2
    )
  );

  fs.mkdirSync(paths.lockDir, { recursive: true });
  fs.writeFileSync(
    paths.lockMetaPath,
    JSON.stringify(
      {
        createdAt: 0,
        pid: 999999,
        ticketId: 'stale-lock',
      },
      null,
      2
    )
  );

  const handle = await acquireCheckQueueLock({
    isPidActive: (pid) => pid === process.pid,
    pollMs: 10,
    queueRoot,
    rootDir,
    stdoutWriter: () => {},
  });

  const owner = JSON.parse(fs.readFileSync(paths.lockMetaPath, 'utf8'));
  assert.equal(owner.pid, process.pid);
  assert.equal(fs.existsSync(staleTicketPath), false);

  handle.release();

  assert.equal(fs.existsSync(paths.lockDir), false);
});

test('listTrackedCheckProcesses returns active owner and queued tickets once', () => {
  const rootDir = createTempDir();
  const queueRoot = createTempDir();
  const paths = getCheckQueuePaths(rootDir, { queueRoot });
  const sharedPid = process.pid;

  fs.mkdirSync(paths.ticketsDir, { recursive: true });
  fs.writeFileSync(
    path.join(paths.ticketsDir, '0000000000001-00000001-alpha.json'),
    JSON.stringify(
      {
        createdAt: 1,
        pid: sharedPid,
        ticketId: 'alpha',
      },
      null,
      2
    )
  );
  fs.mkdirSync(paths.lockDir, { recursive: true });
  fs.writeFileSync(
    paths.lockMetaPath,
    JSON.stringify(
      {
        createdAt: 0,
        pid: sharedPid,
        ticketId: 'owner-ticket',
      },
      null,
      2
    )
  );

  const trackedProcesses = listTrackedCheckProcesses(paths, {
    isPidActive: (pid) => pid === sharedPid,
  });

  assert.deepEqual(trackedProcesses, [
    {
      pid: sharedPid,
      source: 'ticket',
      ticketId: 'alpha',
    },
  ]);
});

test('forceClearCheckQueue terminates tracked checks before reacquiring the queue', async () => {
  const rootDir = createTempDir();
  const queueRoot = createTempDir();
  const paths = getCheckQueuePaths(rootDir, { queueRoot });
  const activePids = new Set([41001, 41002]);
  const killCalls = [];
  const queueMessages = [];

  fs.mkdirSync(paths.ticketsDir, { recursive: true });
  fs.writeFileSync(
    path.join(paths.ticketsDir, '0000000000002-00041002-bravo.json'),
    JSON.stringify(
      {
        createdAt: 2,
        pid: 41002,
        ticketId: 'bravo',
      },
      null,
      2
    )
  );
  fs.mkdirSync(paths.lockDir, { recursive: true });
  fs.writeFileSync(
    paths.lockMetaPath,
    JSON.stringify(
      {
        createdAt: 1,
        pid: 41001,
        ticketId: 'owner',
      },
      null,
      2
    )
  );

  await forceClearCheckQueue({
    isPidActive: (pid) => activePids.has(pid),
    killImpl: (pid, signal) => {
      killCalls.push([pid, signal]);
      activePids.delete(pid);
    },
    pid: process.pid,
    queueRoot,
    rootDir,
    sleepImpl: async () => {},
    stdoutWriter: (line) => queueMessages.push(line),
  });

  assert.deepEqual(killCalls, [
    [41001, 'SIGTERM'],
    [41002, 'SIGTERM'],
  ]);
  assert.ok(
    queueMessages.some((line) =>
      line.includes('Force stopping 2 earlier bun check invocations')
    )
  );
  assert.equal(fs.existsSync(paths.lockDir), false);
});

test('acquireCheckQueueLock forceNow clears earlier checks before taking the lock', async () => {
  const rootDir = createTempDir();
  const queueRoot = createTempDir();
  const paths = getCheckQueuePaths(rootDir, { queueRoot });
  const activePids = new Set([51001]);
  const killCalls = [];

  fs.mkdirSync(paths.lockDir, { recursive: true });
  fs.writeFileSync(
    paths.lockMetaPath,
    JSON.stringify(
      {
        createdAt: 1,
        pid: 51001,
        ticketId: 'owner',
      },
      null,
      2
    )
  );

  const handle = await acquireCheckQueueLock({
    forceNow: true,
    isPidActive: (pid) => activePids.has(pid) || pid === process.pid,
    killImpl: (pid, signal) => {
      killCalls.push([pid, signal]);
      activePids.delete(pid);
    },
    pid: process.pid,
    pollMs: 10,
    queueRoot,
    rootDir,
    sleepImpl: async () => {},
    stdoutWriter: () => {},
  });

  assert.deepEqual(killCalls, [[51001, 'SIGTERM']]);

  handle.release();

  assert.equal(fs.existsSync(paths.lockDir), false);
});
