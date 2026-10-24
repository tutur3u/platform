const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { worker, rollback, lease } = require('./sdk-rollout-engine');
const {
  fenceMutation,
  pruneRetention,
  retainCandidate,
} = require('./sdk-rollout-state');

function fixture(t) {
  const userHome = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk-recovery-'));
  t.after(() => fs.rmSync(userHome, { recursive: true, force: true }));
  const home = path.join(userHome, '.tuturuuu/resources');
  const root = path.join(userHome, '.bun/install/global/node_modules/tuturuuu');
  for (const dir of [
    home,
    path.join(root, 'bin'),
    path.join(root, 'dist/cli'),
    path.join(userHome, '.bun/bin'),
    path.join(home, 'bin'),
  ])
    fs.mkdirSync(dir, { recursive: true });
  const json = (file, data) => fs.writeFileSync(file, JSON.stringify(data));
  const old = {
    name: 'tuturuuu',
    version: '0.28.0',
    bin: { ttr: './bin/ttr.cjs' },
  };
  json(path.join(root, 'package.json'), old);
  fs.writeFileSync(path.join(root, 'bin/ttr.cjs'), 'old wrapper');
  fs.writeFileSync(
    path.join(root, 'dist/cli/resources-entry.js'),
    'old scheduler'
  );
  for (const alias of ['ttr', 'tuturuuu', 'tutur3u'])
    fs.symlinkSync(
      path.join(root, 'bin/ttr.cjs'),
      path.join(userHome, '.bun/bin', alias)
    );
  const config = {
    version: 1,
    enabled: true,
    roots: [userHome],
    repositories: [userHome],
    turboConcurrency: 1,
    vitestWorkers: 1,
    buildJobs: 1,
  };
  json(path.join(home, 'config.json'), config);
  json(path.join(home, 'install.json'), { shims: ['bun'], shellFiles: [] });
  fs.writeFileSync(path.join(home, 'bin/bun'), 'scheduler shim');
  const tarball = path.join(userHome, 'candidate.tgz');
  fs.writeFileSync(tarball, 'candidate bytes');
  const sha256 = crypto
    .createHash('sha256')
    .update(fs.readFileSync(tarball))
    .digest('hex');
  const options = {
    version: '0.29.0-dev.1.abcdef0',
    waitDrain: 0,
    tarball,
    sha256,
  };
  const calls = [];
  const invoke = async (command, args) => {
    calls.push({ command, args });
    if (args.includes('status'))
      throw new Error('broken candidate status must never execute');
    if (args[0] === 'add') {
      assert.equal(
        JSON.parse(fs.readFileSync(path.join(home, 'admission/mutation.json')))
          .phase,
        'install'
      );
      assert.equal(fs.existsSync(path.join(home, 'admission/reclaim')), true);
      json(path.join(root, 'package.json'), {
        ...old,
        version: options.version,
        tuturuuuBuild: { rolloutProtocol: 1 },
      });
      fs.writeFileSync(path.join(root, 'bin/ttr.cjs'), 'new wrapper');
    }
    if (args.includes('setup'))
      return JSON.stringify({
        entry: path.join(root, 'dist/cli/resources-entry.js'),
      });
    return '';
  };
  return { userHome, home, root, config, options, invoke, calls };
}

test('manual rollback never executes broken candidate status', async (t) => {
  const f = fixture(t);
  const result = await worker(f.options, {
    userHome: f.userHome,
    run: f.invoke,
    env: {},
  });
  assert.equal(result.status, 'qualified');
  const restored = await rollback(result.backup, {
    userHome: f.userHome,
    run: async () => {
      throw new Error('candidate CLI is broken');
    },
  });
  assert.equal(restored.status, 'restored');
  assert.equal(
    fs.readFileSync(path.join(f.root, 'bin/ttr.cjs'), 'utf8'),
    'old wrapper'
  );
  assert.equal(
    f.calls.some((call) => call.args.includes('status')),
    false
  );
});

test('later rollback refuses new global packages or root and limit changes', async (t) => {
  for (const changed of ['global', 'config']) {
    const f = fixture(t);
    const result = await worker(f.options, {
      userHome: f.userHome,
      run: f.invoke,
      env: {},
    });
    assert.equal(result.status, 'qualified');
    const file =
      changed === 'global'
        ? path.join(f.userHome, '.bun/install/global/new-package')
        : path.join(f.home, 'config.json');
    const bytes =
      changed === 'global'
        ? 'new global package'
        : JSON.stringify({
            ...f.config,
            vitestWorkers: 2,
            roots: [f.userHome, '/new-root'],
          });
    fs.writeFileSync(file, bytes);
    await assert.rejects(
      rollback(result.backup, { userHome: f.userHome }),
      /changed since rollout/
    );
    assert.equal(fs.readFileSync(file, 'utf8'), bytes);
    assert.equal(fs.existsSync(path.join(f.home, 'admission')), false);
  }
});

