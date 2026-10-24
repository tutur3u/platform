const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const test = require('node:test');
const {
  drainGroup,
  checkIdentity,
  safeMember,
  inventory,
  runProcess,
  oneObject,
  checkRegistryTuple,
  checkPack,
  privateEnvironment,
  qualify,
} = require('./qualify-sdk-package');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk-pack-source-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
function write(root, name, content) {
  const target = path.join(root, name);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(
    target,
    typeof content === 'string' ? content : JSON.stringify(content)
  );
}
const result = (value, status = 0) => ({
  status,
  signal: null,
  stdout: typeof value === 'string' ? value : JSON.stringify(value),
  stderr: '',
});

test('unsafe archive members and symlinked staging inputs are denied', (t) => {
  for (const name of [
    '../secret',
    '/absolute',
    'dist/../secret',
    'dist\\secret',
    'dist//x',
    'dist/./x',
    'bad\0name',
  ]) {
    assert.throws(() => safeMember(name), { code: 'UNSAFE_PACKAGE_PATH' });
  }
  const root = fixture(t);
  write(root, 'outside.txt', 'retained');
  fs.mkdirSync(path.join(root, 'dist'));
  fs.symlinkSync(path.join(root, 'outside.txt'), path.join(root, 'dist/link'));
  assert.throws(() => inventory(path.join(root, 'dist')), {
    code: 'UNSAFE_PACKAGE_PATH',
  });
  assert.equal(
    fs.readFileSync(path.join(root, 'outside.txt'), 'utf8'),
    'retained'
  );
});

test('registry admission requires exact name, version, and integrity', () => {
  const tuple = {
    name: '@tuturuuu/private',
    version: '1.2.3',
    dist: { integrity: 'sha512-YWJj' },
  };
  assert.deepEqual(
    checkRegistryTuple(tuple.name, tuple.version, result(tuple)),
    {
      name: tuple.name,
      version: tuple.version,
      integrity: tuple.dist.integrity,
    }
  );
  for (const value of [
    { ...tuple, version: '1.2.4' },
    { ...tuple, name: 'different' },
    { ...tuple, dist: {} },
    [],
    'not JSON',
  ]) {
    assert.throws(
      () => checkRegistryTuple(tuple.name, tuple.version, result(value)),
      { code: 'REGISTRY_DEPENDENCY_UNAVAILABLE' }
    );
  }
  assert.throws(
    () => checkRegistryTuple(tuple.name, tuple.version, result('', 1)),
    { code: 'REGISTRY_DEPENDENCY_UNAVAILABLE' }
  );
});

test('package identity requires name/version equality at every stage', () => {
  const expected = { name: 'tuturuuu', version: '0.27.0' };
  for (const stage of [
    'source',
    'staging',
    'pack',
    'archive',
    'installed',
    'lock',
  ]) {
    assert.deepEqual(checkIdentity(expected, expected, stage), expected);
    for (const value of [
      { ...expected, name: 'foreign' },
      { ...expected, version: '0.28.0' },
      {},
    ])
      assert.throws(() => checkIdentity(expected, value, stage), {
        code: 'PACKAGE_IDENTITY_MISMATCH',
      });
  }
});

test('owned group drain waits for disappearance and fails closed on a live or unknown group', async () => {
  let polls = 0;
  await drainGroup(12345, () => ++polls < 3, 100);
  assert.equal(polls, 3);
  await assert.rejects(
    drainGroup(12345, () => true, 25),
    { code: 'PROCESS_GROUP_UNDRAINED', undrainedGroup: 12345 }
  );
  await assert.rejects(
    drainGroup(
      12345,
      () => {
        throw Error('unknown');
      },
      25
    ),
    { message: 'unknown' }
  );
});

test('pack inventory rejects fixture leaks, escaped members, and missing compiled entry', () => {
  for (const name of [
    'dist/test.sqlite',
    '../escaped',
    'dist/runtime.py',
    'dist/cache.test.js',
  ]) {
    assert.throws(
      () =>
        checkPack(
          result([{ filename: 'sdk.tgz', files: [{ path: name, size: 1 }] }]),
          [{ path: name }]
        ),
      (error) => ['UNSAFE_PACKAGE_PATH', 'PACK_FAILED'].includes(error.code)
    );
  }
  assert.throws(
    () => checkPack(result([{ filename: 'sdk.tgz', files: [] }]), []),
    { code: 'PACK_FAILED' }
  );
});

