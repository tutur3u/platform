const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const test = require('node:test');
const vm = require('node:vm');
const {
  workflowPhase,
  registryRewrites,
  requireInstalledDependencies,
  verifyPublishReceipt,
} = require('./sdk-qualification-phase');

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk-phase-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function publishFixture(t, filename = 'sdk.tgz') {
  const directory = fixture(t);
  const options = {
    directory,
    sourceSha: 'a'.repeat(40),
    name: 'tuturuuu',
    version: '1.0.0',
  };
  const archive = path.join(directory, filename);
  fs.writeFileSync(archive, 'qualified synthetic bytes');
  const receipt = {
    version: 2,
    phase: 'public',
    qualified: true,
    sourceSha: options.sourceSha,
    processGroupsDrained: true,
    temporaryFixtureDrained: true,
    modelActivity: false,
    lifecycleScriptsExecuted: false,
    package: {
      name: options.name,
      version: options.version,
      archive: filename,
      sha256: createHash('sha256')
        .update(fs.readFileSync(archive))
        .digest('hex'),
    },
  };
  const save = () =>
    fs.writeFileSync(
      path.join(directory, 'receipt.json'),
      JSON.stringify(receipt)
    );
  save();
  return { options, archive, receipt, save };
}

function isolatedVerifier(overrides) {
  return vm.runInNewContext(`(${verifyPublishReceipt.toString()})`, {
    fs: { ...fs, ...overrides },
    path,
    createHash,
  });
}

test('only same-repository generated production release PR selects SOURCE', (t) => {
  const dir = fixture(t),
    eventPath = path.join(dir, 'event.json');
  const env = {
    GITHUB_EVENT_NAME: 'pull_request',
    GITHUB_EVENT_PATH: eventPath,
    GITHUB_REPOSITORY: 'owner/repo',
  };
  const event = {
    pull_request: {
      head: {
        ref: 'release-please--branches--production',
        repo: { full_name: 'owner/repo' },
      },
      base: { ref: 'production', repo: { full_name: 'owner/repo' } },
    },
  };
  const check = (expected) => {
    fs.writeFileSync(eventPath, JSON.stringify(event));
    assert.equal(workflowPhase(env), expected);
  };
  check('source');
  event.pull_request.head.repo.full_name = 'fork/repo';
  check('public');
  event.pull_request.head.repo.full_name = 'owner/repo';
  event.pull_request.base.ref = 'main';
  check('public');
  event.pull_request.base.ref = 'production';
  event.pull_request.head.ref = 'fix/ordinary';
  check('public');
  assert.equal(workflowPhase({ GITHUB_EVENT_NAME: 'push' }), 'public');
  assert.equal(
    workflowPhase({ GITHUB_EVENT_NAME: 'workflow_dispatch' }),
    'public'
  );
});

test('runtime, peer and optional requirements survive dev-only exclusion', () => {
  const entries = [
    'dependencies',
    'devDependencies',
    'peerDependencies',
    'optionalDependencies',
  ].map((field) => ({ field, name: 'same-name' }));
  assert.deepEqual(
    registryRewrites(entries).map(({ field }) => field),
    ['dependencies', 'peerDependencies', 'optionalDependencies']
  );
});

test('publication requires strict successful public receipt for exact SHA and identical tarball', (t) => {
  const directory = fixture(t),
    sourceSha = 'a'.repeat(40),
    name = 'tuturuuu',
    version = '1.0.0';
  const archive = path.join(directory, 'sdk.tgz');
  fs.writeFileSync(archive, 'qualified synthetic bytes');
  const receipt = {
    version: 2,
    phase: 'public',
    qualified: true,
    sourceSha,
    processGroupsDrained: true,
    temporaryFixtureDrained: true,
    modelActivity: false,
    lifecycleScriptsExecuted: false,
    package: {
      name,
      version,
      archive: 'sdk.tgz',
      sha256: createHash('sha256')
        .update(fs.readFileSync(archive))
        .digest('hex'),
    },
  };
  const save = (value) =>
    fs.writeFileSync(
      path.join(directory, 'receipt.json'),
      JSON.stringify(value)
    );
  const verify = () =>
    verifyPublishReceipt({ directory, sourceSha, name, version });
  save(receipt);
  assert.equal(verify(), archive);
  for (const patch of [
    { phase: 'source', sourceValidated: true, qualified: false },
    { sourceSha: 'b'.repeat(40) },
    { qualified: false },
    { version: 1 },
    { blocker: { code: 'FAILED' } },
    { processGroupsDrained: false },
    { temporaryFixtureDrained: false },
    { lifecycleScriptsExecuted: true },
    { package: { ...receipt.package, version: '2.0.0' } },
  ]) {
    save({ ...receipt, ...patch });
    assert.throws(verify, /RECEIPT_MISMATCH/);
  }
  save(receipt);
  fs.writeFileSync(archive, 'rebuilt or substituted bytes');
  assert.throws(verify, /ARTIFACT_MISMATCH/);
  fs.rmSync(path.join(directory, 'receipt.json'));
  assert.throws(verify, /ENOENT/);
});

