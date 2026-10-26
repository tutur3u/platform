const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const {
  appendFileSync,
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} = require('node:fs');
const { readRegularFileSync } = require('../safe-fs');
const { dirname, isAbsolute, relative, resolve, sep } = require('node:path');
const { isDeepStrictEqual } = require('node:util');
const {
  captureNormalization,
  checkNormalization,
  checkPolicy,
} = require('./meet-emitted-defaults.mjs');

const secretNames = [
  'GOOGLE_GENERATIVE_AI_API_KEY',
  'MEET_REALTIME_TOKEN_SECRET',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SECRET_KEY',
];
const identity = {
  name: 'tuturuuu-meet',
  account_id: 'e8912e2867beecc673d171907bf09649',
  compatibility_date: '2026-09-06',
  compatibility_flags: ['nodejs_compat', 'global_fetch_strictly_public'],
  placement: { region: 'aws:ap-southeast-1' },
  services: [{ binding: 'WORKER_SELF_REFERENCE', service: 'tuturuuu-meet' }],
  r2_buckets: [
    { binding: 'NEXT_INC_CACHE_R2_BUCKET', bucket_name: 'tuturuuu-meet-cache' },
  ],
  images: { binding: 'IMAGES' },
  observability: { enabled: true, head_sampling_rate: 0.05 },
  workers_dev: true,
  routes: [{ pattern: 'meet.tuturuuu.com', custom_domain: true }],
  durable_objects: {
    bindings: [{ name: 'MEET_LIVE', class_name: 'MeetLiveDurableObject' }],
  },
  migrations: [
    { tag: 'meet-live-v1', new_sqlite_classes: ['MeetLiveDurableObject'] },
  ],
  vars: {
    APP_ORIGIN: 'https://tuturuuu.com',
    APP_BASE_PATH: '/meet',
    NEXT_PUBLIC_APP_URL: 'https://meet.tuturuuu.com',
    NEXT_PUBLIC_WEB_APP_URL: 'https://tuturuuu.com',
    MEET_REALTIME_URL: 'wss://meet-realtime.tuturuuu.com/realtime',
    PARLEY_APP_URL: 'https://parley.tuturuuu.com',
  },
};

function equal(actual, expected, message) {
  assert.ok(isDeepStrictEqual(actual, expected), message);
}

function readJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    throw new Error(`Unable to read valid ${label} JSON`);
  }
}

function inside(root, path) {
  const rel = relative(root, path);
  assert.ok(
    rel && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel),
    'artifact path must remain inside its output root'
  );
  return path;
}

function localPath(root, base, path) {
  assert.equal(typeof path, 'string', 'emitted path must be a string');
  assert.ok(!isAbsolute(path), 'emitted paths must be relocatable');
  const target = inside(root, resolve(base, path));
  assert.equal(realpathSync(target), target, 'artifact symlinks are forbidden');
  return target;
}

function deployPointer(app) {
  const native = resolve(app, '.wrangler/deploy/config.json');
  const saved = resolve(app, '.void/preview-deploy-config.json');
  const candidates = [native, saved].filter((path) => {
    try {
      lstatSync(path);
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') return false;
      throw error;
    }
  });
  assert.equal(candidates.length, 1, 'exactly one deploy pointer is required');
  const path = candidates[0];
  assert.equal(
    realpathSync(path),
    path,
    'deploy pointer symlinks are forbidden'
  );
  assert.ok(lstatSync(path).isFile(), 'deploy pointer must be a regular file');
  return { path, base: dirname(native) };
}

function readArtifact(appDirectory) {
  const app = realpathSync(appDirectory);
  const dist = resolve(app, 'dist');
  const { path: redirectPath, base: redirectBase } = deployPointer(app);
  const redirect = readJson(redirectPath, 'deploy redirect');
  equal(
    Object.keys(redirect).sort(),
    ['auxiliaryWorkers', 'configPath'],
    'unexpected redirect fields'
  );
  equal(
    redirect.auxiliaryWorkers,
    [],
    'auxiliary Workers are forbidden in the qualified Meet artifact'
  );
  const configPath = localPath(dist, redirectBase, redirect.configPath);
  const config = readJson(configPath, 'emitted Worker config');
  checkPolicy(config, identity, secretNames);
  const main = localPath(dist, dirname(configPath), config.main);
  assert.ok(lstatSync(main).isFile(), 'emitted Worker entry must exist');
  const assets = localPath(dist, dirname(configPath), config.assets.directory);
  assert.ok(lstatSync(assets).isDirectory(), 'emitted assets must exist');
  assert.ok(readdirSync(assets).length > 0, 'emitted assets must not be empty');
  return { app, config, configPath, main, assets, redirectPath };
}

