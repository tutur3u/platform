const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const test = require('node:test');
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
  assert.match(
    publish,
    /npm publish "\$\{\{ steps.artifact.outputs.path \}\}" --ignore-scripts/
  );
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
