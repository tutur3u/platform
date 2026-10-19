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
const { dirname, isAbsolute, relative, resolve, sep } = require('node:path');
const { isDeepStrictEqual } = require('node:util');

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

function validateOutput(appDirectory) {
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
  for (const [key, expected] of Object.entries(identity)) {
    equal(config[key], expected, `emitted ${key} drift`);
  }
  for (const key of [
    'd1_databases',
    'kv_namespaces',
    'hyperdrive',
    'queues',
    'workflows',
    'dispatch_namespaces',
    'unsafe',
    'containers',
    'vpc_services',
    'send_email',
    'ai',
    'vectorize',
    'browser',
    'analytics_engine_datasets',
    'ratelimits',
    'mtls_certificates',
    'pipelines',
    'secrets_store_secrets',
    'build',
    'triggers',
  ]) {
    const value = config[key];
    assert.ok(
      value === undefined ||
        (Array.isArray(value) && value.length === 0) ||
        (value && typeof value === 'object' && Object.keys(value).length === 0),
      `unexpected emitted resource or build hook: ${key}`
    );
  }
  equal(
    [...config.secrets.required].sort(),
    secretNames,
    'required secret names drift'
  );
  equal(Object.keys(config.secrets), ['required']);
  assert.equal(config.assets.binding, 'ASSETS');
  assert.equal(
    config.assets.run_worker_first,
    true,
    'all auth/API/SSR requests must reach the Worker before assets'
  );
  assert.equal(
    config.assets.not_found_handling,
    'none',
    'SPA fallback is forbidden'
  );
  assert.ok(
    !config.env || Object.keys(config.env).length === 0,
    'named deployment environments are forbidden'
  );
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
        .update(readFileSync(path))
        .digest('hex');
    }
  }
  visit(resolve(app, 'dist'));
  visit(deployPointer(app).path);
  return hashes;
}

function artifactManifest(appDirectory, sha) {
  assert.match(sha ?? '', /^[a-f0-9]{40}$/, 'exact source SHA is required');
  const { app, configPath } = validateOutput(appDirectory);
  return {
    schema: 1,
    sha,
    config: relative(app, configPath).split(sep).join('/'),
    files: fileHashes(app),
  };
}

function verifyManifest(appDirectory, manifest, sha) {
  equal(
    artifactManifest(appDirectory, sha),
    manifest,
    'restored artifact differs from the qualified exact-SHA artifact'
  );
}

if (require.main === module) {
  const [mode, directory, receipt] = process.argv.slice(2);
  if (mode === 'seal') {
    writeFileSync(
      receipt,
      `${JSON.stringify(artifactManifest(directory, process.env.GITHUB_SHA), null, 2)}\n`
    );
  } else if (mode === 'verify') {
    verifyManifest(
      directory,
      readJson(receipt, 'artifact manifest'),
      process.env.GITHUB_SHA
    );
  } else if (mode === 'config') {
    const { configPath } = validateOutput(directory);
    if (process.env.GITHUB_OUTPUT)
      appendFileSync(process.env.GITHUB_OUTPUT, `config=${configPath}\n`);
    else process.stdout.write(`${configPath}\n`);
  } else {
    throw new Error('Expected seal, verify or config');
  }
}

module.exports = {
  artifactManifest,
  identity,
  secretNames,
  validateOutput,
  verifyManifest,
};
