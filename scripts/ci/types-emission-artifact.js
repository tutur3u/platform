#!/usr/bin/env node

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const { createRequire } = require('node:module');
const path = require('node:path');

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const canonical = (v) => JSON.stringify(sort(v));
function sort(v) {
  if (Array.isArray(v)) return v.map(sort);
  if (v && typeof v === 'object')
    return Object.fromEntries(
      Object.keys(v)
        .sort()
        .map((k) => [k, sort(v[k])])
    );
  return v;
}
const factKeys = [
  'sourceSha',
  'controlSha',
  'lockSha256',
  'configSha256',
  'sourceTreeSha256',
  'nodeSha256',
  'bunSha256',
  'compilerSha256',
  'nodeVersion',
  'bunVersion',
  'compilerVersion',
  'expectedPaths',
  'exportTargets',
  'configuredBuildInfo',
  'files',
  'buildExit',
  'membershipKnown',
  'runId',
  'job',
  'attempt',
];
const identityKeys = factKeys.filter(
  (k) => !['files', 'buildExit', 'membershipKnown'].includes(k)
);
const sameKeys = (v, keys) =>
  v &&
  typeof v === 'object' &&
  !Array.isArray(v) &&
  Object.keys(v).sort().join() === [...keys].sort().join();
function owned(p) {
  return (
    typeof p === 'string' &&
    !p.includes('\\') &&
    !p.includes('\0') &&
    !path.posix.isAbsolute(p) &&
    !p.split('/').includes('..') &&
    (p.startsWith('packages/types/dist/') ||
      p === 'packages/types/tsconfig.build.tsbuildinfo')
  );
}
function checkFacts(f) {
  assert.equal(f.buildExit, 0);
  assert.equal(f.membershipKnown, true);
  for (const k of ['sourceSha', 'controlSha'])
    assert.match(f[k], /^[a-f0-9]{40}$/u);
  for (const k of [
    'lockSha256',
    'configSha256',
    'sourceTreeSha256',
    'nodeSha256',
    'bunSha256',
    'compilerSha256',
  ])
    assert.match(f[k], /^[a-f0-9]{64}$/u);
  assert.match(f.nodeVersion, /^v24\.\d+\.\d+$/u);
  assert.equal(f.bunVersion, '1.4.1');
  assert.match(f.compilerVersion, /^\d+\.\d+\.\d+(?:[-.a-z0-9]+)?$/u);
  assert.match(f.runId, /^[1-9][0-9]*$/u);
  assert.match(f.job, /^[a-zA-Z0-9_-]{1,64}$/u);
  assert.ok(Number.isSafeInteger(f.attempt) && f.attempt > 0);
  assert.equal(
    f.configuredBuildInfo,
    'packages/types/tsconfig.build.tsbuildinfo'
  );
  assert.ok(
    Array.isArray(f.expectedPaths) &&
      f.expectedPaths.length > 0 &&
      f.expectedPaths.length <= 5000
  );
  assert.equal(new Set(f.expectedPaths).size, f.expectedPaths.length);
  assert.ok(f.expectedPaths.every(owned));
  assert.ok(f.expectedPaths.includes(f.configuredBuildInfo));
  assert.ok(
    Array.isArray(f.files) && f.files.length === f.expectedPaths.length
  );
  assert.equal(new Set(f.files.map((x) => x.path)).size, f.files.length);
  assert.deepEqual(
    f.files.map((x) => x.path).sort(),
    [...f.expectedPaths].sort()
  );
  let bytes = 0;
  for (const file of f.files) {
    assert.ok(
      sameKeys(file, ['path', 'sha256', 'bytes', 'type']) && owned(file.path)
    );
    assert.equal(file.type, 'file');
    assert.match(file.sha256, /^[a-f0-9]{64}$/u);
    assert.ok(Number.isSafeInteger(file.bytes) && file.bytes >= 0);
    bytes += file.bytes;
  }
  assert.ok(bytes <= 64 * 1024 * 1024);
  assert.ok(Array.isArray(f.exportTargets) && f.exportTargets.length > 0);
  for (const target of f.exportTargets) {
    assert.ok(
      typeof target === 'string' &&
        target.startsWith('./dist/') &&
        !target.includes('..') &&
        !target.includes('\\')
    );
    const pattern = target
      .slice(2)
      .split('*')
      .map((x) => x.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'))
      .join('.*');
    const re = new RegExp(`^packages/types/${pattern}$`, 'u');
    assert.ok(f.files.some((x) => re.test(x.path)));
  }
}
const sealingRecords = new WeakMap();
const sealingPredicates = Object.freeze({
  invocation: 'CLI_ARGUMENTS',
  environment: 'CI_LINUX_REQUIRED',
  'checkout-identities': 'EXACT_CHECKOUTS',
  'config-inputs': 'CONFIGURED_EMISSION',
  'output-membership': 'EXACT_OUTPUT_MEMBERSHIP',
  'runtime-identities': 'RUNTIME_IDENTITIES',
  'input-cleanliness': 'SOURCE_INPUTS_CLEAN',
  'facts-validation': 'MANIFEST_FACTS_VALID',
  'destination-create': 'EXCLUSIVE_DESTINATION',
  'copy-readback': 'COPIED_BYTES_MATCH',
  'provenance-write-readback': 'PROVENANCE_MATCH',
  'manifest-write-readback': 'MANIFEST_BYTES_MATCH',
  verification: 'RECEIVER_CONTRACT_VALID',
});
function sealingErrorClass(error) {
  try {
    for (const Type of [
      assert.AssertionError,
      TypeError,
      RangeError,
      SyntaxError,
      Error,
    ]) {
      if (error instanceof Type) return Type.name;
    }
  } catch {}
  return 'UNKNOWN';
}
function sealingRecord(stage, facts, error) {
  const known = Object.hasOwn(sealingPredicates, stage);
  const count = (value) =>
    Number.isSafeInteger(value) && value >= 0 && value <= 10000000
      ? value
      : null;
  const summary = {
    outputShape: ['array', 'object', 'file-set'].includes(facts.outputShape)
      ? facts.outputShape
      : 'UNKNOWN',
    expectedCount: count(facts.expectedCount),
    observedCount: count(facts.observedCount),
  };
  return Object.freeze({
    version: 1,
    status: 'HOLD',
    stage: known ? stage : 'UNKNOWN',
    predicate: known ? sealingPredicates[stage] : 'UNKNOWN',
    errorClass: sealingErrorClass(error),
    ...summary,
    safeFactsSHA256: digest(canonical(summary)),
  });
}
function sealingDiagnostic(error) {
  return sealingRecords.get(error) ?? sealingRecord('UNKNOWN', {}, error);
}
function diagnoseSealing(work) {
  let stage = 'UNKNOWN',
    facts = {};
  try {
    return work((next, summary = {}) => {
      stage = next;
      facts = summary;
    });
  } catch (cause) {
    if (sealingRecords.has(cause)) throw cause;
    const error = new Error('Types emission artifact HOLD');
    sealingRecords.set(error, sealingRecord(stage, facts, cause));
    throw error;
  }
}
function hold(fn) {
  try {
    return fn();
  } catch {
    throw new Error('Types emission artifact HOLD');
  }
}
function createManifest(facts) {
  return hold(() => {
    assert.ok(sameKeys(facts, factKeys));
    checkFacts(facts);
    const data = { version: 1, ...facts };
    return { ...data, manifestSha256: digest(canonical(data)) };
  });
}
function validateManifest(manifest, contract) {
  return hold(() => {
    assert.ok(sameKeys(manifest, [...factKeys, 'version', 'manifestSha256']));
    assert.ok(sameKeys(contract, [...identityKeys, 'reservationReady']));
    assert.equal(contract.reservationReady, true);
    assert.equal(manifest.version, 1);
    const { version: _version, manifestSha256, ...facts } = manifest;
    checkFacts(facts);
    assert.equal(manifestSha256, digest(canonical({ version: 1, ...facts })));
    for (const key of identityKeys) assert.deepEqual(facts[key], contract[key]);
    return true;
  });
}
function readJSON(p) {
  const b = fs.readFileSync(p);
  assert.ok(b.length <= 1024 * 1024);
  return JSON.parse(b);
}
function relative(root, p) {
  const rel = path.relative(root, p).split(path.sep).join('/');
  assert.ok(rel && !rel.startsWith('../') && !path.isAbsolute(rel));
  return rel;
}
function file(root, rel) {
  assert.ok(owned(rel));
  const absolute = path.join(root, rel);
  const st = fs.lstatSync(absolute);
  assert.ok(st.isFile() && !st.isSymbolicLink());
  assert.equal(fs.realpathSync(absolute), path.resolve(absolute));
  return {
    path: rel,
    sha256: digest(fs.readFileSync(absolute)),
    bytes: st.size,
    type: 'file',
  };
}
function walk(root, dir) {
  const files = [];
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    assert.ok(!item.isSymbolicLink());
    const p = path.join(dir, item.name);
    if (item.isDirectory()) files.push(...walk(root, p));
    else {
      assert.ok(item.isFile());
      files.push(relative(root, p));
    }
    assert.ok(files.length <= 5000);
  }
  return files;
}
function configInputs(root, ts, config) {
  const reads = new Map();
  const parsed = ts.getParsedCommandLineOfConfigFile(
    config,
    {},
    {
      ...ts.sys,
      readFile(p) {
        const text = ts.sys.readFile(p);
        if (text !== undefined)
          reads.set(relative(root, fs.realpathSync(p)), digest(text));
        return text;
      },
      onUnRecoverableConfigFileDiagnostic() {
        throw new Error('configuration');
      },
    }
  );
  assert.ok(
    parsed && parsed.errors.length === 0 && parsed.fileNames.length > 0
  );
  const names = [...new Set(parsed.fileNames)].sort();
  assert.ok(
    names.every((p) => relative(root, p).startsWith('packages/types/src/'))
  );
  const expected = new Set(
    names.flatMap((p) =>
      ts.getOutputFileNames(parsed, p, !ts.sys.useCaseSensitiveFileNames)
    )
  );
  assert.equal(typeof ts.getTsBuildInfoEmitOutputFilePath, 'function');
  const info = ts.getTsBuildInfoEmitOutputFilePath(parsed.options);
  assert.ok(info);
  expected.add(info);
  return {
    configFiles: [...reads]
      .sort()
      .map(([name, sha256]) => ({ path: name, sha256 })),
    sourceFiles: names.map((p) => ({
      path: relative(root, p),
      sha256: digest(fs.readFileSync(p)),
    })),
    expectedPaths: [...expected].map((p) => relative(root, p)).sort(),
    configuredBuildInfo: relative(root, info),
    configSha256: digest(canonical([...reads].sort())),
    sourceTreeSha256: digest(
      canonical(
        names.map((p) => [relative(root, p), digest(fs.readFileSync(p))])
      )
    ),
  };
}
function targets(exports) {
  return typeof exports === 'string'
    ? [exports]
    : Object.values(exports).flatMap(targets);
}
function createArtifact(args) {
  return diagnoseSealing((mark) => {
    mark('environment');
    assert.equal(process.env.GITHUB_ACTIONS, 'true');
    assert.equal(process.platform, 'linux');
    const root = fs.realpathSync(args.source),
      controlRoot = path.resolve(__dirname, '../..');
    assert.notEqual(root, controlRoot);
    const git = (dir) =>
      execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], {
        encoding: 'utf8',
        timeout: 10000,
      }).trim();
    mark('checkout-identities');
    assert.equal(git(root), args['source-sha']);
    assert.equal(git(controlRoot), args['control-sha']);
    mark('config-inputs');
    const req = createRequire(path.join(root, 'packages/types/package.json'));
    const ts = req('typescript');
    const config = configInputs(
      root,
      ts,
      path.join(root, 'packages/types/tsconfig.build.json')
    );
    mark('output-membership');
    assert.ok(config.expectedPaths.every(owned));
    const actual = [
      ...walk(root, path.join(root, 'packages/types/dist')),
      config.configuredBuildInfo,
    ].sort();
    mark('output-membership', {
      outputShape: 'file-set',
      expectedCount: config.expectedPaths.length,
      observedCount: actual.length,
    });
    assert.deepEqual(actual, config.expectedPaths);
    mark('runtime-identities');
    const bun = fs.realpathSync(process.env.BUN_BINARY);
    const bunVersion = execFileSync(bun, ['--version'], {
      encoding: 'utf8',
      timeout: 10000,
      maxBuffer: 1024,
    }).trim();
    const packageBytes = fs.readFileSync(
      path.join(root, 'packages/types/package.json')
    );
    const packageJSON = JSON.parse(packageBytes);
    const {
      configFiles,
      sourceFiles,
      configSha256: _oldConfigDigest,
      ...emission
    } = config;
    const provenance = {
      version: 1,
      packageSha256: digest(packageBytes),
      exportMapSha256: digest(canonical(packageJSON.exports)),
      configFiles,
      sourceFiles,
    };
    mark('input-cleanliness');
    const dirtyInputs = execFileSync(
      'git',
      [
        '-C',
        root,
        'status',
        '--porcelain=v1',
        '--',
        'packages/types/src',
        'packages/types/package.json',
        'packages/types/tsconfig.json',
        'packages/types/tsconfig.build.json',
        'packages/typescript-config',
        'bun.lock',
      ],
      { encoding: 'utf8', timeout: 10000 }
    );
    assert.equal(dirtyInputs, '');
    const facts = {
      sourceSha: args['source-sha'],
      controlSha: args['control-sha'],
      lockSha256: digest(fs.readFileSync(path.join(root, 'bun.lock'))),
      ...emission,
      configSha256: digest(canonical(provenance)),
      nodeSha256: digest(fs.readFileSync(process.execPath)),
      bunSha256: digest(fs.readFileSync(bun)),
      compilerSha256: digest(fs.readFileSync(req.resolve('typescript'))),
      nodeVersion: process.version,
      bunVersion,
      compilerVersion: ts.version,
      exportTargets: targets(packageJSON.exports),
      files: actual.map((p) => file(root, p)),
      buildExit: 0,
      membershipKnown: true,
      runId: process.env.GITHUB_RUN_ID,
      job: process.env.GITHUB_JOB,
      attempt: Number(process.env.GITHUB_RUN_ATTEMPT),
    };
    mark('facts-validation', {
      outputShape: 'file-set',
      observedCount: actual.length,
      expectedCount: config.expectedPaths.length,
    });
    const manifest = createManifest(facts);
    mark('destination-create');
    const destination = path.resolve(args.artifact);
    fs.mkdirSync(destination, { mode: 0o700 });
    mark('copy-readback', {
      outputShape: 'file-set',
      observedCount: manifest.files.length,
    });
    for (const entry of manifest.files) {
      const output = path.join(destination, entry.path);
      fs.mkdirSync(path.dirname(output), { recursive: true, mode: 0o700 });
      fs.copyFileSync(
        path.join(root, entry.path),
        output,
        fs.constants.COPYFILE_EXCL
      );
      assert.equal(digest(fs.readFileSync(output)), entry.sha256);
    }
    mark('provenance-write-readback');
    const provenanceBytes = `${JSON.stringify(provenance, null, 2)}\n`;
    assert.ok(Buffer.byteLength(provenanceBytes) <= 1024 * 1024);
    fs.writeFileSync(
      path.join(destination, 'provenance.json'),
      provenanceBytes,
      {
        flag: 'wx',
        mode: 0o600,
      }
    );
    assert.equal(
      digest(canonical(readJSON(path.join(destination, 'provenance.json')))),
      manifest.configSha256
    );
    mark('manifest-write-readback');
    const bytes = `${JSON.stringify(manifest, null, 2)}\n`;
    fs.writeFileSync(path.join(destination, 'manifest.json'), bytes, {
      flag: 'wx',
      mode: 0o600,
    });
    assert.equal(
      fs.readFileSync(path.join(destination, 'manifest.json'), 'utf8'),
      bytes
    );
    console.log(
      JSON.stringify({
        producerManifestWritten: true,
        files: manifest.files.length,
        sourceSha: manifest.sourceSha,
        controlSha: manifest.controlSha,
      })
    );
  });
}

