const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {
  hash,
  quote,
  readJson,
  atomicJson,
  verifyBytes,
} = require('./sdk-rollout-artifact');

// O_NONBLOCK keeps a FIFO from stalling an open that is only classified.
const readOnlyNonBlocking = fs.constants.O_RDONLY | fs.constants.O_NONBLOCK;
const readOnlyNoFollow = readOnlyNonBlocking | fs.constants.O_NOFOLLOW;

function fenceMutation(home, token, backup, phase) {
  const admission = path.join(home, 'admission');
  if (readJson(path.join(admission, 'owner.json')).token !== token)
    throw new Error('Maintenance lease changed before mutation');
  // Preparation remains reclaimable. Only a backed-up mutation retains the
  // old scheduler's exclusive fence across a process crash. Claim the reclaim
  // fence before publishing the marker, so no crash point leaves a marker that
  // older schedulers (which only honour the reclaim file) could reclaim past.
  try {
    fs.writeFileSync(path.join(admission, 'reclaim'), String(process.pid), {
      flag: 'wx',
      mode: 0o600,
    });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  atomicJson(path.join(admission, 'mutation.json'), { token, backup, phase });
}
function assertFilesystemIdle(home) {
  for (const directory of ['slots', 'queue']) {
    const location = path.join(home, directory);
    if (
      fs.existsSync(location) &&
      (!fs.lstatSync(location).isDirectory() || fs.readdirSync(location).length)
    )
      throw new Error(
        'Queue occupied or status unknown; wait for all owners and waiters to drain'
      );
  }
  if (fs.existsSync(path.join(home, 'lock')))
    throw new Error('Queue occupied: legacy lock remains');
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
    'sdk-rollout-state.js',
  ])
    fs.copyFileSync(path.join(__dirname, name), path.join(backup, name));
  fs.writeFileSync(
    path.join(backup, 'rollback.sh'),
    `#!/bin/sh\nset -eu\nexec "$HOME/.bun/bin/bun" ${quote(path.join(backup, 'sdk-rollout.js'))} --rollback ${quote(backup)}\n`,
    { mode: 0o700 }
  );
  atomicJson(
    path.join(backup, 'cache-references.json'),
    cacheReferences(userHome, resourceHome)
  );
  return backup;
}