test('CLI admission rejects multiline output, failures, and stderr', () => {
  assert.deepEqual(oneObject(result({ ok: true })), { ok: true });
  for (const value of [
    result('{}\n{}'),
    result('[]'),
    result('{}', 1),
    { ...result('{}'), stderr: 'unexpected' },
  ]) {
    assert.throws(() => oneObject(value), { code: 'COMPILED_CLI_FAILED' });
  }
});

test('private subprocess environment omits credentials and inherited npm configuration', () => {
  const env = privateEnvironment('/tmp/synthetic-home');
  assert.equal(env.HOME, '/tmp/synthetic-home');
  assert.equal(env.TUTURUUU_API_URL, 'http://127.0.0.1:1');
  for (const name of [
    'NPM_TOKEN',
    'NODE_AUTH_TOKEN',
    'GH_TOKEN',
    'NODE_OPTIONS',
    'npm_config_prefix',
  ])
    assert.equal(Object.hasOwn(env, name), false);
});

test('finite process controls drain on timeout and output overflow', async () => {
  const env = { PATH: process.env.PATH };
  await assert.rejects(
    runProcess(process.execPath, ['-e', 'setInterval(()=>{},1000)'], {
      env,
      timeoutMs: 100,
    }),
    { code: 'PROCESS_DEADLINE' }
  );
  await assert.rejects(
    runProcess(
      process.execPath,
      [
        '-e',
        'process.stdout.write("x".repeat(2*1024*1024));setInterval(()=>{},1000)',
      ],
      { env, timeoutMs: 3000 }
    ),
    { code: 'PROCESS_OUTPUT_LIMIT' }
  );
  const drained = await runProcess(
    process.execPath,
    ['-e', 'console.log("done")'],
    { env }
  );
  assert.equal(drained.status, 0);
  assert.equal(drained.stdout, 'done\n');
});

test('unavailable registry dependency blocks before pack/install and preserves package beforeimages', async (t) => {
  const root = fixture(t);
  write(root, 'packages/sdk/bin/ttr.cjs', 'synthetic fixture');
  write(root, 'package.json', { workspaces: ['packages/*'] });
  write(root, 'packages/sdk/package.json', {
    name: 'tuturuuu',
    version: '0.0.0',
    dependencies: { '@tuturuuu/private': 'workspace:*' },
  });
  write(root, 'packages/private/package.json', {
    name: '@tuturuuu/private',
    version: '1.2.3',
  });
  write(
    root,
    'packages/sdk/dist/index.js',
    'synthetic source fixture; never executed'
  );
  const before = fs.readFileSync(path.join(root, 'packages/sdk/package.json'));
  const commands = [];
  const sourceSha = 'a'.repeat(40);
  const run = async (command, args) => {
    commands.push([command, args]);
    if (command === 'git') return result(`${sourceSha}\n`);
    if (command === process.execPath) return result('v24.21.0\n');
    if (command === 'bun') return result('1.4.4\n');
    if (command === 'npm' && args[0] === 'view') return result('', 1);
    assert.fail('pack/install must never run after missing registry tuple');
  };
  const { receipt } = await qualify({
    root,
    output: path.join(root, 'output'),
    sourceSha,
    run,
  });
  assert.equal(receipt.qualified, false);
  assert.equal(receipt.blocker.code, 'REGISTRY_DEPENDENCY_UNAVAILABLE');
  assert.equal(receipt.modelActivity, false);
  assert.equal(receipt.temporaryFixtureDrained, true);
  assert.deepEqual(
    fs.readFileSync(path.join(root, 'packages/sdk/package.json')),
    before
  );
  assert.equal(commands.filter(([command]) => command === 'npm').length, 1);
  assert.equal(fs.existsSync(path.join(root, 'output/receipt.json')), true);
});

