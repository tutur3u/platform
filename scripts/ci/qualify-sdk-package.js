const {
  installFailureDiagnostic,
} = require('./qualify-sdk-package-diagnostics');
const { runProcess, drainGroup } = require('./sdk-package-process');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  preparePackageManifest,
  getWorkspaceVersions,
} = require('./prepare-npm-package-manifest');
const {
  stageSdkRuntime,
  registryRewrites,
  requireInstalledDependencies,
} = require('./sdk-qualification-phase');
const MAX_BYTES = 128 * 1024 * 1024;
const MAX_FILES = 20000;
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const json = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}
function safeMember(value) {
  if (
    typeof value !== 'string' ||
    value.length > 1024 ||
    !value ||
    value.includes('\\') ||
    value.includes('\0') ||
    path.posix.isAbsolute(value) ||
    value.split('/').some((part) => !part || part === '..' || part === '.')
  ) {
    fail('UNSAFE_PACKAGE_PATH', 'Unsafe inventory member');
  }
  return value;
}
function inventory(root) {
  if (fs.lstatSync(root).isSymbolicLink())
    fail('UNSAFE_PACKAGE_PATH', 'package root is a symlink');
  const files = [];
  let bytes = 0;
  function walk(dir) {
    for (const name of fs.readdirSync(dir).sort()) {
      const file = path.join(dir, name);
      const stat = fs.lstatSync(file);
      if (stat.isSymbolicLink())
        fail('UNSAFE_PACKAGE_PATH', 'Symlink in package source');
      if (stat.isDirectory()) walk(file);
      else {
        if (!stat.isFile())
          fail('UNSAFE_PACKAGE_PATH', 'Nonregular package file');
        bytes += stat.size;
        if (files.length >= MAX_FILES || bytes > MAX_BYTES)
          fail('PACKAGE_LIMIT', 'Package bounds exceeded');
        files.push({
          path: safeMember(path.relative(root, file).split(path.sep).join('/')),
          bytes: stat.size,
          sha256: hash(fs.readFileSync(file)),
        });
      }
    }
  }
  walk(root);
  return files;
}
function oneObject(result, expected = 0) {
  if (
    result.status !== expected ||
    result.signal ||
    result.stderr.trim() ||
    result.stdout.trim().split('\n').length !== 1
  ) {
    fail('COMPILED_CLI_FAILED', 'CLI output or exit mismatch');
  }
  const value = JSON.parse(result.stdout);
  if (!value || typeof value !== 'object' || Array.isArray(value))
    fail('COMPILED_CLI_FAILED', 'Invalid CLI object');
  return value;
}
function checkRegistryTuple(name, version, result) {
  let value;
  try {
    value = result.status === 0 ? JSON.parse(result.stdout) : null;
  } catch {
    value = null;
  }
  if (
    !value ||
    value.name !== name ||
    value.version !== version ||
    !/^sha(?:512|1)-[A-Za-z0-9+/=]+$/.test(value.dist?.integrity || '')
  ) {
    fail(
      'REGISTRY_DEPENDENCY_UNAVAILABLE',
      `registry dependency tuple unavailable: ${name}@${version}`
    );
  }
  return { name, version, integrity: value.dist.integrity };
}
function checkIdentity(expected, value, stage) {
  if (
    typeof expected.version !== 'string' ||
    !value ||
    value.name !== expected.name ||
    value.version !== expected.version
  )
    fail('PACKAGE_IDENTITY_MISMATCH', `${stage} name/version mismatch`);
  return { name: value.name, version: value.version };
}
function checkPack(result, stagedFiles) {
  const packs = JSON.parse(result.stdout);
  if (result.status !== 0 || !Array.isArray(packs) || packs.length !== 1)
    fail('PACK_FAILED', 'Expected one packed package');
  const pack = packs[0];
  if (
    !pack.filename?.endsWith('.tgz') ||
    safeMember(pack.filename).includes('/') ||
    !Array.isArray(pack.files) ||
    pack.files.length > MAX_FILES
  )
    fail('PACK_FAILED', 'Invalid pack inventory');
  const names = new Set();
  let bytes = 0;
  const available = new Set(stagedFiles.map((item) => item.path));
  for (const file of pack.files) {
    const name = safeMember(file.path);
    if (
      names.has(name) ||
      !available.has(name) ||
      !Number.isSafeInteger(file.size) ||
      file.size < 0
    )
      fail('PACK_FAILED', 'Unexpected package members');
    if (/\.(test|spec)\.[cm]?js$/.test(name) || /\.(py|sqlite|tgz)$/.test(name))
      fail('PACK_FAILED', 'Forbidden package member');
    names.add(name);
    bytes += file.size;
  }
  if (bytes > MAX_BYTES) fail('PACKAGE_LIMIT', 'Package byte bound exceeded');
  for (const required of [
    'package.json',
    'bin/ttr.cjs',
    'dist/index.js',
    'dist/index.d.ts',
    'dist/cli/index.js',
    'dist/cli/operational-cli.js',
    'dist/cli/operational-search.js',
    'dist/operational-graph/reader.js',
    'dist/operational-search/python-adapter-code.js',
  ]) {
    if (!names.has(required))
      fail('PACK_FAILED', `compiled package member missing: ${required}`);
  }
  return pack;
}
function privateEnvironment(home) {
  return {
    PATH: process.env.PATH,
    HOME: home,
    TMPDIR: home,
    LANG: 'C.UTF-8',
    npm_config_userconfig: path.join(home, 'empty-npmrc'),
    npm_config_registry: 'https://registry.npmjs.org',
    npm_config_cache: path.join(home, 'npm-cache'),
    npm_config_update_notifier: 'false',
    TUTURUUU_CONFIG: path.join(home, 'no-auth.json'),
    TUTURUUU_API_URL: 'http://127.0.0.1:1',
    TUTURUUU_DISABLE_UPDATE_CHECK: '1',
  };
}
function resourceProof(root) {
  const base = path.join(root, 'packages/sdk/src/operational-search');
  const adapter = fs.readFileSync(path.join(base, 'python-adapter.py'));
  const runtime = fs.readFileSync(
    path.join(base, 'python-runtime-manifest.json')
  );
  const installation = fs.readFileSync(
    path.join(base, 'python-installation-manifest.json')
  );
  return {
    adapter: hash(adapter),
    runtime: hash(runtime),
    installation: hash(installation),
    runtimeObject: hash(JSON.stringify(JSON.parse(runtime))),
    installationObject: hash(JSON.stringify(JSON.parse(installation))),
  };
}
const inspectInstalled = `
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const fixture=process.argv[1], pkg=path.join(fixture,'node_modules/tuturuuu'), manifest=require(path.join(pkg,'package.json'));
const hash=x=>createHash('sha256').update(x).digest('hex');
const exports=[];
for(const [key,conditions] of Object.entries(manifest.exports)) {
 const resolved=require.resolve('tuturuuu'+(key==='.'?'':key.slice(1)),{paths:[fixture]});
 if(!fs.realpathSync(resolved).startsWith(pkg+path.sep)) throw new Error('export escaped installed package');
 for(const target of Object.values(conditions)) if(!target.startsWith('./dist/')||!fs.statSync(path.join(pkg,target)).isFile()) throw new Error('shipped export target missing');
 exports.push(resolved);
}
const resources=require(path.join(pkg,'dist/operational-search/python-adapter-code.js'));
const db=path.join(fixture,'synthetic-backlog.sqlite');
const {initStore,OperationalStore}=require(path.join(pkg,'dist/cli/operational-store.js'));
initStore(db,'backlog');const store=new OperationalStore(db,'backlog',true);
try { store.intake([{id:'synthetic-rsvp',title:'Calendar RSVP lịch họp',kind:'feature',source:'synthetic:package-qualification',acceptance:'Preserve RSVP',requiredEvidence:['focused']}],{expectedRevision:0,operationId:require('node:crypto').randomUUID()}); } finally {store.close();}
console.log(JSON.stringify({exports:exports.map(x=>path.relative(pkg,x)),adapter:hash(resources.PYTHON_ADAPTER_CODE),runtime:resources.PYTHON_RUNTIME_MANIFEST_HASH,installation:resources.PYTHON_INSTALLATION_MANIFEST_HASH,runtimeObject:hash(JSON.stringify(resources.PYTHON_RUNTIME_MANIFEST)),installationObject:hash(JSON.stringify(resources.PYTHON_INSTALLATION_MANIFEST)),db}));`;
async function qualify({
  root,
  output,
  sourceSha,
  phase = 'public',
  run = runProcess,
}) {
  if (!['source', 'public'].includes(phase))
    fail('INVALID_PHASE', 'Unknown qualification phase');
  if (!/^[a-f0-9]{40}$/.test(sourceSha || ''))
    fail('INVALID_SOURCE_SHA', 'an exact source SHA is required');
  root = fs.realpathSync(root);
  if (typeof output !== 'string' || !output)
    fail('UNSAFE_OUTPUT', 'Temporary output required');
  output = path.resolve(output);
  output = path.join(
    fs.realpathSync(path.dirname(output)),
    path.basename(output)
  );
  const tempRoot = fs.realpathSync(os.tmpdir());
  const outputRoots = [tempRoot];
  if (process.env.RUNNER_TEMP)
    outputRoots.push(fs.realpathSync(process.env.RUNNER_TEMP));
  if (
    !outputRoots.some((dir) => output.startsWith(`${dir}${path.sep}`)) ||
    fs.existsSync(output) ||
    !outputRoots.some((dir) =>
      fs.realpathSync(path.dirname(output)).startsWith(dir)
    )
  )
    fail('UNSAFE_OUTPUT', 'Output must be new and temporary');
  const beforePath = path.join(root, 'packages/sdk/package.json');
  const before = fs.readFileSync(beforePath);
  if (JSON.parse(before).tuturuuuPublish)
    fail('UNSUPPORTED_PACKAGING', 'Vendored extraction unsupported');
  fs.mkdirSync(output, { mode: 0o700 });
  const scratch = fs.mkdtempSync(
    path.join(tempRoot, 'sdk-package-qualification-')
  );
  fs.chmodSync(scratch, 0o700);
  const receipt = {
    version: 2,
    phase,
    sourceValidated: false,
    sourceSha,
    qualified: false,
    modelActivity: false,
    lifecycleScriptsExecuted: false,
    registryTuples: [],
    controls: [],
  };
  let error;
  const deadline = Date.now() + 8 * 60 * 1000;
  try {
    const env = privateEnvironment(scratch);
    fs.writeFileSync(env.npm_config_userconfig, '', { mode: 0o600 });
    async function command(executable, args, cwd = scratch, timeoutMs = 30000) {
      const remaining = deadline - Date.now();
      if (remaining <= 0)
        fail('QUALIFICATION_DEADLINE', 'Wall budget exhausted');
      return run(executable, args, {
        cwd,
        env,
        timeoutMs: Math.min(timeoutMs, remaining),
      });
    }
    const head = await command('git', ['rev-parse', 'HEAD'], root);
    if (head.status !== 0 || head.stdout.trim() !== sourceSha)
      fail('SOURCE_SHA_MISMATCH', 'Checkout SHA mismatch');
    const node = await command(process.execPath, ['--version']);
    const bun = await command('bun', ['--version']);
    if (node.stdout.trim() !== 'v24.21.0' || bun.stdout.trim() !== '1.4.4')
      fail('RUNTIME_VERSION_MISMATCH', 'Require Node24.21/Bun1.4.4');
    receipt.runtimeVersions = {
      node: node.stdout.trim(),
      bun: bun.stdout.trim(),
    };
    const staging = path.join(scratch, 'staging');
    const stageSdk = path.join(staging, 'packages/sdk');
    fs.mkdirSync(stageSdk, { recursive: true, mode: 0o700 });
    fs.writeFileSync(
      path.join(staging, 'package.json'),
      JSON.stringify({ workspaces: ['packages/*'] })
    );
    const versions = getWorkspaceVersions(root);
    for (const { path: manifestPath } of versions.values()) {
      const relative = safeMember(
        path.relative(root, manifestPath).split(path.sep).join('/')
      );
      if (!relative.startsWith('packages/')) continue;
      const target = path.join(staging, relative);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(manifestPath, target);
    }
    stageSdkRuntime(root, stageSdk, inventory);
    for (const name of ['README.md', 'LICENSE']) {
      const source = path.join(root, 'packages/sdk', name);
      if (fs.existsSync(source))
        fs.copyFileSync(source, path.join(stageSdk, name));
    }
    const { rewrites } = preparePackageManifest({
      packageDir: 'packages/sdk',
      repoRoot: staging,
    });
    const identity = JSON.parse(before);
    receipt.identities = {
      source: checkIdentity(
        { name: 'tuturuuu', version: identity.version },
        identity,
        'source'
      ),
      staging: checkIdentity(
        identity,
        json(path.join(stageSdk, 'package.json')),
        'staging'
      ),
    };
    receipt.manifestBeforeSha256 = hash(before);
    receipt.manifestAfterSha256 = hash(
      fs.readFileSync(path.join(stageSdk, 'package.json'))
    );
    receipt.dependencyRewrites = rewrites;
    if (rewrites.length > 50)
      fail('PACKAGE_LIMIT', 'Too many dependency rewrites');
    for (const name of [
      ...new Set(
        (phase === 'public' ? registryRewrites(rewrites) : []).map(
          (entry) => entry.name
        )
      ),
    ].sort()) {
      const version = versions.get(name)?.version;
      if (!/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(version || ''))
        fail('REGISTRY_DEPENDENCY_UNAVAILABLE', 'Invalid registry version');
      receipt.registryTuples.push(
        checkRegistryTuple(
          name,
          version,
          await command(
            'npm',
            [
              'view',
              `${name}@${version}`,
              '--json',
              '--registry=https://registry.npmjs.org',
            ],
            scratch,
            15000
          )
        )
      );
    }
    const stagedFiles = inventory(stageSdk);
    const packed = await command(
      'npm',
      ['pack', '--ignore-scripts', '--json', '--pack-destination', output],
      stageSdk,
      60000
    );
    const pack = checkPack(packed, stagedFiles);
    receipt.identities.pack = checkIdentity(identity, pack, 'pack');
    const archive = path.join(output, pack.filename);
    const stat = fs.lstatSync(archive);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_BYTES)
      fail('PACK_FAILED', 'Invalid packed archive');
    const tarList = await command('tar', ['-tzf', archive]);
    if (tarList.status !== 0)
      fail('PACK_FAILED', 'Unreadable archive inventory');
    const archiveNames = tarList.stdout
      .trim()
      .split('\n')
      .map((entry) => safeMember(entry.replace(/\/$/, '')));
    if (
      archiveNames.length > MAX_FILES ||
      archiveNames.some(
        (entry) => entry !== 'package' && !entry.startsWith('package/')
      )
    )
      fail('UNSAFE_PACKAGE_PATH', 'Archive member escapes root');
    const tarTypes = await command('tar', ['-tvzf', archive]);
    if (
      tarTypes.status !== 0 ||
      tarTypes.stdout
        .trim()
        .split('\n')
        .some((entry) => !['-', 'd'].includes(entry[0]))
    )
      fail('UNSAFE_PACKAGE_PATH', 'Nonregular archive member');
    const permitted = new Set(pack.files.map((file) => `package/${file.path}`));
    for (const entry of [...permitted]) {
      let parent = path.posix.dirname(entry);
      while (parent !== '.') {
        permitted.add(parent);
        parent = path.posix.dirname(parent);
      }
    }
    if (archiveNames.some((entry) => !permitted.has(entry)))
      fail('PACK_FAILED', 'Archive inventory mismatch');
    const extracted = await command('tar', [
      '-xOzf',
      archive,
      'package/package.json',
    ]);
    if (extracted.status !== 0)
      fail('PACK_FAILED', 'Archive manifest unreadable');
    receipt.identities.archive = checkIdentity(
      identity,
      JSON.parse(extracted.stdout),
      'archive'
    );
    const integrity = `sha512-${createHash('sha512').update(fs.readFileSync(archive)).digest('base64')}`;
    if (pack.integrity !== integrity)
      fail('PACK_FAILED', 'Archive integrity mismatch');
    receipt.package = {
      name: pack.name,
      version: pack.version,
      archive: pack.filename,
      sha256: hash(fs.readFileSync(archive)),
      files: pack.files,
      sourceFiles: stagedFiles,
    };
    if (phase === 'source') {
      receipt.sourceValidated = true;
      return { receipt, error };
    }
    const consumer = path.join(scratch, 'consumer');
    fs.mkdirSync(consumer, { mode: 0o700 });
    fs.writeFileSync(
      path.join(consumer, 'package.json'),
      JSON.stringify({
        name: 'sdk-qualification-fixture',
        private: true,
        version: '1.0.0',
      })
    );
    const install = await command(
      'npm',
      [
        'install',
        '--ignore-scripts',
        '--omit=dev',
        '--no-audit',
        '--no-fund',
        '--package-lock=true',
        archive,
      ],
      consumer,
      180000
    );
    if (install.status !== 0) {
      receipt.installFailure = installFailureDiagnostic(install);
      fail('PACKAGE_INSTALL_FAILED', 'Isolated npm install failed');
    }
    const installed = path.join(consumer, 'node_modules/tuturuuu');
    if (
      fs.lstatSync(installed).isSymbolicLink() ||
      fs.realpathSync(installed) !== installed
    )
      fail('WORKSPACE_INSTALL_DENIED', 'Workspace install denied');
    const installedFiles = inventory(installed);
    receipt.identities.installed = checkIdentity(
      identity,
      json(path.join(installed, 'package.json')),
      'installed'
    );
    const stagedByPath = new Map(stagedFiles.map((file) => [file.path, file]));
    const installedByPath = new Map(
      installedFiles.map((file) => [file.path, file])
    );
    for (const member of pack.files) {
      const original = stagedByPath.get(member.path);
      const received = installedByPath.get(member.path);
      if (!received || received.sha256 !== original.sha256)
        fail('INSTALLED_BYTES_CHANGED', 'Installed byte mismatch');
    }
    const lock = json(path.join(consumer, 'package-lock.json'));
    const dependencies = requireInstalledDependencies(
      json(path.join(stageSdk, 'package.json')),
      consumer,
      lock
    );
    const sdkLock = lock.packages?.['node_modules/tuturuuu'];
    receipt.identities.lock = checkIdentity(
      identity,
      { name: sdkLock?.name ?? 'tuturuuu', version: sdkLock?.version },
      'lock'
    );
    if (
      sdkLock.link ||
      sdkLock.integrity !== integrity ||
      !sdkLock.resolved?.startsWith('file:') ||
      path.resolve(consumer, sdkLock.resolved.slice(5)) !== archive
    )
      fail('PACKAGE_IDENTITY_MISMATCH', 'Lock archive resolution mismatch');
    for (const tuple of receipt.registryTuples) {
      const entry = dependencies.get(tuple.name);
      if (
        entry?.version !== tuple.version ||
        entry.integrity !== tuple.integrity ||
        entry.link
      )
        fail(
          'REGISTRY_TUPLE_MISMATCH',
          `installed registry tuple differs: ${tuple.name}@${tuple.version}`
        );
    }
    receipt.installLockSha256 = hash(
      fs.readFileSync(path.join(consumer, 'package-lock.json'))
    );
    const proof = oneObject(
      await command(
        process.execPath,
        ['--no-warnings', '-e', inspectInstalled, consumer],
        consumer
      )
    );
    const expected = resourceProof(root);
    for (const key of Object.keys(expected))
      assert.equal(
        proof[key],
        expected[key],
        `shipped embedded resource ${key}`
      );
    receipt.resources = expected;
    receipt.exports = proof.exports;
    const entry = path.join(installed, 'dist/cli/index.js');
    const runtimes = [
      [process.execPath, ['--no-warnings', entry], 'node-direct'],
    ];
    for (const alias of ['ttr', 'tuturuuu', 'tutur3u']) {
      const bin = path.join(consumer, 'node_modules/.bin', alias);
      if (fs.realpathSync(bin) !== path.join(installed, 'bin/ttr.cjs'))
        fail('BIN_RESOLUTION_FAILED', 'Installed bin target mismatch');
      runtimes.push([bin, [], alias]);
    }
    async function cli(executable, prefix, args, expected = 0) {
      return oneObject(
        await command(
          executable,
          [...prefix, 'backlog', 'search', ...args, '--json'],
          consumer
        ),
        expected
      );
    }
    for (const [executable, prefix, label] of runtimes) {
      for (const args of [
        ['help', '--lang', 'vi'],
        ['model-status'],
        ['query'],
      ]) {
        const action = args[0];
        const value = await cli(
          executable,
          prefix,
          args,
          action === 'query' ? 2 : 0
        );
        if (action === 'help') assert.equal(value.group, 'backlog search');
        if (action === 'model-status') {
          for (const key of [
            'downloadPerformed',
            'runtimeExecuted',
            'runtimeProbePerformed',
            'modelLoaded',
          ])
            assert.equal(value[key], false);
        }
        if (action === 'query') assert.equal(value.error.code, 'INVALID_INPUT');
        receipt.controls.push(`${label}:${action}`);
      }
    }
    const dbBefore = hash(fs.readFileSync(proof.db));
    for (const [executable, prefix, label] of [runtimes[0], runtimes[1]]) {
      const cache = path.join(consumer, `${label}-lexical.sqlite`);
      const index = await cli(executable, prefix, [
        'index',
        '--db',
        proof.db,
        '--cache',
        cache,
      ]);
      assert.equal(index.embedded, 0);
      assert.equal(index.modelLoaded, false);
      const query = await cli(executable, prefix, [
        'query',
        'RSVP lịch',
        '--db',
        proof.db,
        '--cache',
        cache,
        '--mode',
        'lexical',
      ]);
      assert.equal(query.results[0]?.id, 'synthetic-rsvp');
      assert.equal(query.results[0]?.actionAuthorized, false);
      receipt.controls.push(`${label}:synthetic-lexical-index-query`);
    }
    assert.equal(
      hash(fs.readFileSync(proof.db)),
      dbBefore,
      'synthetic source database preserved'
    );
    assert.equal(fs.existsSync(env.TUTURUUU_CONFIG), false);
    receipt.qualified = true;
  } catch (caught) {
    error = caught;
    receipt.blocker = {
      code: caught.code || 'QUALIFICATION_FAILED',
      message: String(caught.message).slice(0, 500),
    };
  } finally {
    const undrainedGroup = error?.undrainedGroup;
    if (!fs.readFileSync(beforePath).equals(before)) {
      receipt.qualified = false;
      receipt.sourceValidated = false;
      receipt.blocker = {
        code: 'SOURCE_MANIFEST_CHANGED',
        message: 'Source manifest changed',
      };
      error = new Error('source manifest changed');
    }
    receipt.processGroupsDrained = !undrainedGroup;
    if (receipt.processGroupsDrained)
      fs.rmSync(scratch, { recursive: true, force: true });
    else
      receipt.retainedFixture = {
        path: scratch,
        ownedProcessGroup: undrainedGroup,
      };
    receipt.temporaryFixtureDrained = !fs.existsSync(scratch);
    if (!receipt.processGroupsDrained || !receipt.temporaryFixtureDrained) {
      receipt.qualified = false;
      receipt.sourceValidated = false;
    }
    fs.writeFileSync(
      path.join(output, 'receipt.json'),
      `${JSON.stringify(receipt, null, 2)}\n`,
      { mode: 0o600 }
    );
  }
  return { receipt, error };
}
if (require.main === module) {
  qualify({
    root: process.cwd(),
    // biome-ignore lint/suspicious/noUndeclaredEnvVars: standalone workflow input; this command is not Turbo-cached.
    output: process.env.QUALIFICATION_OUTPUT,
    // biome-ignore lint/suspicious/noUndeclaredEnvVars: standalone workflow input; this command is not Turbo-cached.
    sourceSha: process.env.SOURCE_SHA,
    phase: require('./sdk-qualification-phase').workflowPhase(process.env),
  })
    .then(({ receipt }) => {
      console.log(
        JSON.stringify({
          phase: receipt.phase,
          sourceValidated: receipt.sourceValidated,
          qualified: receipt.qualified,
          sourceSha: receipt.sourceSha,
          blocker: receipt.blocker || null,
        })
      );
      process.exitCode = (
        receipt.phase === 'source'
          ? receipt.sourceValidated
          : receipt.qualified
      )
        ? 0
        : 1;
    })
    .catch((error) => {
      console.error(error.code || 'QUALIFICATION_FAILED');
      process.exitCode = 1;
    });
}
module.exports = {
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
};