test('signals are handled during lease preparation before any backup exists', async (t) => {
  const f = fixture(t),
    baseline = process.listenerCount('SIGINT');
  let checked = false;
  await assert.rejects(
    worker(f.options, {
      userHome: f.userHome,
      run: f.invoke,
      env: {},
      cancelled: () => {
        if (!checked) {
          checked = true;
          assert.equal(process.listenerCount('SIGINT'), baseline + 1);
          process.emit('SIGINT');
        }
        return false;
      },
    }),
    /interrupted/
  );
  assert.equal(fs.existsSync(path.join(f.home, 'admission')), false);
  assert.equal(fs.existsSync(path.join(f.home, 'backups')), false);
  assert.equal(process.listenerCount('SIGINT'), baseline);
});

test('direct idle inspection refuses occupants without calling any supplier', async (t) => {
  const f = fixture(t);
  fs.mkdirSync(path.join(f.home, 'queue'));
  fs.writeFileSync(path.join(f.home, 'queue/ticket'), 'unknown owner');
  await assert.rejects(
    lease(
      f.home,
      0,
      async () => {
        throw new Error('must not execute');
      },
      'broken-cli'
    ),
    /not drained/
  );
  assert.equal(
    fs.readFileSync(path.join(f.home, 'queue/ticket'), 'utf8'),
    'unknown owner'
  );
});

test('malformed lease cleanup never masks the original operation failure', async (t) => {
  const f = fixture(t);
  const result = await worker(f.options, {
    userHome: f.userHome,
    env: {},
    run: async (command, args) => {
      if (args[0] === 'add') {
        assert.equal(
          JSON.parse(
            fs.readFileSync(path.join(f.home, 'admission/mutation.json'))
          ).phase,
          'install'
        );
        assert.equal(
          fs.existsSync(path.join(f.home, 'admission/reclaim')),
          true
        );
        fs.writeFileSync(path.join(f.home, 'admission/owner.json'), '{');
        throw new Error('original install defect');
      }
      return f.invoke(command, args);
    },
  });
  assert.equal(result.status, 'failed');
  assert.equal(result.error, 'original install defect');
  assert.equal(result.rollback, 'blocked-active-child');
  assert.equal(
    fs.existsSync(path.join(f.home, 'admission/mutation.json')),
    true
  );
});

test('bounded retention keeps recovery backups and stable candidate references', (t) => {
  const f = fixture(t),
    backups = path.join(f.home, 'backups');
  fs.mkdirSync(backups);
  const dirs = [];
  for (let i = 1; i <= 9; i++) {
    const dir = path.join(
      backups,
      `2026-10-24T00-00-0${i}-000Z-${crypto.randomUUID()}`
    );
    fs.mkdirSync(dir);
    fs.writeFileSync(
      path.join(dir, 'report.json'),
      JSON.stringify({ status: 'qualified', rollback: 'not-needed' })
    );
    fs.writeFileSync(path.join(dir, 'cache-references.json'), '[]');
    dirs.push(dir);
  }
  fs.writeFileSync(
    path.join(dirs[0], 'report.json'),
    JSON.stringify({ status: 'failed', rollback: 'failed' })
  );
  const candidate = retainCandidate(f.home, f.options.tarball, f.options);
  fs.writeFileSync(
    path.join(f.userHome, '.bun/install/global/package.json'),
    JSON.stringify({ dependencies: { tuturuuu: candidate } })
  );
  pruneRetention(f.home, dirs[8]);
  assert.equal(fs.existsSync(dirs[0]), true);
  assert.equal(fs.existsSync(dirs[8]), true);
  assert.ok(fs.readdirSync(backups).length <= 7);
  assert.equal(fs.existsSync(candidate), true);
});