test('source mismatch blocks all package and runtime operations', async (t) => {
  const root = fixture(t);
  write(root, 'packages/sdk/package.json', { name: 'tuturuuu' });
  const commands = [];
  const { receipt } = await qualify({
    root,
    output: path.join(root, 'output'),
    sourceSha: 'a'.repeat(40),
    run: async (command) => {
      commands.push(command);
      return result('b'.repeat(40));
    },
  });
  assert.equal(receipt.blocker.code, 'SOURCE_SHA_MISMATCH');
  assert.deepEqual(commands, ['git']);
  assert.equal(receipt.temporaryFixtureDrained, true);
});

test('deadline verifies group disappearance for a descendant that outlives its leader', async (t) => {
  const root = fixture(t);
  const marker = path.join(root, 'descendant-marker');
  const child = `require('node:fs').writeFileSync(${JSON.stringify(marker)},process.argv[1]);setInterval(()=>{},1000)`;
  const leader = `require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(child)},String(process.pid)],{stdio:'inherit'});process.exit(0)`;
  await assert.rejects(
    runProcess(process.execPath, ['-e', leader], {
      env: { PATH: process.env.PATH },
      timeoutMs: 400,
    }),
    { code: 'PROCESS_DEADLINE' }
  );
  const group = Number(fs.readFileSync(marker, 'utf8'));
  assert.throws(() => process.kill(-group, 0), { code: 'ESRCH' });
});

test('leader close waits for descendants that closed their output streams', async (t) => {
  const marker = path.join(fixture(t), 'closed-stream-group');
  const child =
    "require('node:fs').writeFileSync(process.argv[1],process.argv[2]);setInterval(()=>{},1000)";
  const leader =
    "const fs=require('node:fs');require('node:child_process').spawn(process.execPath,['-e',process.argv[1],process.argv[2],String(process.pid)],{stdio:'ignore'});setInterval(()=>{if(fs.existsSync(process.argv[2]))process.exit(0)},10)";
  const args = ['-e', leader, child, marker];
  const completed = await runProcess(process.execPath, args, {
    env: { PATH: process.env.PATH },
    timeoutMs: 3000,
  });
  assert.equal(completed.status, 0);
  assert.throws(
    () => process.kill(-Number(fs.readFileSync(marker, 'utf8')), 0),
    { code: 'ESRCH' }
  );
});

test('output directory cannot overwrite existing receipts or escape the temporary root', async (t) => {
  const root = fixture(t);
  const options = { root, sourceSha: 'a'.repeat(40) };
  await assert.rejects(qualify({ ...options, output: root }), {
    code: 'UNSAFE_OUTPUT',
  });
  await assert.rejects(qualify({ ...options, output: '/sdk-qualification' }), {
    code: 'UNSAFE_OUTPUT',
  });
});

