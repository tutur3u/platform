const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { devVersion, checksumManifest, pack } = require('./sdk-dev-pack');
const {
  stageBuildIdentity,
  verifyPublishReceipt,
} = require('./sdk-qualification-phase');
const sha = 'abcdef0'.padEnd(40, '1');
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk-dev-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
test('dev versions require a stable base, monotonic run identity and exact source SHA', () => {
  assert.equal(devVersion('0.28.0', '123', sha), '0.28.0-dev.123.abcdef0');
  for (const args of [
    ['latest', '123', sha],
    ['0.28.0-dev.1', '1', sha],
    ['0.28.0', '0', sha],
    ['0.28.0', '1;echo', sha],
    ['0.28.0', '1', 'abc'],
  ])
    assert.throws(() => devVersion(...args), /INVALID_DEV_IDENTITY/);
});
test('staging embeds exact source and channel without changing source manifest', (t) => {
  const root = fixture(t),
    manifestPath = path.join(root, 'package.json');
  const source = { name: 'tuturuuu', version: '0.28.0' };
  const before = Buffer.from(JSON.stringify(source));
  const reset = () => fs.writeFileSync(manifestPath, before);
  reset();
  const packageVersion = devVersion(source.version, '123', sha);
  const dev = stageBuildIdentity({
    before,
    manifestPath,
    sourceSha: sha,
    packageVersion,
  });
  assert.deepEqual(dev.source, source);
  assert.equal(dev.staged.version, packageVersion);
  assert.deepEqual(dev.staged.tuturuuuBuild, {
    channel: 'dev',
    sourceSha: sha,
  });
  assert.deepEqual(JSON.parse(before), source);
  reset();
  assert.deepEqual(
    stageBuildIdentity({ before, manifestPath, sourceSha: sha }).staged
      .tuturuuuBuild,
    { channel: 'latest', sourceSha: sha }
  );
  for (const version of [
    '0.29.0-dev.123.abcdef0',
    '0.28.0-dev.123.fffffff',
    '0.28.0',
  ]) {
    reset();
    assert.throws(
      () =>
        stageBuildIdentity({
          before,
          manifestPath,
          sourceSha: sha,
          packageVersion: version,
        }),
      /INVALID_BUILD_IDENTITY/
    );
  }
});
test('checksum manifest binds all advertised hashes to archive bytes and marks private packs', (t) => {
  const root = fixture(t),
    archive = path.join(root, 'sdk.tgz');
  const bytes = Buffer.from('fixture tarball');
  fs.writeFileSync(archive, bytes);
  const result = checksumManifest({
    archive,
    version: '1.0.0-dev.1.abcdef0',
    sourceSha: sha,
    internalOnly: true,
  });
  assert.equal(result.sha, sha);
  assert.equal(result.internalOnly, true);
  for (const [field, algorithm, encoding] of [
    ['sha256', 'sha256', 'hex'],
    ['shasum', 'sha1', 'hex'],
  ])
    assert.equal(
      result[field],
      createHash(algorithm).update(bytes).digest(encoding)
    );
  assert.equal(
    result.integrity,
    `sha512-${createHash('sha512').update(bytes).digest('base64')}`
  );
});
test('pack refuses dirty tracked or untracked source before any build', async (t) => {
  const root = fixture(t);
  const calls = [];
  await assert.rejects(
    pack({
      root,
      run: async (exe, args) => {
        calls.push([exe, args]);
        return {
          status: 0,
          stdout: ' M packages/sdk/src/cli/index.ts',
          signal: null,
        };
      },
    }),
    /CLEAN_CHECKOUT/
  );
  assert.equal(calls.length, 1);
});
test('publish job keeps exact trusted-ref fences, separate authority and the canonical verifier', () => {
  const workflow = fs.readFileSync(
    path.join(__dirname, '../../.github/workflows/release-sdk-dev.yaml'),
    'utf8'
  );
  const publish = workflow.slice(workflow.indexOf('  publish:'));
  assert.ok(
    publish.includes(
      "github.repository == 'tutur3u/platform' && github.ref == 'refs/heads/main'"
    )
  );
  assert.ok(publish.includes('environment: sdk-release-dev'));
  assert.ok(publish.includes('id-token: write'));
  assert.ok(
    publish.includes('--tag dev --provenance --access public --ignore-scripts')
  );
  const inline = publish
    .split("PACKAGE_TARBALL=$(node <<'NODE'\n")[1]
    .split('\n          NODE')[0]
    .split('\n')
    .map((line) => line.slice(10))
    .join('\n');
  assert.ok(inline.includes(verifyPublishReceipt.toString()));
  for (const forbidden of [
    'actions/checkout@',
    'bun install',
    'npm install',
    '--tag latest',
    'secrets.',
  ])
    assert.ok(!publish.includes(forbidden), forbidden);
  assert.ok(!workflow.includes('pull_request:'));
});