test('real SDK admission reclaims only dead preparation, preserving mutation fences', (t) => {
  const { spawnSync } = require('node:child_process');
  for (const mutated of [false, true]) {
    const f = fixture(t),
      admission = path.join(f.home, 'admission');
    fs.mkdirSync(admission);
    fs.writeFileSync(
      path.join(admission, 'owner.json'),
      JSON.stringify({
        scheduler: 2,
        pid: 2147483647,
        token: 'dead-preparation',
        cwd: f.userHome,
        tool: 'rollout',
        queuedAt: new Date().toISOString(),
      })
    );
    if (mutated)
      fs.writeFileSync(path.join(admission, 'reclaim'), '2147483647');
    if (mutated) fs.writeFileSync(path.join(admission, 'mutation.json'), '{}');
    const entry = path.resolve(
      __dirname,
      '../packages/sdk/src/cli/resources-slots.ts'
    );
    const compatibility = path.resolve(
      __dirname,
      '../packages/sdk/src/cli/resources-compatibility.ts'
    );
    const script = `const fs=require('node:fs');const {budgetLauncherProtocol,ownershipLauncherProtocol}=require(${JSON.stringify(compatibility)});fs.writeFileSync(${JSON.stringify(path.join(f.home, 'bin/bun'))},['# Managed by ttr resources',budgetLauncherProtocol,ownershipLauncherProtocol,''].join(String.fromCharCode(10)));const {withAdmission}=require(${JSON.stringify(entry)});withAdmission(${JSON.stringify(f.home)},async()=>console.log('admitted')).catch(e=>{console.error(e.message);process.exitCode=1});`;
    const result = spawnSync('bun', ['-e', script], {
      encoding: 'utf8',
      timeout: 10000,
    });
    assert.equal(result.status, mutated ? 1 : 0, result.stderr);
    if (mutated) {
      assert.match(result.stderr, /Interrupted SDK rollout/);
      assert.equal(fs.existsSync(path.join(admission, 'reclaim')), true);
    } else assert.equal(result.stdout.trim(), 'admitted');
  }
});

test('slot ownership cleanup failures fail the report and hold admission without a rollback claim', async (t) => {
  const f = fixture(t);
  const report = await worker(f.options, {
    userHome: f.userHome,
    env: {},
    run: async (command, args) => {
      if (args.includes('-e'))
        fs.writeFileSync(path.join(f.home, 'slots/0/owner.json'), '{');
      return f.invoke(command, args);
    },
  });
  assert.equal(report.status, 'failed');
  assert.equal(report.rollback, 'not-needed');
  assert.equal(report.cleanup, 'failed');
  assert.equal(report.admissionHeld, true);
  assert.ok(report.cleanupErrors.length);
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(report.backup, 'report.json'))).status,
    'failed'
  );
  assert.equal(fs.existsSync(path.join(f.home, 'admission')), true);
});

test('cache retention keeps installed and retained-backup tarballs even when old', (t) => {
  const f = fixture(t),
    backups = path.join(f.home, 'backups');
  fs.mkdirSync(backups);
  const backup = path.join(
    backups,
    `2026-10-24T00-00-00-000Z-${crypto.randomUUID()}`
  );
  fs.mkdirSync(backup);
  fs.writeFileSync(path.join(backup, 'cache-references.json'), '[]');
  fs.writeFileSync(
    path.join(backup, 'report.json'),
    JSON.stringify({ status: 'qualified', rollback: 'not-needed' })
  );
  const caches = [];
  for (let i = 0; i < 10; i++) {
    fs.writeFileSync(f.options.tarball, `candidate ${i}`);
    const file = retainCandidate(f.home, f.options.tarball, {});
    fs.utimesSync(file, new Date(i * 1000), new Date(i * 1000));
    caches.push(file);
  }
  fs.writeFileSync(
    path.join(f.userHome, '.bun/install/global/package.json'),
    JSON.stringify({ dependencies: { tuturuuu: caches[0] } })
  );
  fs.writeFileSync(
    path.join(backup, 'candidate.json'),
    JSON.stringify({ path: caches[1] })
  );
  pruneRetention(f.home, backup);
  assert.equal(fs.existsSync(caches[0]), true);
  assert.equal(fs.existsSync(caches[1]), true);
  assert.equal(fs.readdirSync(path.join(f.home, 'suppliers')).length, 8);
});

test('partial rollback resumes under its durable mutation token without a candidate CLI', (t) => {
  const { spawnSync } = require('node:child_process');
  const { backupInstallation, trustedGlobal } = require('./sdk-rollout-engine');
  const f = fixture(t);
  const backup = backupInstallation(
    f.userHome,
    f.home,
    trustedGlobal(f.userHome)
  );
  const token = 'interrupted-mutation';
  fs.writeFileSync(path.join(backup, 'lease.json'), JSON.stringify({ token }));
  const admission = path.join(f.home, 'admission');
  fs.mkdirSync(admission);
  fs.writeFileSync(path.join(admission, 'reclaim'), 'durable fence');
  fs.writeFileSync(
    path.join(admission, 'owner.json'),
    JSON.stringify({
      scheduler: 2,
      pid: 2147483647,
      token,
      tool: 'rollout',
      cwd: f.userHome,
      queuedAt: new Date().toISOString(),
    })
  );
  fs.writeFileSync(
    path.join(admission, 'mutation.json'),
    JSON.stringify({ token, backup, phase: 'install' })
  );
  fs.renameSync(
    path.join(backup, 'saved-0'),
    path.join(backup, 'not-yet-readable')
  );
  const code = `require(${JSON.stringify(require.resolve('./sdk-rollout-engine'))}).rollback(${JSON.stringify(backup)},{userHome:${JSON.stringify(f.userHome)}}).then(()=>console.log('restored')).catch(e=>{console.error(e.message);process.exitCode=1});`;
  const failed = spawnSync(process.execPath, ['-e', code], {
    encoding: 'utf8',
  });
  assert.equal(failed.status, 1);
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(admission, 'mutation.json'))).phase,
    'rollback'
  );
  fs.renameSync(
    path.join(backup, 'not-yet-readable'),
    path.join(backup, 'saved-0')
  );
  const success = spawnSync(process.execPath, ['-e', code], {
    encoding: 'utf8',
  });
  assert.equal(success.status, 0, success.stderr);
  assert.equal(success.stdout.trim(), 'restored');
  assert.equal(fs.existsSync(admission), false);
});