function verifyArtifact(args) {
  const root = fs.realpathSync(args.artifact),
    manifest = readJSON(path.join(root, 'manifest.json'));
  validateManifest(manifest, readJSON(args.contract));
  const provenance = readJSON(path.join(root, 'provenance.json'));
  assert.ok(
    sameKeys(provenance, [
      'version',
      'packageSha256',
      'exportMapSha256',
      'configFiles',
      'sourceFiles',
    ]) && provenance.version === 1
  );
  assert.equal(digest(canonical(provenance)), manifest.configSha256);
  assert.equal(
    digest(canonical(provenance.sourceFiles.map((f) => [f.path, f.sha256]))),
    manifest.sourceTreeSha256
  );
  const actual = walk(root, root).sort();
  assert.deepEqual(
    actual,
    [
      'manifest.json',
      'provenance.json',
      ...manifest.files.map((x) => x.path),
    ].sort()
  );
  for (const expected of manifest.files)
    assert.deepEqual(file(root, expected.path), expected);
  console.log(
    JSON.stringify({ artifactValidated: true, files: manifest.files.length })
  );
}
function main(argv, mark) {
  const [mode, ...rest] = argv;
  const args = {};
  assert.equal(rest.length % 2, 0);
  for (let i = 0; i < rest.length; i += 2) {
    assert.match(rest[i], /^--[a-z-]+$/u);
    const key = rest[i].slice(2);
    assert.ok(!(key in args));
    args[key] = rest[i + 1];
  }
  if (mode === 'create') {
    assert.ok(
      sameKeys(args, ['source', 'artifact', 'source-sha', 'control-sha'])
    );
    createArtifact(args);
  } else {
    assert.equal(mode, 'verify');
    assert.ok(sameKeys(args, ['artifact', 'contract']));
    mark('verification');
    verifyArtifact(args);
  }
}
function runCLI(argv) {
  try {
    diagnoseSealing((mark) => {
      mark('invocation');
      main(argv, mark);
    });
    return null;
  } catch (error) {
    return sealingDiagnostic(error);
  }
}
if (require.main === module) {
  const failure = runCLI(process.argv.slice(2));
  if (failure) {
    console.error(JSON.stringify(failure));
    process.exitCode = 1;
  }
}
module.exports = {
  createManifest,
  validateManifest,
  diagnoseSealing,
  sealingDiagnostic,
  runCLI,
};