test('private pack verifies qualified bytes, writes manifest and releases its build lock', async (t) => {
  const root = fixture(t),
    output = path.join(root, 'output');
  fs.mkdirSync(path.join(root, 'packages/sdk'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'packages/sdk/package.json'),
    JSON.stringify({ name: 'tuturuuu', version: '0.28.0' })
  );
  const calls = [];
  const run = async (exe, args) => {
    calls.push([exe, args]);
    if (exe === 'bun')
      assert.ok(fs.existsSync(path.join(root, 'packages/sdk/.dev-pack.lock')));
    return {
      status: 0,
      signal: null,
      stdout: args[0] === 'rev-parse' ? sha : '',
    };
  };
  const qualifyPackage = async (options) => {
    assert.equal(options.packageVersion, '0.28.0-dev.123.abcdef0');
    assert.equal(options.sourceSha, sha);
    fs.mkdirSync(output);
    const bytes = Buffer.from('qualified bytes');
    const receipt = {
      version: 2,
      phase: 'public',
      sourceSha: sha,
      qualified: true,
      processGroupsDrained: true,
      temporaryFixtureDrained: true,
      lifecycleScriptsExecuted: false,
      modelActivity: false,
      package: {
        name: 'tuturuuu',
        version: options.packageVersion,
        archive: 'tuturuuu-0.28.0-dev.123.abcdef0.tgz',
        sha256: createHash('sha256').update(bytes).digest('hex'),
      },
    };
    fs.writeFileSync(path.join(output, receipt.package.archive), bytes);
    fs.writeFileSync(
      path.join(output, 'receipt.json'),
      JSON.stringify(receipt)
    );
    return { receipt };
  };
  const result = await pack({
    root,
    output,
    runId: '123',
    run,
    qualifyPackage,
  });
  assert.equal(result.manifest.internalOnly, true);
  assert.deepEqual(
    JSON.parse(fs.readFileSync(path.join(output, 'manifest.json'))),
    result.manifest
  );
  assert.equal(
    fs.existsSync(path.join(root, 'packages/sdk/.dev-pack.lock')),
    false
  );
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(root, 'packages/sdk/package.json')))
      .version,
    '0.28.0'
  );
  assert.ok(calls.some(([exe, args]) => exe === 'git' && args[0] === 'diff'));
});

test('failed build releases only its pack lock and never qualifies or writes acceptance', async (t) => {
  const root = fixture(t);
  fs.mkdirSync(path.join(root, 'packages/sdk'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'packages/sdk/package.json'),
    JSON.stringify({ name: 'tuturuuu', version: '0.28.0' })
  );
  await assert.rejects(
    pack({
      root,
      runId: '1',
      run: async (exe, args) => ({
        status: exe === 'bun' ? 1 : 0,
        signal: null,
        stdout: args[0] === 'rev-parse' ? sha : '',
      }),
      qualifyPackage: () => {
        throw new Error('MUST_NOT_QUALIFY');
      },
    }),
    /DEV_PACK_COMMAND_FAILED: bun/
  );
  assert.equal(
    fs.existsSync(path.join(root, 'packages/sdk/.dev-pack.lock')),
    false
  );
});