test('publication rejects archive symlinks and directories', (t) => {
  for (const kind of ['symlink', 'directory']) {
    const { options, archive } = publishFixture(t);
    fs.renameSync(archive, `${archive}.original`);
    if (kind === 'symlink') fs.symlinkSync(`${archive}.original`, archive);
    else fs.mkdirSync(archive);
    assert.throws(
      () => verifyPublishReceipt(options),
      kind === 'symlink' ? /ELOOP/ : /ARTIFACT_MISMATCH/,
      kind
    );
  }
});

test('publication rejects a FIFO archive without waiting for a writer', (t) => {
  const { options, archive } = publishFixture(t);
  fs.unlinkSync(archive);
  execFileSync('mkfifo', [archive], { timeout: 2000 });
  const child = spawnSync(
    process.execPath,
    [
      '-e',
      `const assert = require('node:assert/strict');
       const { verifyPublishReceipt } = require(process.argv[1]);
       assert.throws(() => verifyPublishReceipt(JSON.parse(process.argv[2])),
         /PUBLIC_QUALIFICATION_ARTIFACT_MISMATCH/);`,
      require.resolve('./sdk-qualification-phase'),
      JSON.stringify(options),
    ],
    { timeout: 2000, encoding: 'utf8' }
  );
  assert.ifError(child.error);
  assert.equal(child.status, 0, child.stderr);
});

test('publication only accepts unambiguous archive basenames', (t) => {
  const { options, archive, receipt, save } = publishFixture(t);
  for (const filename of [
    '-sdk.tgz',
    '--sdk.tgz',
    'sdk.tgz\n',
    'sdk\n.tgz',
    'sdk\r.tgz',
    'sdk\t.tgz',
    'sdk\0.tgz',
    'sdk .tgz',
    'sdk;echo.tgz',
    'sdk$(echo).tgz',
    'sdk`echo`.tgz',
    '../sdk.tgz',
    './sdk.tgz',
    '/sdk.tgz',
    'nested/sdk.tgz',
    'nested\\sdk.tgz',
    '.sdk.tgz',
    'sdk..tgz',
    'sdk.tar.tgz',
    'sdk.tgz.tgz',
    'sdk.tgz.js',
    'sdk.TGZ',
    `${'s'.repeat(252)}.tgz`,
  ]) {
    receipt.package.archive = filename;
    save();
    const verify = isolatedVerifier({ readdirSync: () => [filename] });
    assert.throws(() => verify(options), /RECEIPT_MISMATCH/, filename);
  }
  for (const filename of [
    'sdk.tgz',
    'tuturuuu-1.2.3.tgz',
    'sdk-1.2.3-beta.1.tgz',
    'tuturuuu-0.28.0-dev.123.abcdef0.tgz',
  ]) {
    receipt.package.archive = filename;
    save();
    const verify = isolatedVerifier({
      readdirSync: () => [filename],
      openSync: (_filename, flags) => fs.openSync(archive, flags),
    });
    assert.equal(verify(options), path.join(options.directory, filename));
  }
});

test('publication hashes the opened descriptor even if the archive path changes', (t) => {
  const { options, archive } = publishFixture(t);
  let opened;
  let closed;
  const verify = isolatedVerifier({
    openSync(filename, flags) {
      assert.equal(filename, archive);
      assert.equal(
        flags,
        fs.constants.O_RDONLY |
          fs.constants.O_NOFOLLOW |
          fs.constants.O_NONBLOCK
      );
      opened = fs.openSync(filename, flags);
      fs.renameSync(archive, `${archive}.original`);
      fs.writeFileSync(archive, 'replacement bytes');
      return opened;
    },
    fstatSync(fd) {
      assert.equal(fd, opened);
      return fs.fstatSync(fd);
    },
    readFileSync(file, ...args) {
      if (typeof file === 'number') assert.equal(file, opened);
      else assert.equal(file, path.join(options.directory, 'receipt.json'));
      return fs.readFileSync(file, ...args);
    },
    closeSync(fd) {
      closed = fd;
      fs.closeSync(fd);
    },
  });
  assert.equal(verify(options), archive);
  assert.equal(closed, opened);
  assert.throws(() => fs.fstatSync(opened), /EBADF/);
  assert.throws(() => verifyPublishReceipt(options), /ARTIFACT_MISMATCH/);
});

