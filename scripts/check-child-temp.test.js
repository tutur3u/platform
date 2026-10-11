const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createCheckChildEnvironment } = require('./check-child-temp.js');
const testEnv = process.env;
const runner =
  testEnv.CHECK_CHILD_TEMP_RUNNER ?? path.join(__dirname, 'check.js');
const { runCheck, getCheckQueuePaths } = require(runner);

function fixture(t) {
  const directory = fs.mkdtempSync(
    path.join(fs.realpathSync(os.tmpdir()), 'check-child-temp-')
  );
  fs.chmodSync(directory, 0o700);
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test('runCheck redirects only the real child temp directory', async (t) => {
  const directory = fixture(t);
  const old = testEnv.TUTURUUU_CHECK_CHILD_TMPDIR;
  const parent = os.tmpdir();
  const queues = getCheckQueuePaths();
  testEnv.TUTURUUU_CHECK_CHILD_TMPDIR = directory;
  t.after(() => {
    if (old === undefined) delete testEnv.TUTURUUU_CHECK_CHILD_TMPDIR;
    else testEnv.TUTURUUU_CHECK_CHILD_TMPDIR = old;
  });
  const result = await runCheck(
    {
      name: 'temp-probe',
      parseOutput: () => 'ok',
      command: process.execPath,
      args: ['-e', "console.log(require('node:os').tmpdir())"],
    },
    { forceBuffered: true }
  );
  assert.equal(result.success, true);
  assert.equal(result.stdout.trim(), directory);
  assert.equal(os.tmpdir(), parent);
  assert.deepEqual(getCheckQueuePaths(), queues);
});

test('unset option preserves temp, HOME and broker environment', () => {
  const env = {
    HOME: '/home/test',
    TMPDIR: '/tmp/original',
    TTR_RESOURCES_HOME: '/home/test/.tuturuuu/resources',
  };
  const child = createCheckChildEnvironment(false, { env });
  assert.deepEqual(child, { ...env, FORCE_COLOR: '1', CHECK_DETAILS: '0' });
  assert.equal(env.TMPDIR, '/tmp/original');
});

test('valid child environment preserves broker HOME and removes recursive option', (t) => {
  const directory = fixture(t);
  const env = { HOME: os.homedir(), TUTURUUU_CHECK_CHILD_TMPDIR: directory };
  const child = createCheckChildEnvironment(true, { env });
  assert.equal(child.HOME, env.HOME);
  assert.equal(child.TTR_RESOURCES_HOME, undefined);
  assert.equal(child.TUTURUUU_CHECK_CHILD_TMPDIR, undefined);
  assert.equal(child.TUTURUUU_CHECK_CHILD_TEMP_ACTIVE, '1');
  for (const key of ['TMPDIR', 'TMP', 'TEMP'])
    assert.equal(child[key], directory);
  assert.deepEqual(env, {
    HOME: os.homedir(),
    TUTURUUU_CHECK_CHILD_TMPDIR: directory,
  });
});

test('relative, missing, wrong-owner and unsafe-mode paths fail closed', (t) => {
  const directory = fixture(t);
  for (const value of ['', 'relative', `${directory}/missing`]) {
    assert.throws(() =>
      createCheckChildEnvironment(false, {
        env: { TUTURUUU_CHECK_CHILD_TMPDIR: value },
      })
    );
  }
  assert.throws(() =>
    createCheckChildEnvironment(false, {
      uid: process.getuid() + 1,
      env: { TUTURUUU_CHECK_CHILD_TMPDIR: directory },
    })
  );
  fs.chmodSync(directory, 0o755);
  assert.throws(() =>
    createCheckChildEnvironment(false, {
      env: { TUTURUUU_CHECK_CHILD_TMPDIR: directory },
    })
  );
});

test('symlink directories are rejected and validation is fresh per spawn', (t) => {
  const directory = fixture(t);
  const link = path.join(directory, 'link');
  fs.symlinkSync(directory, link);
  assert.throws(() =>
    createCheckChildEnvironment(false, {
      env: { TUTURUUU_CHECK_CHILD_TMPDIR: link },
    })
  );
  const env = { TUTURUUU_CHECK_CHILD_TMPDIR: directory };
  createCheckChildEnvironment(false, { env });
  fs.chmodSync(directory, 0o777);
  assert.throws(() => createCheckChildEnvironment(false, { env }));
});

test('nested CLI rejects before check queue creation while imports remain allowed', (t) => {
  const directory = fixture(t);
  const env = createCheckChildEnvironment(false, {
    env: process.env,
    uid: process.getuid(),
  });
  env.TMPDIR = directory;
  env.TUTURUUU_CHECK_CHILD_TEMP_ACTIVE = '1';
  const result = spawnSync(
    process.execPath,
    [path.join(__dirname, 'check.js')],
    { env, encoding: 'utf8' }
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Nested bun check/);
  assert.equal(
    fs.existsSync(path.join(directory, 'tuturuuu-bun-check')),
    false
  );
  const imported = spawnSync(
    process.execPath,
    ['-e', `require(${JSON.stringify(path.join(__dirname, 'check.js'))})`],
    { env, encoding: 'utf8' }
  );
  assert.equal(imported.status, 0);
});

test('invalid option prevents the real validation child from running', async (t) => {
  const directory = fixture(t);
  const marker = path.join(directory, 'child-ran');
  const old = testEnv.TUTURUUU_CHECK_CHILD_TMPDIR;
  testEnv.TUTURUUU_CHECK_CHILD_TMPDIR = 'relative';
  t.after(() => {
    if (old === undefined) delete testEnv.TUTURUUU_CHECK_CHILD_TMPDIR;
    else testEnv.TUTURUUU_CHECK_CHILD_TMPDIR = old;
  });
  await assert.rejects(
    runCheck({
      name: 'invalid-temp-probe',
      parseOutput: () => 'ok',
      command: process.execPath,
      args: [
        '-e',
        'require("node:fs").writeFileSync(' +
          JSON.stringify(marker) +
          ', "ran")',
      ],
    })
  );
  assert.equal(fs.existsSync(marker), false);
});

test('resource-home symlink aliases cannot admit real queue descendants', (t) => {
  const directory = fixture(t);
  const resourceRoot = path.join(directory, 'real-resources');
  const childTemp = path.join(resourceRoot, 'scratch');
  const alias = path.join(directory, 'resource-alias');
  fs.mkdirSync(resourceRoot, { mode: 0o700 });
  fs.mkdirSync(childTemp, { mode: 0o700 });
  fs.symlinkSync(resourceRoot, alias);
  const env = {
    HOME: directory,
    TTR_RESOURCES_HOME: alias,
    TUTURUUU_CHECK_CHILD_TMPDIR: childTemp,
  };
  const before = { ...env };
  assert.throws(
    () => createCheckChildEnvironment(false, { env }),
    /must not be a shared queue/
  );
  assert.deepEqual(env, before);
  assert.deepEqual(fs.readdirSync(resourceRoot), ['scratch']);
});

test('missing queue suffix uses existing ancestor without creating directories', (t) => {
  const directory = fixture(t);
  const root = path.join(directory, 'real-home');
  const alias = path.join(directory, 'home-alias');
  fs.mkdirSync(root, { mode: 0o700 });
  fs.symlinkSync(root, alias);
  const child = createCheckChildEnvironment(false, {
    env: {
      HOME: alias,
      TUTURUUU_CHECK_CHILD_TMPDIR: directory,
    },
  });
  assert.equal(child.TMPDIR, directory);
  assert.equal(child.HOME, alias);
  assert.deepEqual(fs.readdirSync(root), []);
});

test('resource-root access errors and filesystem-root queues fail closed', (t) => {
  const directory = fixture(t);
  const resourceRoot = path.join(directory, 'resources');
  const deniedFs = Object.create(fs);
  deniedFs.lstatSync = (value) => {
    if (value === resourceRoot) {
      const error = new Error('permission denied');
      error.code = 'EACCES';
      throw error;
    }
    return fs.lstatSync(value);
  };
  assert.throws(
    () =>
      createCheckChildEnvironment(false, {
        fs: deniedFs,
        env: {
          TTR_RESOURCES_HOME: resourceRoot,
          TUTURUUU_CHECK_CHILD_TMPDIR: directory,
        },
      }),
    /permission denied/
  );
  assert.throws(
    () =>
      createCheckChildEnvironment(false, {
        env: {
          TTR_RESOURCES_HOME: path.parse(directory).root,
          TUTURUUU_CHECK_CHILD_TMPDIR: directory,
        },
      }),
    /must not be a shared queue/
  );
});

test('strict Turbo preserves child temp and nested CLI guard before queue creation', (t) => {
  const directory = fixture(t);
  const task = path.join(directory, 'turbo-task');
  fs.mkdirSync(task, { mode: 0o700 });
  const repo = path.resolve(__dirname, '..');
  const config = JSON.parse(
    fs.readFileSync(path.join(repo, 'turbo.json'), 'utf8')
  );
  fs.writeFileSync(
    path.join(task, 'turbo.json'),
    JSON.stringify({
      globalEnv: config.globalEnv,
      globalPassThroughEnv: config.globalPassThroughEnv,
      tasks: { probe: { cache: false } },
    })
  );
  fs.writeFileSync(
    path.join(task, 'package.json'),
    JSON.stringify({
      name: 'owned-check-temp-probe',
      private: true,
      packageManager: JSON.parse(
        fs.readFileSync(path.join(repo, 'package.json'), 'utf8')
      ).packageManager,
      scripts: { probe: 'node probe.js' },
    })
  );
  fs.symlinkSync(
    path.join(repo, 'node_modules'),
    path.join(task, 'node_modules'),
    'dir'
  );
  fs.writeFileSync(
    path.join(task, 'probe.js'),
    `
    const assert = require('node:assert/strict');
    const fs = require('node:fs');
    const path = require('node:path');
    const { spawnSync } = require('node:child_process');
    const temp = require('node:os').tmpdir();
    assert.equal(temp, ${JSON.stringify(directory)});
    assert.equal(process.env.TUTURUUU_CHECK_CHILD_TEMP_ACTIVE, '1');
    assert.equal(process.env.TUTURUUU_CHECK_CHILD_TMPDIR, undefined);
    const queue = path.join(temp, 'tuturuuu-bun-check');
    assert.equal(fs.existsSync(queue), false);
    // Invoke only after the inherited guard has been proven present.
    const nested = spawnSync(process.execPath, [${JSON.stringify(path.join(repo, 'scripts/check.js'))}], { env: process.env, encoding: 'utf8' });
    assert.notEqual(nested.status, 0);
    assert.match(nested.stderr, /Nested bun check/);
    assert.equal(fs.existsSync(queue), false);
  `
  );
  const env = createCheckChildEnvironment(false, {
    env: { ...testEnv, TUTURUUU_CHECK_CHILD_TMPDIR: directory },
  });
  env.TURBO_TELEMETRY_DISABLED = '1';
  const result = spawnSync(
    path.join(repo, 'node_modules/.bin/turbo'),
    [
      'run',
      'probe',
      '--env-mode=strict',
      '--cache=local:rw',
      `--cache-dir=${path.join(task, 'cache')}`,
      '--output-logs=full',
    ],
    { cwd: task, env, encoding: 'utf8' }
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(
    fs.existsSync(path.join(directory, 'tuturuuu-bun-check')),
    false
  );
});