test('housekeeping cleanup failures keep a qualified install and release admission', async (t) => {
  const f = fixture(t);
  const report = await worker(f.options, {
    userHome: f.userHome,
    env: {},
    run: async (command, args) => {
      if (args.includes('-e'))
        fs.mkdirSync(path.join(f.userHome, '.bun/install/global/package.json'));
      return f.invoke(command, args);
    },
  });
  assert.equal(report.status, 'qualified');
  assert.equal(report.rollback, 'not-needed');
  assert.equal(report.cleanup, 'failed');
  assert.equal(report.admissionHeld, undefined);
  assert.match(report.cleanupErrors.join('\n'), /cache reference bounds/);
  assert.equal(fs.existsSync(path.join(f.home, 'admission')), false);
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(report.backup, 'report.json')))
      .rollback,
    'not-needed'
  );
});

test('in-process restore refuses to revert a concurrent global install', async (t) => {
  for (const drift of [false, true]) {
    const f = fixture(t);
    const extra = path.join(f.userHome, '.bun/install/global/new-package');
    const report = await worker(f.options, {
      userHome: f.userHome,
      env: {},
      run: async (command, args) => {
        if (args.includes('-e')) {
          if (drift) fs.writeFileSync(extra, 'concurrent bun add -g');
          throw new Error('qualification probe failed');
        }
        return f.invoke(command, args);
      },
    });
    assert.equal(report.status, 'failed');
    assert.equal(report.error, 'qualification probe failed');
    const wrapper = fs.readFileSync(path.join(f.root, 'bin/ttr.cjs'), 'utf8');
    if (drift) {
      assert.equal(report.rollback, 'failed');
      assert.match(
        report.rollbackError,
        /Global packages changed since rollout/
      );
      assert.equal(fs.readFileSync(extra, 'utf8'), 'concurrent bun add -g');
      assert.equal(wrapper, 'new wrapper');
      assert.equal(fs.existsSync(path.join(f.home, 'admission')), true);
    } else {
      assert.equal(report.rollback, 'restored');
      assert.equal(wrapper, 'old wrapper');
      assert.equal(fs.existsSync(path.join(f.home, 'admission')), false);
    }
  }
});

test('mutation fence claims reclaim before publishing the marker', (t) => {
  const f = fixture(t);
  const admission = path.join(f.home, 'admission');
  fs.mkdirSync(admission);
  fs.writeFileSync(
    path.join(admission, 'owner.json'),
    JSON.stringify({ token: 'fence-token' })
  );
  // A directory marker makes the publish step fail like a crash mid-fence.
  fs.mkdirSync(path.join(admission, 'mutation.json/blocker'), {
    recursive: true,
  });
  assert.throws(() =>
    fenceMutation(f.home, 'fence-token', '/backup', 'install')
  );
  assert.equal(fs.existsSync(path.join(admission, 'reclaim')), true);
});

test('fleet reports accept cleanup markers and keep held admission staged', () => {
  const { preserveStaging, validateWorkerReport } = require('./sdk-rollout');
  const base = {
    schemaVersion: 1,
    status: 'qualified',
    rollback: 'not-needed',
    backup: '/backup',
  };
  const housekeeping = validateWorkerReport({ ...base, cleanup: 'failed' });
  assert.equal(housekeeping.status, 'qualified');
  assert.equal(preserveStaging(housekeeping), false);
  const held = { ...base, status: 'failed', cleanup: 'failed' };
  assert.equal(
    preserveStaging(validateWorkerReport({ ...held, admissionHeld: true })),
    true
  );
  for (const invalid of [
    { ...base, cleanup: 'maybe' },
    { ...base, cleanup: 'failed', admissionHeld: true },
  ])
    assert.throws(() => validateWorkerReport(invalid), /outcome unknown/);
});