test('publication closes its descriptor after stat, read or digest failure', (t) => {
  for (const failure of ['stat', 'read', 'digest']) {
    const { options, receipt, save } = publishFixture(t);
    let opened;
    let closed;
    if (failure === 'digest') {
      receipt.package.sha256 = '0'.repeat(64);
      save();
    }
    const verify = isolatedVerifier({
      openSync(...args) {
        opened = fs.openSync(...args);
        return opened;
      },
      fstatSync(fd) {
        if (failure === 'stat') throw new Error('STAT_FAILED');
        return fs.fstatSync(fd);
      },
      readFileSync(file, ...args) {
        if (typeof file === 'number' && failure === 'read')
          throw new Error('READ_FAILED');
        return fs.readFileSync(file, ...args);
      },
      closeSync(fd) {
        closed = fd;
        fs.closeSync(fd);
      },
    });
    assert.throws(
      () => verify(options),
      /STAT_FAILED|READ_FAILED|ARTIFACT_MISMATCH/
    );
    assert.equal(closed, opened, failure);
    assert.throws(() => fs.fstatSync(opened), /EBADF/);
  }
});

test('npm cannot silently omit a declared optional or peer runtime package', (t) => {
  const consumer = fixture(t);
  const manifest = { optionalDependencies: { 'optional-runtime': '^1.0.0' } };
  const lock = {
    packages: {
      'node_modules/optional-runtime': {
        version: '1.0.0',
        integrity: 'sha512-YWJj',
        resolved: 'https://registry.npmjs.org/optional-runtime/-/runtime.tgz',
      },
    },
  };
  assert.throws(
    () => requireInstalledDependencies(manifest, consumer, lock),
    /INSTALLED_DEPENDENCY_MISSING/
  );
  const directory = path.join(consumer, 'node_modules/optional-runtime');
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(
    path.join(directory, 'package.json'),
    JSON.stringify({ name: 'optional-runtime', version: '1.0.0' })
  );
  requireInstalledDependencies(manifest, consumer, lock);
  lock.packages['node_modules/optional-runtime'].version = '2.0.0';
  assert.throws(
    () => requireInstalledDependencies(manifest, consumer, lock),
    /INSTALLED_DEPENDENCY_MISMATCH/
  );
});

test('OIDC verifier is inline trusted workflow code and consumes artifacts only as data', () => {
  const workflow = fs.readFileSync(
    path.resolve(__dirname, '../../.github/workflows/release-sdk-package.yaml'),
    'utf8'
  );
  const publish = workflow
    .split('\n  publish-npm:')[1]
    .split('\n  dispatch-dependent-releases:')[0];
  const inline = publish
    .split("PACKAGE_TARBALL=$(node <<'NODE'\n")[1]
    .split('\n          NODE')[0]
    .split('\n')
    .map((line) => line.slice(10))
    .join('\n');
  assert.ok(
    inline.includes(verifyPublishReceipt.toString()),
    'the tested receipt verifier must match trusted inline workflow bytes'
  );
  assert.doesNotMatch(
    publish,
    /verify-receipt\.cjs|actions\/checkout|bun install|npm install|npm pack\b|run build/
  );
  assert.match(publish, /id-token: write/);
  assert.match(publish, /environment: sdk-release-production/);
  assert.match(
    publish,
    /PACKAGE_TARBALL: \$\{\{ steps.artifact.outputs.path \}\}/
  );
  assert.match(publish, /npm publish "\$\{PACKAGE_TARBALL\}" --ignore-scripts/);
  for (const run of publish.split(/\n {8}run: \|\n/).slice(1)) {
    const script = run.split(/\n {6}(?=\S)/)[0];
    assert.doesNotMatch(script, /\$\{\{/);
  }
  const prepare = workflow
    .split('\n  prepare-publish-npm:')[1]
    .split('\n  publish-npm:')[0];
  assert.match(prepare, /SOURCE_SHA: \$\{\{ github.sha \}\}/);
  assert.doesNotMatch(prepare, /npm pack|id-token: write|verify-receipt\.cjs/);
});

test('SDK serial preparation preserves bounded script-free qualified artifact handoff', () => {
  const workflow = fs.readFileSync(
    path.resolve(__dirname, '../../.github/workflows/release-sdk-package.yaml'),
    'utf8'
  );
  assert.match(workflow, /--concurrency=1 --filter=tuturuuu\.\.\./);
  assert.match(workflow, /node scripts\/ci\/qualify-sdk-package.js/);
  assert.match(
    workflow,
    /path: \$\{\{ runner.temp \}\}\/tuturuuu-sdk-package\//
  );
  assert.match(workflow, /if-no-files-found: error/);
  assert.match(workflow, /retention-days: 1/);
  assert.match(workflow, /compression-level: 0/);
  assert.match(workflow, /needs: release-gate/);
  assert.match(workflow, /dependencies_ready == 'true'/);
});
