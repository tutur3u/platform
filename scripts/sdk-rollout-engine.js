const cp = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { setTimeout: sleep } = require('node:timers/promises');

const {
  run,
  quote,
  hash,
  verifyBytes,
  atomicJson,
  readJson,
  alive,
  groupAlive,
} = require('./sdk-rollout-artifact');
function assertIdle(status) {
  if (
    !status ||
    !Number.isInteger(status.occupied) ||
    status.occupied !== 0 ||
    status.owner !== null ||
    !Array.isArray(status.owners) ||
    status.owners.length ||
    !Array.isArray(status.waiting) ||
    status.waiting.length
  )
    throw new Error(
      'Queue occupied or status unknown; wait for all owners and waiters to drain'
    );
}
function snapshotConfig(config) {
  if (
    config?.version !== 1 ||
    config.enabled !== true ||
    !Array.isArray(config.roots) ||
    !config.roots.length ||
    !Array.isArray(config.repositories) ||
    ![...config.roots, ...config.repositories].every(
      (root) => typeof root === 'string' && path.isAbsolute(root)
    ) ||
    !['turboConcurrency', 'vitestWorkers', 'buildJobs'].every(
      (key) =>
        Number.isInteger(config[key]) && config[key] >= 1 && config[key] <= 64
    ) ||
    ![
      config.validationLanes ?? 1,
      config.maxValidationLanes ?? config.validationLanes ?? 1,
    ].every((value) => Number.isInteger(value) && value >= 1 && value <= 8)
  )
    throw new Error('Invalid or disabled existing resource configuration');
  return {
    ...config,
    validationLanes: config.validationLanes ?? 1,
    maxValidationLanes:
      config.maxValidationLanes ?? config.validationLanes ?? 1,
  };
}
function samePolicy(before, after) {
  return (
    JSON.stringify(snapshotConfig(before)) ===
    JSON.stringify(snapshotConfig(after))
  );
}
function launcherHashes(home, install) {
  const result = {};
  if (
    !Array.isArray(install.shims) ||
    !install.shims.length ||
    !install.shims.every((name) => /^[a-z][a-z0-9-]*$/.test(name))
  )
    throw new Error('Invalid shim installation manifest');
  for (const name of install.shims) {
    const file = path.join(home, 'bin', name);
    if (!fs.lstatSync(file).isFile())
      throw new Error('Resource launchers must be regular files');
    result[name] = hash(fs.readFileSync(file));
  }
  return result;
}
function trustedGlobal(userHome) {
  const install = fs.realpathSync(path.join(userHome, '.bun/install'));
  const root = path.join(userHome, '.bun/install/global/node_modules/tuturuuu');
  const entry = fs.realpathSync(path.join(userHome, '.bun/bin/ttr'));
  const relative = path.relative(install, entry);
  const manifest = readJson(path.join(root, 'package.json'));
  if (
    relative.startsWith('..') ||
    path.isAbsolute(relative) ||
    manifest.name !== 'tuturuuu' ||
    typeof manifest.bin?.ttr !== 'string' ||
    fs.realpathSync(path.join(root, manifest.bin.ttr)) !== entry
  )
    throw new Error(
      'ttr must be the same global Bun installation, never a workspace/dist link'
    );
  return { root, manifest, entry };
}
async function lease(home, waitDrain, invoke, cli) {
  const deadline = Date.now() + waitDrain * 1000;
  for (;;) {
    // Atomic mkdir shares the scheduler's existing admission mutex. Never reclaim
    // another owner's mutex, tickets or slots.
    const directory = path.join(home, 'admission');
    let held = false;
    try {
      fs.mkdirSync(directory, { mode: 0o700 });
      held = true;
      // Retain the existing scheduler's exclusive reclaim fence. Even pre-dev
      // suppliers cannot reclaim this directory after a rollout process crash.
      fs.writeFileSync(path.join(directory, 'reclaim'), String(process.pid), {
        mode: 0o600,
        flag: 'wx',
      });
      const token = crypto.randomUUID();
      atomicJson(path.join(directory, 'owner.json'), {
        scheduler: 2,
        pid: process.pid,
        token,
        cwd: process.cwd(),
        tool: 'rollout',
        queuedAt: new Date().toISOString(),
      });
      assertIdle(
        JSON.parse(
          await invoke(cli, ['resources', 'status', '--json'], {
            timeoutMs: 10_000,
          })
        )
      );
      return {
        token,
        release: () => {
          if (readJson(path.join(directory, 'owner.json')).token !== token)
            throw new Error(
              'Maintenance lease changed; refusing to release another owner'
            );
          fs.rmSync(directory, { recursive: true });
        },
      };
    } catch (error) {
      if (held) fs.rmSync(directory, { recursive: true });
      if (
        error.code !== 'EEXIST' &&
        !error.message.startsWith('Queue occupied')
      )
        throw error;
      if (Date.now() >= deadline)
        throw new Error('Queue not drained; no installation attempted');
      await sleep(Math.min(1000, Math.max(1, deadline - Date.now())));
    }
  }
}
function copyMaterialized(
  source,
  target,
  ancestry = new Set(),
  budget = { files: 0, bytes: 0 }
) {
  const real = fs.realpathSync(source);
  const info = fs.statSync(real);
  budget.files++;
  budget.bytes += info.isFile() ? info.size : 0;
  if (budget.files > 500_000 || budget.bytes > 5 * 1024 ** 3)
    throw new Error(
      'Global backup exceeds 500000 entries or 5 GiB; no installation attempted'
    );
  if (info.isDirectory()) {
    if (ancestry.has(real))
      throw new Error(
        'Cycle in global installation; no installation attempted'
      );
    const next = new Set(ancestry).add(real);
    fs.mkdirSync(target, { mode: info.mode & 0o777 });
    for (const entry of fs.readdirSync(real))
      copyMaterialized(
        path.join(real, entry),
        path.join(target, entry),
        next,
        budget
      );
  } else if (info.isFile()) {
    fs.copyFileSync(real, target, fs.constants.COPYFILE_EXCL);
    fs.chmodSync(target, info.mode & 0o777);
  } else throw new Error('Unsupported special file in global installation');
}
function restore(backup) {
  const manifest = readJson(path.join(backup, 'restore.json'));
  for (const item of manifest.files) {
    fs.rmSync(item.target, { recursive: true, force: true });
    fs.cpSync(path.join(backup, item.saved), item.target, {
      recursive: true,
      dereference: false,
      preserveTimestamps: true,
    });
  }
  for (const alias of manifest.globalAliases || []) {
    fs.rmSync(alias.target, { force: true });
    fs.symlinkSync(alias.entry, alias.target);
  }
}
function backupInstallation(userHome, resourceHome, supplier) {
  const backup = path.join(
    resourceHome,
    'backups',
    `${new Date().toISOString().replaceAll(/[:.]/g, '-')}-${crypto.randomUUID()}`
  );
  fs.mkdirSync(backup, { recursive: true, mode: 0o700 });
  const targets = [
    path.join(userHome, '.bun/install/global'),
    path.join(resourceHome, 'config.json'),
    path.join(resourceHome, 'install.json'),
    path.join(resourceHome, 'bin'),
  ];
  // Bin aliases are included because Bun can change them independently of global.
  for (const alias of ['ttr', 'tuturuuu', 'tutur3u'])
    targets.push(path.join(userHome, '.bun/bin', alias));
  const files = [];
  for (const [index, target] of targets.entries()) {
    if (!fs.existsSync(target))
      throw new Error('Required installation backup path missing');
    const saved = `saved-${index}`;
    if (index === 0) copyMaterialized(target, path.join(backup, saved));
    else
      fs.cpSync(target, path.join(backup, saved), {
        recursive: true,
        dereference: false,
        preserveTimestamps: true,
      });
    files.push({ target, saved });
  }
  fs.writeFileSync(
    path.join(backup, 'restore.json'),
    JSON.stringify({
      files,
      globalAliases: ['ttr', 'tuturuuu', 'tutur3u'].map((alias) => ({
        target: path.join(userHome, '.bun/bin', alias),
        entry: path.resolve(
          path.join(userHome, '.bun/install/global/node_modules/tuturuuu'),
          supplier.manifest.bin[alias] || supplier.manifest.bin.ttr
        ),
      })),
    }),
    { mode: 0o600 }
  );
  fs.writeFileSync(
    path.join(backup, 'supplier.json'),
    JSON.stringify({
      version: supplier.manifest.version,
      entry: supplier.entry,
      entrySha256: hash(fs.readFileSync(supplier.entry)),
    }),
    { mode: 0o600 }
  );
  for (const name of [
    'sdk-rollout.js',
    'sdk-rollout-artifact.js',
    'sdk-rollout-engine.js',
  ])
    fs.copyFileSync(path.join(__dirname, name), path.join(backup, name));
  fs.writeFileSync(
    path.join(backup, 'rollback.sh'),
    `#!/bin/sh\nset -eu\nexec "$HOME/.bun/bin/bun" ${quote(path.join(backup, 'sdk-rollout.js'))} --rollback ${quote(backup)}\n`,
    { mode: 0o700 }
  );
  return backup;
}
async function qualify(context) {
  const { userHome, home, cli, invoke, config, env } = context;
  const plan = JSON.parse(
    await invoke(
      cli,
      [
        'resources',
        'setup',
        ...config.roots.flatMap((root) => ['--root', root]),
        '--shell',
        'none',
        '--dry-run',
        '--json',
      ],
      { env }
    )
  );
  const expected = path.join(
    userHome,
    '.bun/install/global/node_modules/tuturuuu/dist/cli/resources-entry.js'
  );
  if (
    plan.entry !== expected ||
    fs.realpathSync(plan.entry) !== fs.realpathSync(expected)
  )
    throw new Error(
      'Launchers do not target the canonical global resource entry'
    );
  const before = launcherHashes(
    home,
    readJson(path.join(home, 'install.json'))
  );
  await invoke(cli, ['resources', 'run', '--', 'true'], {
    env,
    cwd: config.roots[0],
  });
  await invoke(path.join(home, 'bin/bun'), ['--version'], {
    env,
    cwd: config.roots[0],
  });
  if (
    JSON.stringify(before) !==
    JSON.stringify(
      launcherHashes(home, readJson(path.join(home, 'install.json')))
    )
  )
    throw new Error('Shim invocation changed launcher hashes');
  for (const root of config.roots) {
    await invoke(
      cli,
      [
        'resources',
        'run',
        '--',
        path.join(userHome, '.bun/bin/bun'),
        '-e',
        'const fs=require("node:fs"); if(!fs.statSync(process.cwd()).isDirectory()) process.exit(1); for(const name of ["package.json","bun.lock"]) if(fs.existsSync(name)) {const s=fs.statSync(name); if(!s.isFile()) process.exit(2); if(name==="package.json") JSON.parse(fs.readFileSync(name,"utf8"));}',
      ],
      { env, cwd: root }
    );
  }
  return { launchers: before, projectsChecked: config.roots.length };
}
async function worker(options, dependencies = {}) {
  const invoke = dependencies.run || run;
  const userHome = dependencies.userHome || os.homedir();
  const environment = dependencies.env || process.env;
  if (
    environment.TTR_RESOURCES_HOME ||
    (environment.BUN_INSTALL &&
      path.resolve(environment.BUN_INSTALL) !== path.join(userHome, '.bun')) ||
    environment.TTR_RESOURCES_ADMITTED ||
    environment.TTR_RESOURCE_OWNER ||
    environment.TTR_RESOURCES_BYPASS
  )
    throw new Error(
      'Run rollout outside admission with the default shared home and Bun installation'
    );
  const home = path.join(userHome, '.tuturuuu/resources');
  const cli = path.join(userHome, '.bun/bin/ttr');
  const supplier = trustedGlobal(userHome);
  verifyBytes(fs.readFileSync(options.tarball), options);
  const lock = await lease(home, options.waitDrain, invoke, cli);
  let interrupted = false;
  const onSignal = () => {
    interrupted = true;
  };
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'])
    process.on(signal, onSignal);
  const checkedInvoke = async (command, args, settings = {}) => {
    if (interrupted)
      throw new Error(
        'Rollout interrupted; restoring the previous installation'
      );
    const file = path.join(home, 'admission/owner.json');
    let unsettled = false;
    try {
      return await invoke(command, args, {
        ...settings,
        onSpawn: (pid) => {
          const owner = readJson(file);
          if (owner.token !== lock.token)
            throw new Error('Maintenance lease changed');
          atomicJson(file, { ...owner, childPid: pid });
        },
      });
    } catch (error) {
      unsettled = error.unsettled === true;
      throw error;
    } finally {
      const owner = readJson(file);
      if (!unsettled) delete owner.childPid;
      atomicJson(file, owner);
    }
  };
  const report = {
    schemaVersion: 1,
    status: 'failed',
    previousVersion: supplier.manifest.version,
    version: options.version,
    channel:
      options.channel || (options.version.includes('-dev.') ? 'dev' : 'latest'),
    sourceSha: options.sourceSha || null,
    sha256: options.sha256,
    backup: null,
    rollback: 'not-needed',
  };
  let slot;
  let mutationStarted = false;
  try {
    const config = readJson(path.join(home, 'config.json'));
    snapshotConfig(config);
    report.backup = backupInstallation(userHome, home, supplier);
    fs.writeFileSync(
      path.join(report.backup, 'lease.json'),
      JSON.stringify({ token: lock.token }),
      { mode: 0o600 }
    );
    const releaseRecoveryPreflight = await recoveryLock(report.backup);
    await releaseRecoveryPreflight();
    const env = {
      ...environment,
      TTR_RESOURCES_MAINTENANCE: lock.token,
      PATH: `${path.join(userHome, '.bun/bin')}:/usr/bin:/bin:/usr/sbin:/sbin`,
    };
    mutationStarted = true;
    await checkedInvoke(
      path.join(userHome, '.bun/bin/bun'),
      ['add', '-g', '--ignore-scripts', options.tarball],
      { env, cwd: userHome }
    );
    const current = trustedGlobal(userHome);
    if (current.manifest.tuturuuuBuild?.rolloutProtocol !== 1)
      throw new Error('Installed package lacks safe rollout protocol');
    if (current.manifest.version !== options.version)
      throw new Error('Installed version differs from verified archive');
    const setup = [
      'resources',
      'setup',
      ...config.roots.flatMap((root) => ['--root', root]),
      '--shell',
      'none',
      '--json',
    ];
    await checkedInvoke(cli, [...setup, '--dry-run'], { env, cwd: userHome });
    await checkedInvoke(cli, setup, { env, cwd: userHome });
    if (!samePolicy(config, readJson(path.join(home, 'config.json'))))
      throw new Error('Setup changed existing roots or limits');
    fs.copyFileSync(
      path.join(report.backup, 'saved-1'),
      path.join(home, 'config.json')
    );
    // A genuine ancestor owner lets qualification take the existing nested path.
    // The admission mutex remains held, so no other lane can start meanwhile.
    const slots = path.join(home, 'slots');
    fs.mkdirSync(slots, { recursive: true, mode: 0o700 });
    slot = path.join(slots, '0');
    fs.mkdirSync(slot, { mode: 0o700 });
    fs.writeFileSync(
      path.join(slot, 'owner.json'),
      JSON.stringify({
        scheduler: 2,
        pid: process.pid,
        token: lock.token,
        cwd: config.roots[0],
        tool: 'rollout',
        queuedAt: new Date().toISOString(),
        limits: {
          vitestWorkers: config.vitestWorkers,
          buildJobs: config.buildJobs,
        },
      }),
      { mode: 0o600 }
    );
    report.qualification = await qualify({
      userHome,
      home,
      cli,
      invoke: checkedInvoke,
      config,
      env,
    });
    if (interrupted)
      throw new Error(
        'Rollout interrupted; restoring the previous installation'
      );
    report.status = 'qualified';
  } catch (error) {
    report.error = error.message;
    if (error.unsettled) report.rollback = 'blocked-active-child';
    else if (mutationStarted) {
      try {
        restore(report.backup);
        verifyRestored(userHome, report.backup);
        report.rollback = 'restored';
      } catch (rollbackError) {
        report.rollback = 'failed';
        report.rollbackError = rollbackError.message;
      }
    }
  } finally {
    if (slot && report.rollback !== 'blocked-active-child') {
      if (readJson(path.join(slot, 'owner.json')).token !== lock.token) {
        report.rollback = 'failed';
        report.error = 'Qualification owner changed; maintenance remains held';
      } else fs.rmSync(slot, { recursive: true });
    }
    if (report.backup)
      fs.writeFileSync(
        path.join(report.backup, 'report.json'),
        JSON.stringify(report, null, 2),
        { mode: 0o600 }
      );
    if (!['failed', 'blocked-active-child'].includes(report.rollback))
      lock.release();
    for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'])
      process.removeListener(signal, onSignal);
  }
  return report;
}
function verifyRestored(userHome, backup) {
  const supplier = trustedGlobal(userHome);
  const previous = readJson(path.join(backup, 'supplier.json'));
  if (
    supplier.manifest.version !== previous.version ||
    hash(fs.readFileSync(supplier.entry)) !== previous.entrySha256
  )
    throw new Error('Restored supplier identity differs from backup');
}
async function recoveryLock(backup) {
  const script =
    'import fcntl,os,sys\nf=open(sys.argv[1],"a")\nfcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB)\nprint("locked",flush=True)\nsys.stdin.buffer.read()\n';
  const child = cp.spawn(
    'python3',
    ['-I', '-c', script, path.join(backup, 'recovery.lock')],
    { stdio: ['pipe', 'pipe', 'pipe'], shell: false }
  );
  child.stderr.resume();
  const exited = new Promise((resolve) => child.once('close', resolve));
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.stdin.end();
      reject(new Error('Recovery lock timed out'));
    }, 10_000);
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('close', () => {
      clearTimeout(timer);
      reject(
        new Error(
          'Recovery lock unavailable; another recovery may be active (Python3 required)'
        )
      );
    });
    child.stdout.once('data', (data) => {
      clearTimeout(timer);
      if (String(data).trim() === 'locked') resolve();
      else {
        child.stdin.end();
        reject(new Error('Malformed recovery lock receipt'));
      }
    });
  });
  return async () => {
    child.stdin.end();
    await exited;
  };
}
async function rollback(backup, dependencies = {}) {
  const userHome = dependencies.userHome || os.homedir();
  const invoke = dependencies.run || run;
  const home = path.join(userHome, '.tuturuuu/resources');
  const cli = path.join(userHome, '.bun/bin/ttr');
  const admission = path.join(home, 'admission');
  const releaseRecovery = await recoveryLock(backup);
  try {
    let lock;
    if (fs.existsSync(admission)) {
      const old = readJson(path.join(admission, 'owner.json'));
      const receipt = readJson(path.join(backup, 'lease.json'));
      if (
        old.tool !== 'rollout' ||
        old.token !== receipt.token ||
        alive(old.pid) ||
        alive(old.childPid) ||
        groupAlive(old.childPid)
      )
        throw new Error(
          'The maintenance holder or its child may still be active; do not replay rollback'
        );
      // flock serializes recovery takeover and is released by the OS on crash.
      // Retain the original operation token so this backup remains retryable.
      const token = old.token;
      atomicJson(path.join(admission, 'owner.json'), {
        scheduler: 2,
        pid: process.pid,
        token,
        cwd: process.cwd(),
        tool: 'rollout',
        queuedAt: new Date().toISOString(),
      });
      lock = {
        release: () => {
          if (readJson(path.join(admission, 'owner.json')).token !== token)
            throw new Error('Recovery lease changed');
          fs.rmSync(admission, { recursive: true });
        },
      };
      const slot = path.join(home, 'slots/0');
      if (
        fs.existsSync(slot) &&
        readJson(path.join(slot, 'owner.json')).token === old.token
      )
        fs.rmSync(slot, { recursive: true });
      for (const directory of ['slots', 'queue']) {
        const location = path.join(home, directory);
        if (fs.existsSync(location) && fs.readdirSync(location).length)
          throw new Error(
            'Queue state remains; recovery stays fenced for operator inspection'
          );
      }
      if (fs.existsSync(path.join(home, 'lock')))
        throw new Error('Legacy queue state remains; recovery stays fenced');
    } else lock = await lease(home, 0, invoke, cli);
    try {
      restore(backup);
      verifyRestored(userHome, backup);
    } catch (error) {
      throw new Error(
        `Rollback failed; admission remains closed: ${error.message}`
      );
    }
    lock.release();
    return { status: 'restored', backup };
  } finally {
    await releaseRecovery();
  }
}

module.exports = {
  assertIdle,
  snapshotConfig,
  samePolicy,
  trustedGlobal,
  lease,
  copyMaterialized,
  restore,
  backupInstallation,
  qualify,
  worker,
  rollback,
};