function fingerprint(
  target,
  ancestry = new Set(),
  budget = { files: 0, bytes: 0 }
) {
  if (
    !fs.existsSync(target) &&
    !fs.lstatSync(path.dirname(target)).isSymbolicLink()
  ) {
    try {
      fs.lstatSync(target);
    } catch (error) {
      if (error.code === 'ENOENT') return 'missing';
      throw error;
    }
  }
  const stat = fs.lstatSync(target);
  const real = fs.realpathSync(target);
  // Classify and hash one descriptor so the hashed bytes always belong to the
  // inode whose type and mode were recorded.
  const fd = fs.openSync(
    real,
    readOnlyNoFollow | (stat.isDirectory() ? fs.constants.O_DIRECTORY : 0)
  );
  try {
    return fingerprintOpened(target, stat, real, fd, ancestry, budget);
  } finally {
    fs.closeSync(fd);
  }
}
function fingerprintOpened(target, stat, real, fd, ancestry, budget) {
  const info = fs.fstatSync(fd);
  budget.files++;
  budget.bytes += info.isFile() ? info.size : 0;
  if (budget.files > 500000 || budget.bytes > 5 * 1024 ** 3)
    throw new Error('Supplier state hash exceeds backup bounds');
  if (ancestry.has(real)) throw new Error('Cycle in supplier state');
  const type = stat.isSymbolicLink()
    ? ['link', fs.readlinkSync(target)]
    : ['entry'];
  if (info.isDirectory()) {
    const next = new Set(ancestry).add(real);
    // Node has no portable descriptor-relative readdir/openat. Fence pathname
    // traversal with the checked directory's identity before and after each
    // enumeration and after child hashing; never publish a mixed fingerprint.
    assertDirectoryIdentity(real, info);
    const names = fs.readdirSync(real).sort();
    assertDirectoryIdentity(real, info);
    const children = names.map((name) => [
      name,
      fingerprint(path.join(real, name), next, budget),
    ]);
    assertDirectoryIdentity(real, info);
    return hash(JSON.stringify([...type, info.mode & 0o777, children]));
  }
  if (!info.isFile()) throw new Error('Unsupported supplier state');
  return hash(
    JSON.stringify([...type, info.mode & 0o777, hash(fs.readFileSync(fd))])
  );
}
function assertDirectoryIdentity(real, checked) {
  let current;
  try {
    current = fs.lstatSync(real);
  } catch (error) {
    if (!['ENOENT', 'ENOTDIR'].includes(error.code)) throw error;
  }
  if (
    !current?.isDirectory() ||
    current.dev !== checked.dev ||
    current.ino !== checked.ino
  )
    throw new Error('Supplier directory changed while fingerprinting');
}
function currentState(backup) {
  return readJson(path.join(backup, 'restore.json')).files.map(
    ({ target }) => ({ target, hash: fingerprint(target) })
  );
}
function recordPostState(backup, name = 'post-state.json') {
  atomicJson(path.join(backup, name), currentState(backup));
}
function assertRollbackState(backup, fenced) {
  const candidates = ['post-state.json', 'restored-state.json'].filter((name) =>
    fs.existsSync(path.join(backup, name))
  );
  if (!candidates.length) {
    if (fenced) return;
    throw new Error(
      'No post-rollout state receipt; refusing unguarded rollback'
    );
  }
  const current = JSON.stringify(currentState(backup));
  if (
    !candidates.some(
      (name) => JSON.stringify(readJson(path.join(backup, name))) === current
    )
  )
    throw new Error(
      'Global packages, scheduler roots/limits or launchers changed since rollout; refusing rollback'
    );
}
// In-process restore guard. Qualification runs the candidate, so launcher or
// config writes after install are candidate defects that must still be
// restored; only the global package tree identifies a concurrent `bun add -g`.
function assertGlobalUnchanged(backup) {
  const receipt = path.join(backup, 'post-state.json');
  if (!fs.existsSync(receipt)) return; // Install incomplete; fenced restore.
  const [{ target }] = readJson(path.join(backup, 'restore.json')).files;
  const recorded = readJson(receipt).find((entry) => entry.target === target);
  if (!recorded || recorded.hash !== fingerprint(target))
    throw new Error(
      'Global packages changed since rollout install; refusing automatic restore'
    );
}
function retainCandidate(home, source, expected) {
  const directory = path.join(home, 'suppliers');
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const bytes = fs.readFileSync(source),
    checksum = verifyBytes(bytes, expected);
  const target = path.join(directory, `${checksum}.tgz`);
  if (fs.existsSync(target))
    verifyBytes(fs.readFileSync(target), { sha256: checksum });
  else {
    const staged = path.join(
      directory,
      `${checksum}.${crypto.randomUUID()}.tmp`
    );
    fs.writeFileSync(staged, bytes, { flag: 'wx', mode: 0o600 });
    try {
      fs.linkSync(staged, target);
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    } finally {
      fs.rmSync(staged, { force: true });
    }
    verifyBytes(fs.readFileSync(target), { sha256: checksum });
  }
  return target;
}
function cacheReferences(userHome, home) {
  const base = path.join(userHome, '.bun/install/global');
  const references = new Set();
  for (const name of ['package.json', 'bun.lock', 'bun.lockb']) {
    let fd;
    try {
      fd = fs.openSync(path.join(base, name), readOnlyNonBlocking);
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    let contents;
    try {
      const stat = fs.fstatSync(fd);
      if (!stat.isFile() || stat.size > 16 * 1024 * 1024)
        throw new Error(
          'Global package manifest exceeds cache reference bounds'
        );
      contents = fs.readFileSync(fd).toString('latin1');
    } finally {
      fs.closeSync(fd);
    }
    for (const match of contents.matchAll(/[a-f0-9]{64}\.tgz/g))
      references.add(path.join(home, 'suppliers', match[0]));
  }
  return [...references];
}
function boundedEntries(directory) {
  const handle = fs.opendirSync(directory);
  const names = [];
  try {
    for (let i = 0; i < 100; i++) {
      const entry = handle.readSync();
      if (!entry) break;
      names.push(entry.name);
    }
  } finally {
    handle.closeSync();
  }
  return names;
}
function pruneRetention(home, protectedBackup) {
  const root = path.join(home, 'backups');
  const scanned = boundedEntries(root);
  const names = scanned
    .filter((name) => /^\d{4}-\d\d-\d\dT[0-9-]+Z-[a-f0-9-]{36}$/.test(name))
    .sort()
    .reverse();
  // Bounded scans deliberately retain unknown, active and failed recovery state.
  const retained = new Set([protectedBackup]);
  let completed = 0;
  for (const name of names.slice(0, 100)) {
    const directory = path.join(root, name);
    if (fs.lstatSync(directory).isSymbolicLink()) continue;
    let report;
    try {
      report = readJson(path.join(directory, 'report.json'));
    } catch {
      retained.add(directory);
      continue;
    }
    const terminal =
      report.status === 'qualified' ||
      (report.status === 'failed' &&
        ['restored', 'not-needed'].includes(report.rollback));
    if (!terminal || directory === protectedBackup || completed++ < 5)
      retained.add(directory);
    else fs.rmSync(directory, { recursive: true });
  }
  if (scanned.length >= 100) return;
  const references = new Set(
    cacheReferences(path.resolve(home, '../..'), home)
  );
  for (const directory of retained) {
    try {
      for (const reference of readJson(
        path.join(directory, 'cache-references.json')
      ))
        references.add(reference);
    } catch {
      return;
    }
    try {
      const candidate = readJson(path.join(directory, 'candidate.json'));
      if (typeof candidate.path === 'string') references.add(candidate.path);
    } catch {}
    try {
      const report = readJson(path.join(directory, 'report.json'));
      if (report.candidateTarball) references.add(report.candidateTarball);
    } catch {}
  }
  const suppliers = path.join(home, 'suppliers');
  if (!fs.existsSync(suppliers)) return;
  const caches = boundedEntries(suppliers)
    .filter((name) => /^[a-f0-9]{64}\.tgz$/.test(name))
    .map((name) => ({
      file: path.join(suppliers, name),
      time: fs.statSync(path.join(suppliers, name)).mtimeMs,
    }))
    .sort((a, b) => b.time - a.time);
  for (const { file } of caches.slice(6, 100))
    if (!references.has(file) && fs.lstatSync(file).isFile()) fs.rmSync(file);
}
module.exports = {
  assertFilesystemIdle,
  fenceMutation,
  copyMaterialized,
  restore,
  backupInstallation,
  recordPostState,
  assertRollbackState,
  assertGlobalUnchanged,
  retainCandidate,
  pruneRetention,
  fingerprint,
};