function fileHashes(app) {
  const hashes = {};
  function visit(path) {
    const stat = lstatSync(path);
    assert.ok(!stat.isSymbolicLink(), 'artifact symlinks are forbidden');
    if (stat.isDirectory()) {
      for (const name of readdirSync(path).sort()) visit(resolve(path, name));
    } else {
      assert.ok(stat.isFile(), 'artifact contains a nonregular file');
      const name = relative(app, path).split(sep).join('/');
      assert.ok(
        !/(^|\/)\.env(?:\.|$)/.test(name),
        'environment files are forbidden'
      );
      hashes[name] = createHash('sha256')
        .update(readRegularFileSync(path))
        .digest('hex');
    }
  }
  visit(resolve(app, 'dist'));
  visit(deployPointer(app).path);
  return hashes;
}

function expectedSha(sha) {
  assert.match(sha ?? '', /^[a-f0-9]{40}$/, 'exact source SHA is required');
}
function sealPath(app) {
  return resolve(app, 'meet-artifact.json');
}
function sealExists(app) {
  try {
    const path = sealPath(app);
    const stat = lstatSync(path);
    assert.ok(
      stat.isFile() && !stat.isSymbolicLink() && realpathSync(path) === path,
      'artifact seal must be a canonical regular file'
    );
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}
function artifactManifest(appDirectory, sha) {
  expectedSha(sha);
  const artifact = readArtifact(appDirectory);
  const normalization = captureNormalization(
    artifact.app,
    artifact.config,
    identity,
    secretNames
  );
  return {
    schema: 2,
    sha,
    config: relative(artifact.app, artifact.configPath).split(sep).join('/'),
    files: fileHashes(artifact.app),
    normalization,
  };
}
function verifyManifest(appDirectory, manifest, sha) {
  expectedSha(sha);
  assert.ok(
    manifest && typeof manifest === 'object' && !Array.isArray(manifest),
    'invalid artifact manifest'
  );
  equal(
    Object.keys(manifest).sort(),
    ['config', 'files', 'normalization', 'schema', 'sha'],
    'invalid artifact manifest fields'
  );
  equal(manifest.schema, 2, 'unsupported artifact manifest schema');
  equal(manifest.sha, sha, 'artifact source SHA mismatch');
  const app = realpathSync(appDirectory);
  assert.ok(
    manifest.files &&
      typeof manifest.files === 'object' &&
      !Array.isArray(manifest.files),
    'invalid file hashes'
  );
  assert.ok(
    Object.values(manifest.files).every(
      (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
    ),
    'invalid file hashes'
  );
  // Authenticate the complete archive before using the original sealed metadata.
  equal(
    fileHashes(app),
    manifest.files,
    'restored artifact differs from the qualified exact-SHA artifact'
  );
  const artifact = readArtifact(app);
  equal(
    relative(app, artifact.configPath).split(sep).join('/'),
    manifest.config,
    'artifact config mismatch'
  );
  checkNormalization(artifact.config, manifest.normalization);
  return artifact;
}
function validateOutput(
  appDirectory,
  { sha = process.env.GITHUB_SHA, mode = 'auto' } = {}
) {
  assert.ok(
    ['auto', 'restore-required'].includes(mode),
    'unsupported artifact lifecycle'
  );
  const app = realpathSync(appDirectory);
  if (sealExists(app))
    return verifyManifest(
      app,
      readJson(sealPath(app), 'artifact manifest'),
      sha
    );
  assert.notEqual(mode, 'restore-required', 'artifact seal is required');
  const artifact = readArtifact(app);
  captureNormalization(app, artifact.config, identity, secretNames);
  return artifact;
}

if (require.main === module) {
  try {
    const [mode, directory, receipt] = process.argv.slice(2);
    if (mode === 'seal') {
      equal(
        resolve(receipt),
        sealPath(realpathSync(directory)),
        'unexpected artifact seal location'
      );
      if (sealExists(realpathSync(directory)))
        throw new Error('artifact is already sealed');
      writeFileSync(
        receipt,
        `${JSON.stringify(artifactManifest(directory, process.env.GITHUB_SHA), null, 2)}\n`
      );
    } else if (mode === 'verify') {
      equal(
        resolve(receipt),
        sealPath(realpathSync(directory)),
        'unexpected artifact seal location'
      );
      assert.ok(
        sealExists(realpathSync(directory)),
        'artifact seal is required'
      );
      verifyManifest(
        directory,
        readJson(receipt, 'artifact manifest'),
        process.env.GITHUB_SHA
      );
    } else if (mode === 'config' || mode === 'config-restored') {
      const { configPath } = validateOutput(directory, {
        mode: mode === 'config-restored' ? 'restore-required' : 'auto',
      });
      if (process.env.GITHUB_OUTPUT)
        appendFileSync(process.env.GITHUB_OUTPUT, `config=${configPath}\n`);
      else process.stdout.write(`${configPath}\n`);
    } else {
      throw new Error('Expected seal, verify or config');
    }
  } catch (error) {
    const message =
      /^meet_normalization:(candidate|inputrelation|type|profilematch|hashrace|unexpectedkeycount):[A-Za-z0-9_]+$/.test(
        error.message
      )
        ? error.message
        : 'meet_artifact:rejected';
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  artifactManifest,
  identity,
  secretNames,
  validateOutput,
  verifyManifest,
};