async function injectedPipeline(t, changes = {}, implementation = qualify) {
  const root = fixture(t);
  write(root, 'package.json', { workspaces: ['packages/*'] });
  write(root, 'packages/sdk/package.json', {
    name: 'tuturuuu',
    version: '0.0.0',
    files: ['dist', 'bin'],
    ...changes.manifest,
  });
  write(root, 'packages/unpublished/package.json', {
    name: '@tuturuuu/unpublished',
    version: '1.2.3',
  });
  const required = [
    'index.js',
    'index.d.ts',
    '../bin/ttr.cjs',
    'cli/index.js',
    'cli/operational-cli.js',
    'cli/operational-search.js',
    'operational-graph/reader.js',
    'operational-search/python-adapter-code.js',
  ];
  for (const name of required)
    write(
      root,
      `packages/sdk/dist/${name}`,
      'synthetic source fixture; never executed'
    );
  write(
    root,
    'packages/sdk/src/operational-search/python-adapter.py',
    'synthetic adapter'
  );
  write(
    root,
    'packages/sdk/src/operational-search/python-runtime-manifest.json',
    '{}'
  );
  write(
    root,
    'packages/sdk/src/operational-search/python-installation-manifest.json',
    '{}'
  );
  const digest = (text) => createHash('sha256').update(text).digest('hex');
  const commands = [];
  let stageSdk, consumer, archiveFiles;
  const sourceSha = 'a'.repeat(40);
  const run = async (command, args, options) => {
    commands.push([command, args]);
    if (command === 'git') {
      if (changes.undrained)
        throw Object.assign(new Error('synthetic undrained group'), {
          code: 'PROCESS_GROUP_UNDRAINED',
          undrainedGroup: 12345,
        });
      return result(sourceSha);
    }
    if (args[0] === '--version')
      return result(command === 'bun' ? '1.4.4' : 'v24.21.0');
    if (command === 'npm' && args[0] === 'view')
      return changes.registryTuple
        ? result(changes.registryTuple)
        : result('', 1);
    if (command === 'npm' && args[0] === 'pack') {
      stageSdk = options.cwd;
      archiveFiles = inventory(stageSdk).map((item) => ({
        path: item.path,
        size: item.bytes,
      }));
      fs.writeFileSync(
        path.join(args.at(-1), 'synthetic.tgz'),
        'not a real package archive'
      );
      return result([
        {
          name: changes.packName ?? 'tuturuuu',
          version: changes.packVersion ?? '0.0.0',
          integrity:
            'sha512-' +
            createHash('sha512')
              .update('not a real package archive')
              .digest('base64'),
          filename: 'synthetic.tgz',
          files: archiveFiles,
        },
      ]);
    }
    if (command === 'tar' && args[0] === '-xOzf')
      return result({
        ...JSON.parse(fs.readFileSync(path.join(stageSdk, 'package.json'))),
        name: changes.archiveName ?? 'tuturuuu',
        version: changes.archiveVersion ?? '0.0.0',
      });
    if (command === 'tar')
      return result(
        archiveFiles
          .map((item) =>
            args[0] === '-tzf'
              ? `package/${item.path}`
              : `-rw-r--r-- synthetic package/${item.path}`
          )
          .join('\n')
      );
    if (command === 'npm' && args[0] === 'install') {
      if (changes.installFailure) return changes.installFailure;
      consumer = options.cwd;
      const installed = path.join(consumer, 'node_modules/tuturuuu');
      fs.cpSync(stageSdk, installed, { recursive: true });
      fs.mkdirSync(path.join(consumer, 'node_modules/.bin'));
      for (const alias of ['ttr', 'tuturuuu', 'tutur3u'])
        fs.symlinkSync(
          path.join(installed, 'bin/ttr.cjs'),
          path.join(consumer, 'node_modules/.bin', alias)
        );
      if (changes.installedName || changes.installedVersion)
        write(installed, 'package.json', {
          ...JSON.parse(fs.readFileSync(path.join(installed, 'package.json'))),
          name: changes.installedName ?? 'tuturuuu',
          version: changes.installedVersion ?? '0.0.0',
        });
      write(consumer, 'package-lock.json', {
        packages: {
          'node_modules/tuturuuu': {
            name: changes.lockName ?? 'tuturuuu',
            version: changes.lockVersion ?? '0.0.0',
            resolved: changes.lockArchive ?? `file:${args.at(-1)}`,
            integrity:
              'sha512-' +
              createHash('sha512')
                .update('not a real package archive')
                .digest('base64'),
          },
        },
      });
      changes.afterInstall?.(consumer);
      return result({});
    }
    if (args.includes('-e')) {
      const db = path.join(consumer, 'synthetic-backlog.sqlite');
      fs.writeFileSync(db, 'synthetic database marker, never opened');
      return result({
        exports: ['dist/index.js'],
        adapter: digest('synthetic adapter'),
        runtime: digest('{}'),
        installation: digest('{}'),
        runtimeObject: digest('{}'),
        installationObject: digest('{}'),
        db,
      });
    }
    if (args.includes('model-status'))
      return result({
        modelLoaded: false,
        downloadPerformed: false,
        runtimeExecuted: false,
        runtimeProbePerformed: false,
      });
    if (args.includes('help')) return result({ group: 'backlog search' });
    if (args.includes('index'))
      return result({ embedded: 0, modelLoaded: false });
    if (args.includes('RSVP lịch'))
      return result({
        results: [{ id: 'synthetic-rsvp', actionAuthorized: false }],
      });
    if (args.includes('query'))
      return result({ error: { code: 'INVALID_INPUT' } }, 2);
    assert.fail('unexpected injected command');
  };
  const { receipt } = await implementation({
    root,
    output: path.join(root, 'output'),
    sourceSha,
    phase: changes.phase,
    run,
  });
  return { receipt, commands, consumer, root };
}

