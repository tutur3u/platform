const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { test } = require('node:test');
const {
  parseArgs,
  verifyBytes,
  assertIdle,
  worker,
  lease,
} = require('./sdk-rollout');

const idle = { occupied: 0, owner: null, owners: [], waiting: [] };
function fixture(t) {
  const userHome = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk-rollout-test-'));
  t.after(() => fs.rmSync(userHome, { recursive: true, force: true }));
  const home = path.join(userHome, '.tuturuuu/resources');
  const root = path.join(userHome, '.bun/install/global/node_modules/tuturuuu');
  const bin = path.join(userHome, '.bun/bin');
  for (const directory of [
    home,
    bin,
    path.join(root, 'bin'),
    path.join(root, 'dist/cli'),
    path.join(home, 'bin'),
  ])
    fs.mkdirSync(directory, { recursive: true });
  const config = {
    version: 1,
    enabled: true,
    roots: [userHome],
    repositories: [userHome],
    turboConcurrency: 1,
    vitestWorkers: 2,
    buildJobs: 3,
    validationLanes: 1,
    maxValidationLanes: 2,
  };
  const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value));
  const packageFile = path.join(root, 'package.json');
  write(packageFile, {
    name: 'tuturuuu',
    version: '0.28.0',
    bin: { ttr: './bin/ttr.cjs' },
  });
  fs.writeFileSync(path.join(root, 'bin/ttr.cjs'), 'old supplier');
  fs.writeFileSync(
    path.join(root, 'dist/cli/resources-entry.js'),
    'old resource supplier'
  );
  for (const name of ['ttr', 'tuturuuu', 'tutur3u'])
    fs.symlinkSync(path.join(root, 'bin/ttr.cjs'), path.join(bin, name));
  write(path.join(home, 'config.json'), config);
  write(path.join(home, 'install.json'), {
    shims: ['bun'],
    shellFiles: ['/retained-shell-config'],
  });
  fs.writeFileSync(path.join(home, 'bin/bun'), 'old shim');
  const tarball = path.join(userHome, 'candidate.tgz');
  fs.writeFileSync(tarball, 'verified fixture bytes');
  const sha256 = crypto
    .createHash('sha256')
    .update(fs.readFileSync(tarball))
    .digest('hex');
  const calls = [];
  const invoke = async (command, args, settings = {}) => {
    calls.push({ command, args, settings });
    if (args.includes('status')) return JSON.stringify(idle);
    if (args[0] === 'add') {
      assert.throws(
        () => fs.openSync(path.join(home, 'admission/reclaim'), 'wx'),
        { code: 'EEXIST' }
      );
      write(packageFile, {
        name: 'tuturuuu',
        version: '0.28.0-dev.1.abcdef0',
        tuturuuuBuild: {
          channel: 'dev',
          sourceSha: `abcdef0${'0'.repeat(33)}`,
          rolloutProtocol: 1,
        },
        bin: { ttr: './bin/ttr.cjs' },
      });
      fs.writeFileSync(path.join(root, 'bin/ttr.cjs'), 'new supplier');
      return '';
    }
    if (args.includes('setup')) {
      assert.ok(fs.existsSync(path.join(home, 'admission/owner.json')));
      assert.equal(
        settings.env.TTR_RESOURCES_MAINTENANCE,
        JSON.parse(fs.readFileSync(path.join(home, 'admission/owner.json')))
          .token
      );
      assert.ok(args.includes('none'));
      assert.equal(args.includes('--force'), false);
      return JSON.stringify({
        entry: path.join(root, 'dist/cli/resources-entry.js'),
      });
    }
    return '';
  };
  return {
    userHome,
    home,
    root,
    config,
    calls,
    invoke,
    options: { tarball, sha256, version: '0.28.0-dev.1.abcdef0', waitDrain: 0 },
  };
}
test('argument validation rejects ambiguous or unsafe targets and bounds waiting', () => {
  assert.deepEqual(
    parseArgs([
      '--channel',
      'dev',
      '--host',
      'skr-studio',
      '--host',
      'skr-sonha',
      '--wait-drain',
      '60',
    ]),
    { hosts: ['skr-studio', 'skr-sonha'], channel: 'dev', waitDrain: 60 }
  );
  for (const args of [
    [],
    ['--channel', 'next'],
    ['--tarball', 'file'],
    ['--channel', 'dev', '--tarball', 'file'],
    ['--channel', 'dev', '--host', '-oProxyCommand=evil'],
    ['--channel', 'dev', '--wait-drain', '3601'],
  ])
    assert.throws(() => parseArgs(args));
});
test('checksum verification covers SRI, sha1 and SHA-256 before install', () => {
  const bytes = Buffer.from('package');
  const digest = (algorithm, encoding = 'hex') =>
    crypto.createHash(algorithm).update(bytes).digest(encoding);
  assert.equal(
    verifyBytes(bytes, {
      sha256: digest('sha256'),
      shasum: digest('sha1'),
      integrity: `sha512-${digest('sha512', 'base64')}`,
    }),
    digest('sha256')
  );
  assert.throws(
    () => verifyBytes(bytes, { sha256: '0'.repeat(64) }),
    /mismatch/
  );
  assert.throws(
    () => verifyBytes(bytes, { integrity: 'sha512-bad' }),
    /mismatch/
  );
});
test('idle inspection fails closed for missing owners, waiters or malformed occupancy', () => {
  assert.doesNotThrow(() => assertIdle(idle));
  for (const status of [
    null,
    {},
    { ...idle, occupied: '0' },
    { ...idle, owner: undefined },
    { ...idle, owners: [{}] },
    { ...idle, waiting: [{}] },
    { ...idle, occupied: 1 },
  ])
    assert.throws(() => assertIdle(status));
});
test('holds the existing admission mutex, qualifies all roots and preserves policy and shell manifest', async (t) => {
  const f = fixture(t);
  const result = await worker(f.options, {
    userHome: f.userHome,
    env: {},
    run: f.invoke,
  });
  assert.equal(result.status, 'qualified');
  assert.equal(result.qualification.projectsChecked, 1);
  assert.equal(result.previousVersion, '0.28.0');
  assert.equal(result.rollback, 'not-needed');
  assert.equal(fs.existsSync(path.join(f.home, 'admission')), false);
  assert.equal(fs.existsSync(path.join(f.home, 'slots/0')), false);
  assert.deepEqual(
    JSON.parse(fs.readFileSync(path.join(f.home, 'config.json'))),
    f.config
  );
  assert.deepEqual(
    JSON.parse(fs.readFileSync(path.join(f.home, 'install.json'))).shellFiles,
    ['/retained-shell-config']
  );
  const install = f.calls.find((call) => call.args[0] === 'add');
  assert.deepEqual(install.args, [
    'add',
    '-g',
    '--ignore-scripts',
    f.options.tarball,
  ]);
  const setup = f.calls.filter((call) => call.args.includes('setup'));
  assert.ok(setup[0].args.includes('--dry-run'));
  assert.equal(setup[1].args.includes('--dry-run'), false);
  assert.ok(fs.existsSync(path.join(result.backup, 'rollback.sh')));
  assert.equal(fs.statSync(result.backup).mode & 0o777, 0o700);
});
test('qualification failure restores global install, config and launchers offline', async (t) => {
  const f = fixture(t);
  const invoke = async (...args) => {
    if (args[1].includes('run')) {
      fs.writeFileSync(path.join(f.home, 'bin/bun'), 'corrupt new shim');
      throw new Error('qualification defect');
    }
    return f.invoke(...args);
  };
  const result = await worker(f.options, {
    userHome: f.userHome,
    env: {},
    run: invoke,
  });
  assert.equal(result.status, 'failed');
  assert.equal(result.rollback, 'restored');
  assert.equal(
    fs.readFileSync(path.join(f.root, 'bin/ttr.cjs'), 'utf8'),
    'old supplier'
  );
  assert.equal(
    fs.readFileSync(path.join(f.home, 'bin/bun'), 'utf8'),
    'old shim'
  );
  assert.deepEqual(
    JSON.parse(fs.readFileSync(path.join(f.home, 'config.json'))),
    f.config
  );
  assert.equal(fs.existsSync(path.join(f.home, 'admission')), false);
  assert.equal(f.calls.filter((call) => call.args[0] === 'add').length, 1);
});
test('busy queue, mismatched checksum and workspace supplier refuse before mutation', async (t) => {
  const f = fixture(t);
  await assert.rejects(
    worker(
      { ...f.options, sha256: '0'.repeat(64) },
      { userHome: f.userHome, env: {}, run: f.invoke }
    ),
    /mismatch/
  );
  await assert.rejects(
    worker(f.options, {
      userHome: f.userHome,
      env: {},
      run: async () => JSON.stringify({ ...idle, waiting: [{}] }),
    }),
    /not drained/
  );
  assert.equal(fs.existsSync(path.join(f.home, 'admission')), false);
  fs.unlinkSync(path.join(f.userHome, '.bun/bin/ttr'));
  const outside = path.join(f.userHome, 'workspace.cjs');
  fs.writeFileSync(outside, 'workspace');
  fs.symlinkSync(outside, path.join(f.userHome, '.bun/bin/ttr'));
  await assert.rejects(
    worker(f.options, { userHome: f.userHome, env: {}, run: f.invoke }),
    /global Bun/
  );
  assert.equal(f.calls.filter((call) => call.args[0] === 'add').length, 0);
});
test('concurrent rollout never reclaims a held maintenance mutex', async (t) => {
  const f = fixture(t);
  const first = await lease(f.home, 0, f.invoke, 'fixture-cli');
  await assert.rejects(
    lease(f.home, 0, f.invoke, 'fixture-cli'),
    /not drained/
  );
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(f.home, 'admission/owner.json')))
      .token,
    first.token
  );
  first.release();
});
test('policy drift and shim writes trigger automatic rollback', async (t) => {
  for (const defect of ['policy', 'shim']) {
    const f = fixture(t);
    const invoke = async (...args) => {
      const output = await f.invoke(...args);
      if (
        defect === 'policy' &&
        args[1].includes('setup') &&
        !args[1].includes('--dry-run')
      )
        fs.writeFileSync(
          path.join(f.home, 'config.json'),
          JSON.stringify({ ...f.config, buildJobs: 7 })
        );
      if (defect === 'shim' && args[0] === path.join(f.home, 'bin/bun'))
        fs.writeFileSync(
          path.join(f.home, 'bin/bun'),
          'self-rewriting launcher'
        );
      return output;
    };
    const result = await worker(f.options, {
      userHome: f.userHome,
      env: {},
      run: invoke,
    });
    assert.equal(result.status, 'failed');
    assert.equal(result.rollback, 'restored');
  }
});
test('the installer never starts when durable child publication fails', async (t) => {
  const { run } = require('./sdk-rollout');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rollout-gate-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const marker = path.join(directory, 'must-not-exist');
  await assert.rejects(
    run(
      process.execPath,
      [
        '-e',
        `require('node:fs').writeFileSync(${JSON.stringify(marker)},'unsafe')`,
      ],
      {
        onSpawn: () => {
          throw new Error('receipt failed');
        },
      }
    ),
    /receipt failed/
  );
  assert.equal(fs.existsSync(marker), false);
});
test('bounded execution terminates and drains only its own subprocess group', async () => {
  const { run } = require('./sdk-rollout');
  const before = Date.now();
  await assert.rejects(
    run(process.execPath, ['-e', 'setInterval(()=>{},1000)'], {
      timeoutMs: 50,
    }),
    /timeout/
  );
  assert.ok(Date.now() - before < 5000);
});
test('offline backup materializes nested cache links and restores without the original cache', (t) => {
  const {
    backupInstallation,
    trustedGlobal,
    restore,
  } = require('./sdk-rollout');
  const f = fixture(t);
  const cache = path.join(f.userHome, '.bun/install/cache');
  fs.mkdirSync(cache);
  const cachedSdk = path.join(cache, 'old-sdk');
  fs.renameSync(f.root, cachedSdk);
  fs.symlinkSync(cachedSdk, f.root);
  const cachedDependency = path.join(cache, 'old-dependency');
  fs.mkdirSync(cachedDependency);
  fs.writeFileSync(
    path.join(cachedDependency, 'index.js'),
    'offline dependency'
  );
  fs.symlinkSync(
    cachedDependency,
    path.join(path.dirname(f.root), 'dependency')
  );
  const backup = backupInstallation(
    f.userHome,
    f.home,
    trustedGlobal(f.userHome)
  );
  fs.rmSync(cache, { recursive: true });
  restore(backup);
  assert.equal(
    fs.readFileSync(path.join(f.root, 'bin/ttr.cjs'), 'utf8'),
    'old supplier'
  );
  assert.equal(
    fs.readFileSync(
      path.join(path.dirname(f.root), 'dependency/index.js'),
      'utf8'
    ),
    'offline dependency'
  );
  assert.equal(trustedGlobal(f.userHome).manifest.version, '0.28.0');
});
test('interrupted recovery can be rerun using the same operation token and backup', async (t) => {
  const { backupInstallation, trustedGlobal, run } = require('./sdk-rollout');
  const f = fixture(t);
  const backup = backupInstallation(
    f.userHome,
    f.home,
    trustedGlobal(f.userHome)
  );
  const token = 'stable-operation';
  fs.writeFileSync(path.join(backup, 'lease.json'), JSON.stringify({ token }));
  fs.mkdirSync(path.join(f.home, 'admission'));
  fs.writeFileSync(path.join(f.home, 'admission/reclaim'), 'durable stop');
  fs.writeFileSync(
    path.join(f.home, 'admission/owner.json'),
    JSON.stringify({
      scheduler: 2,
      pid: 2147483647,
      token,
      tool: 'rollout',
      cwd: f.userHome,
      queuedAt: new Date().toISOString(),
    })
  );
  fs.renameSync(
    path.join(backup, 'saved-0'),
    path.join(backup, 'temporarily-missing')
  );
  const code = `require(${JSON.stringify(require.resolve('./sdk-rollout'))}).rollback(${JSON.stringify(backup)},{userHome:${JSON.stringify(f.userHome)}}).then(()=>process.stdout.write('restored'),()=>{process.exitCode=1})`;
  await assert.rejects(run(process.execPath, ['-e', code]));
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(f.home, 'admission/owner.json')))
      .token,
    token
  );
  assert.equal(fs.existsSync(path.join(f.home, 'admission/reclaim')), true);
  fs.renameSync(
    path.join(backup, 'temporarily-missing'),
    path.join(backup, 'saved-0')
  );
  assert.equal(await run(process.execPath, ['-e', code]), 'restored');
  assert.equal(fs.existsSync(path.join(f.home, 'admission')), false);
  assert.equal(trustedGlobal(f.userHome).manifest.version, '0.28.0');
});
test('candidate rejects pre-protocol and source-mismatched packages before rollout', async (t) => {
  const { candidate } = require('./sdk-rollout');
  const { execFileSync } = require('node:child_process');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rollout-package-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.mkdirSync(path.join(directory, 'package'));
  const tarball = path.join(directory, 'fixture.tgz');
  const build = {
    name: 'tuturuuu',
    version: '0.28.0-dev.1.abcdef0',
    bin: { ttr: './bin/ttr.cjs' },
    tuturuuuBuild: { channel: 'dev', sourceSha: `abcdef0${'0'.repeat(33)}` },
  };
  const pack = () => {
    fs.writeFileSync(
      path.join(directory, 'package/package.json'),
      JSON.stringify(build)
    );
    execFileSync('tar', ['-czf', tarball, '-C', directory, 'package']);
    const sha256 = crypto
      .createHash('sha256')
      .update(fs.readFileSync(tarball))
      .digest('hex');
    const output = fs.mkdtempSync(path.join(directory, 'output-'));
    return candidate({ tarball, sha256, waitDrain: 0 }, output);
  };
  await assert.rejects(pack(), /predates safe automatic rollout/);
  build.tuturuuuBuild.rolloutProtocol = 1;
  const accepted = await pack();
  assert.equal(accepted.channel, 'dev');
  assert.equal(accepted.sourceSha, build.tuturuuuBuild.sourceSha);
  build.tuturuuuBuild.sourceSha = 'f'.repeat(40);
  await assert.rejects(pack(), /matching channel and source SHA/);
});
test('fleet rollout preserves failed worker evidence, stops sequentially, and retains blocked staging', async (t) => {
  const { main } = require('./sdk-rollout');
  const calls = [];
  const workerReport = {
    schemaVersion: 1,
    status: 'failed',
    rollback: 'blocked-active-child',
    backup: '/private/backup',
    error: 'owned group uncertain',
  };
  const result = await main(
    ['--channel', 'dev', '--host', 'skr-studio', '--host', 'skr-sonha'],
    {
      candidate: async () => ({
        tarball: '/fixture.tgz',
        version: '0.28.0-dev.1.abcdef0',
        sha256: '0'.repeat(64),
      }),
      run: async (command, args) => {
        calls.push([command, args]);
        if (command === 'scp') return '';
        if (args.at(-1).includes('mktemp'))
          return '/tmp/ttr-rollout.ABCDEFGHIJ';
        if (args.at(-1).includes('--worker'))
          return JSON.stringify(workerReport);
        throw new Error('Blocked host staging must not be cleaned');
      },
    }
  );
  t.after(() => fs.rmSync(result.staging, { recursive: true, force: true }));
  assert.equal(result.status, 'failed');
  assert.equal(result.reports.length, 1);
  assert.equal(result.reports[0].backup, '/private/backup');
  assert.equal(result.reports[0].rollback, 'blocked-active-child');
  assert.equal(result.reports[0].staging, '/tmp/ttr-rollout.ABCDEFGHIJ');
  assert.ok(fs.existsSync(result.staging));
  assert.equal(
    calls.some(([, args]) => args.includes('skr-sonha')),
    false
  );
  assert.equal(
    calls.some(([, args]) => args.at(-1).includes('rm -rf')),
    false
  );
});
test('cleanup transport failure preserves known worker results and backup recovery path', async () => {
  const { main } = require('./sdk-rollout');
  const result = await main(['--channel', 'latest', '--host', 'skr-studio'], {
    candidate: async () => ({
      tarball: '/fixture.tgz',
      version: '0.29.0',
      sha256: '0'.repeat(64),
    }),
    run: async (command, args) => {
      if (command === 'scp') return '';
      if (args.at(-1).includes('mktemp')) return '/tmp/ttr-rollout.ABCDEFGHIJ';
      if (args.at(-1).includes('--worker'))
        return JSON.stringify({
          schemaVersion: 1,
          status: 'failed',
          rollback: 'restored',
          backup: '/private/backup',
        });
      throw new Error('cleanup disconnected');
    },
  });
  assert.equal(result.reports[0].rollback, 'restored');
  assert.equal(result.reports[0].backup, '/private/backup');
  assert.equal(result.reports[0].cleanupError, 'cleanup disconnected');
  assert.equal(result.reports[0].status, 'failed');
});
