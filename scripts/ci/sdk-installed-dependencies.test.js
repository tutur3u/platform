const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { requireInstalledDependencies } = require('./sdk-qualification-phase');

const name = '@tiptap/react';
const nested = `node_modules/tuturuuu/node_modules/${name}`;
const hoisted = `node_modules/${name}`;
const tuple = {
  version: '3.31.3',
  integrity: 'sha512-YWJj',
  resolved: 'https://registry.npmjs.org/@tiptap/react/-/react-3.31.3.tgz',
};

function fixture(t) {
  const consumer = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'sdk-dependency-test-'))
  );
  t.after(() => fs.rmSync(consumer, { recursive: true, force: true }));
  const lock = { packages: {} };
  const install = (key, identity = { name, version: tuple.version }) => {
    const directory = path.join(consumer, key);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(
      path.join(directory, 'package.json'),
      JSON.stringify(identity)
    );
    lock.packages[key] = { ...tuple };
    return directory;
  };
  const verify = (field = 'dependencies') =>
    requireInstalledDependencies(
      { [field]: { [name]: '3.31.3' } },
      consumer,
      lock
    );
  return { consumer, lock, install, verify };
}

for (const key of [hoisted, nested]) {
  test(`accept actual physical package with exact lock key: ${key}`, (t) => {
    const { install, verify, lock } = fixture(t);
    install(key, { name, version: tuple.version, exports: {} });
    // Presence validation must work for type-only or exports-hidden packages.
    assert.deepEqual(verify().get(name), lock.packages[key]);
  });
}

test('SDK-relative nested package wins over a conflicting hoisted copy', (t) => {
  const { install, verify, lock } = fixture(t);
  install(hoisted, { name, version: '9.0.0' });
  lock.packages[hoisted].version = '9.0.0';
  install(nested);
  assert.equal(verify().get(name).version, '3.31.3');
  assert.equal(verify().get(name).integrity, tuple.integrity);
});

for (const field of [
  'dependencies',
  'peerDependencies',
  'optionalDependencies',
]) {
  test(`absent physical ${field} remains a hard failure despite lock metadata`, (t) => {
    const { verify, lock } = fixture(t);
    lock.packages[nested] = { ...tuple };
    assert.throws(() => verify(field), /INSTALLED_DEPENDENCY_MISSING/);
  });
}

test('a physical nested package cannot borrow the hoisted lock entry', (t) => {
  const { install, verify, lock } = fixture(t);
  install(nested);
  lock.packages[hoisted] = lock.packages[nested];
  delete lock.packages[nested];
  assert.throws(verify, /INSTALLED_DEPENDENCY_MISSING/);
});

for (const identity of [
  { name: 'spoof', version: tuple.version },
  { name, version: '0.0.0' },
]) {
  test(`reject nested manifest mismatch: ${JSON.stringify(identity)}`, (t) => {
    const { install, verify } = fixture(t);
    install(hoisted);
    install(nested, identity);
    assert.throws(verify, /INSTALLED_DEPENDENCY_MISMATCH/);
  });
}

for (const patch of [
  { version: '0.0.0' },
  { version: undefined },
  { link: true },
  { integrity: undefined },
  { integrity: 'invalid' },
  { resolved: 'https://other.invalid/package.tgz' },
]) {
  test(`reject invalid nested lock: ${JSON.stringify(patch)}`, (t) => {
    const { install, verify, lock } = fixture(t);
    install(hoisted);
    install(nested);
    Object.assign(lock.packages[nested], patch);
    assert.throws(verify, /INSTALLED_DEPENDENCY_(MISSING|MISMATCH)/);
  });
}

for (const component of [
  'node_modules',
  'node_modules/tuturuuu',
  'node_modules/tuturuuu/node_modules',
  'node_modules/tuturuuu/node_modules/@tiptap',
  nested,
  `${nested}/package.json`,
]) {
  test(`reject symlink at ${component}`, (t) => {
    const { consumer, install, verify } = fixture(t);
    install(nested);
    const target = path.join(consumer, component);
    const relocated = path.join(consumer, 'relocated');
    fs.renameSync(target, relocated);
    fs.symlinkSync(relocated, target);
    assert.throws(verify, /INSTALLED_DEPENDENCY_MISSING/);
  });
}

test('incomplete nested package shadows a valid hoisted package', (t) => {
  const { consumer, install, verify } = fixture(t);
  install(hoisted);
  fs.mkdirSync(path.join(consumer, nested), { recursive: true });
  assert.throws(verify, /INSTALLED_DEPENDENCY_MISSING/);
});

test('dev-only packages are excluded and cannot enter the verified tuple map', (t) => {
  const { consumer, lock } = fixture(t);
  assert.equal(
    requireInstalledDependencies(
      { devDependencies: { [name]: '3.31.3' } },
      consumer,
      lock
    ).size,
    0
  );
});

test('a package literally named package.json is still a package directory', (t) => {
  const { consumer, install, lock } = fixture(t);
  const key = 'node_modules/tuturuuu/node_modules/package.json';
  install(key, { name: 'package.json', version: tuple.version });
  assert.equal(
    requireInstalledDependencies(
      { dependencies: { 'package.json': '3.31.3' } },
      consumer,
      lock
    ).get('package.json').version,
    tuple.version
  );
});

test('dependency names cannot redirect lookup to another filesystem path', (t) => {
  const { consumer, lock } = fixture(t);
  for (const unsafe of [
    '.',
    '..',
    '../outside',
    '@scope/../../outside',
    '/absolute',
  ]) {
    assert.throws(
      () =>
        requireInstalledDependencies(
          { dependencies: { [unsafe]: '3.31.3' } },
          consumer,
          lock
        ),
      /INSTALLED_DEPENDENCY_MISSING/
    );
  }
});