test('injected pipeline checks shipped resources and compiled-entry controls without package tools', async (t) => {
  const { receipt, commands, consumer } = await injectedPipeline(t);
  assert.equal(receipt.qualified, true, JSON.stringify(receipt.blocker));
  assert.equal(receipt.controls.length, 14);
  assert.equal(receipt.temporaryFixtureDrained, true);
  assert.equal(
    commands.filter(
      ([command, args]) => command === 'npm' && args[0] === 'pack'
    ).length,
    1
  );
  assert.equal(
    commands.some(
      ([, args]) =>
        args.includes('--runtime-dir') || args.includes('model-prepare')
    ),
    false
  );
  assert.equal(fs.existsSync(consumer), false);
});

test('injected mismatched pack/archive/install/lock metadata never qualifies', async (t) => {
  for (const field of [
    'packName',
    'packVersion',
    'archiveName',
    'archiveVersion',
    'installedName',
    'installedVersion',
    'lockName',
    'lockVersion',
    'lockArchive',
  ]) {
    const { receipt } = await injectedPipeline(t, {
      [field]: field.endsWith('Version') ? '9.9.9' : 'foreign',
    });
    assert.equal(receipt.qualified, false, field);
    assert.equal(receipt.blocker.code, 'PACKAGE_IDENTITY_MISMATCH', field);
    assert.equal(receipt.temporaryFixtureDrained, true, field);
  }
});

test('undrained group retains its owned fixture and evidence instead of cleanup', async (t) => {
  const { receipt } = await injectedPipeline(t, { undrained: true });
  assert.equal(receipt.qualified, false);
  assert.equal(receipt.blocker.code, 'PROCESS_GROUP_UNDRAINED');
  assert.equal(receipt.processGroupsDrained, false);
  assert.equal(receipt.temporaryFixtureDrained, false);
  assert.equal(receipt.retainedFixture.ownedProcessGroup, 12345);
  assert.equal(fs.existsSync(receipt.retainedFixture.path), true);
  t.after(() =>
    fs.rmSync(receipt.retainedFixture.path, { recursive: true, force: true })
  );
});

test('workflow admits only raw-head build/test qualification and preserves other switchboard keys', () => {
  const repo = path.resolve(__dirname, '../..');
  const workflow = fs.readFileSync(
    path.join(repo, '.github/workflows/sdk-package-qualification.yaml'),
    'utf8'
  );
  assert.match(
    workflow,
    /ref: \$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/
  );
  assert.match(workflow, /--concurrency=1 --filter=tuturuuu\.\.\./);
  assert.doesNotMatch(
    workflow,
    /pull_request_target|secrets\.|id-token:|npm publish|production\]/
  );
  assert.match(workflow, /node-version: 24\.21\.0/);
  assert.match(workflow, /bun-version: 1\.4\.4/);
  const config = fs.readFileSync(path.join(repo, 'tuturuuu.ci.ts'), 'utf8');
  assert.match(config, /'sdk-package-qualification.yaml': true/);
  assert.match(config, /'vercel-production-tanstack-web.yaml': false/);
});

test('a process-helper-only change selects package qualification', () => {
  const repo = path.resolve(__dirname, '../..');
  const workflow = fs.readFileSync(
    path.join(repo, '.github/workflows/sdk-package-qualification.yaml'),
    'utf8'
  );
  const rules = [
    ...workflow.split('workflow_dispatch:')[0].matchAll(/^ {6}- "([^"]+)"$/gm),
  ].map((match) => match[1]);
  const helper = 'scripts/ci/sdk-package-process.js';
  const selected = (paths) =>
    paths.some((rule) => path.matchesGlob(helper, rule));
  assert.equal(
    selected(rules.filter((rule) => rule !== helper)),
    false,
    'prior trigger excluded a helper-only change'
  );
  assert.equal(
    selected(rules),
    true,
    'helper-only changes must run the drain controls'
  );
});

test('install failure retains only bounded diagnostic hashes and allowlisted reported codes before cleanup', async (t) => {
  const secret = 'synthetic-private-token';
  const stderr =
    `npm error code ERESOLVE\nnpm error /private/customer ${secret} https://registry.invalid/auth?token=${secret}\n` +
    'x'.repeat(9000);
  const stdout = `private stdout ${secret}`;
  const { receipt, commands, root } = await injectedPipeline(t, {
    installFailure: { status: 1, signal: null, stdout, stderr },
  });
  assert.equal(receipt.qualified, false);
  assert.equal(receipt.blocker.code, 'PACKAGE_INSTALL_FAILED');
  assert.equal(receipt.temporaryFixtureDrained, true);
  const diagnostic = receipt.installFailure;
  assert.equal(diagnostic.exitStatus, 1);
  assert.equal(diagnostic.signal, null);
  assert.equal(diagnostic.npmCode, 'ERESOLVE');
  assert.equal(diagnostic.category, 'dependency-resolution');
  for (const [name, text] of Object.entries({ stdout, stderr })) {
    const bytes = Buffer.from(text),
      prefix = bytes.subarray(0, 4096);
    assert.deepEqual(diagnostic[name], {
      hashedBytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      prefixHashedBytes: prefix.length,
      prefixSha256: createHash('sha256').update(prefix).digest('hex'),
    });
  }
  const saved = fs.readFileSync(path.join(root, 'output/receipt.json'), 'utf8');
  assert.doesNotMatch(
    saved,
    /synthetic-private-token|registry\.invalid|customer|private stdout/
  );
  assert.deepEqual(JSON.parse(saved).installFailure, diagnostic);
  assert.equal(commands.at(-1)[1][0], 'install');
  const unknown = await injectedPipeline(t, {
    installFailure: {
      status: null,
      signal: 'SIGTERM',
      stdout: '',
      stderr: 'npm error code SECRET_VALUE\nnpm error code E404 token=private',
    },
  });
  assert.equal(unknown.receipt.installFailure.npmCode, null);
  assert.equal(unknown.receipt.installFailure.category, 'unclassified');
  assert.equal(unknown.receipt.installFailure.signal, 'SIGTERM');
});

test('serial build uses the cache wrapper with empty default credentials', () => {
  const workflow = fs.readFileSync(
    path.resolve(
      __dirname,
      '../../.github/workflows/sdk-package-qualification.yaml'
    ),
    'utf8'
  );
  assert.match(
    workflow,
    /name: Build SDK and dependencies serially\n\s+uses: \.\/\.github\/actions\/run-with-turbo-remote-cache\n\s+with:\n\s+command: timeout --kill-after=10s 900s bun turbo:local run build --concurrency=1 --filter=tuturuuu\.\.\./
  );
  assert.doesNotMatch(workflow, /(?:token|team|api|signature-key):|secrets\./);
});

test('E404 receipt retains public registry identity before private fixture cleanup', async (t) => {
  const stderr = [
    'npm error code E404',
    'npm error 404 Not Found - GET https://registry.npmjs.org/@example%2fmissing - Not found',
    "npm error 404 '@example/missing@1.2.3' is not in this registry.",
    'npm error Authorization: Bearer synthetic-private-token',
  ].join('\n');
  const { receipt, root } = await injectedPipeline(t, {
    installFailure: { status: 1, signal: null, stdout: '', stderr },
  });
  assert.deepEqual(receipt.installFailure.publicRegistryRequests, [
    {
      registry: 'https://registry.npmjs.org',
      package: '@example/missing',
      version: '1.2.3',
    },
  ]);
  assert.equal(receipt.installFailure.npmCode, 'E404');
  assert.equal(receipt.qualified, false);
  assert.equal(receipt.temporaryFixtureDrained, true);
  assert.equal(receipt.processGroupsDrained, true);
  assert.doesNotMatch(
    fs.readFileSync(path.join(root, 'output/receipt.json'), 'utf8'),
    /Authorization|Bearer|synthetic-private-token/
  );
});

require('./qualify-sdk-package-diagnostics.test');

require('./sdk-qualification-pipeline-controls').pipelineTests(
  injectedPipeline
);
