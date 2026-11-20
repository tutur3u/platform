import assert from 'node:assert/strict';
import {
  cpSync,
  lstatSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
} from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import {
  assertUploadLimits,
  uploadLimits,
} from './wave1-native-upload-limits.mjs';

export const BUILD_OUTPUT_PREFIX = '.cloudflare/output/v0/';
export const VERSION_ID = /^[0-9a-f-]{36}$/i;

const posixPath = (value) => value.split('\\').join('/');

function moduleGlobs(config) {
  return (config.rules?.flatMap((rule) => rule.globs) ?? ['**/*.{js,mjs}']).map(
    (glob) => glob.replaceAll('\\', '/')
  );
}

function matchesModuleBasename(name, globs) {
  return globs.some((glob) => {
    const pattern = glob
      .replaceAll('**/', '')
      .replaceAll('**', '')
      .replaceAll('*', '.*');
    return new RegExp(`^${pattern}$`).test(name);
  });
}

/** Maps Wrangler observability fields to cf Build Output worker schema casing. */
export function buildOutputObservability(observability) {
  if (observability === undefined) return undefined;
  const output = { ...observability };
  if (Object.hasOwn(observability, 'head_sampling_rate')) {
    output.headSamplingRate = observability.head_sampling_rate;
    delete output.head_sampling_rate;
  }
  if (observability.logs && typeof observability.logs === 'object') {
    const logs = { ...observability.logs };
    if (Object.hasOwn(observability.logs, 'head_sampling_rate')) {
      logs.headSamplingRate = observability.logs.head_sampling_rate;
      delete logs.head_sampling_rate;
    }
    output.logs = logs;
  }
  return output;
}

function discoverCfBuildOutputEsmModulesFromVite(bundleRoot, mainModule) {
  const manifestPath = join(bundleRoot, '.vite/manifest.json');
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
  assert.ok(
    manifest && !Array.isArray(manifest) && typeof manifest === 'object',
    'Invalid Vite manifest'
  );
  const mainBase = mainModule.split('/').pop();
  const entries = Object.values(manifest).filter(
    (record) =>
      record?.file &&
      (record.isEntry === true ||
        record.file === mainModule ||
        record.file.endsWith(`/${mainBase}`) ||
        record.file === mainBase)
  );
  assert.ok(entries.length > 0, 'Vite manifest missing Worker entry');
  const modules = {};
  const queue = entries.map((record) => record.file);
  const seen = new Set();
  while (queue.length) {
    const file = queue.shift();
    if (!file || seen.has(file)) continue;
    seen.add(file);
    const rel = posixPath(file);
    assert.ok(
      !/\.map$/u.test(rel),
      'Vite module graph must not reference source maps'
    );
    const path = join(bundleRoot, rel);
    assert.ok(
      lstatSync(path).isFile(),
      `Vite module missing from bundle: ${rel}`
    );
    modules[rel] = { type: 'esm' };
    const record = Object.values(manifest).find((item) => item.file === file);
    for (const key of [
      ...(record?.imports ?? []),
      ...(record?.dynamicImports ?? []),
    ]) {
      const next = manifest[key]?.file;
      if (next) queue.push(next);
    }
  }
  assert.ok(
    Object.hasOwn(modules, mainModule),
    'main module missing from Vite graph'
  );
  return modules;
}

export function discoverCfBuildOutputEsmModules(
  bundleRoot,
  config,
  mainModule
) {
  const fromVite = discoverCfBuildOutputEsmModulesFromVite(
    bundleRoot,
    mainModule
  );
  if (fromVite) return fromVite;
  const globs = moduleGlobs(config);
  const modules = {};
  function visit(directory) {
    for (const name of readdirSync(directory)) {
      const path = join(directory, name);
      const stat = lstatSync(path);
      assert.ok(!stat.isSymbolicLink(), 'bundle symlink forbidden');
      if (stat.isDirectory()) {
        if (name.startsWith('.')) continue;
        visit(path);
        continue;
      }
      assert.ok(stat.isFile(), 'bundle module path must be a regular file');
      if (name.endsWith('.map')) continue;
      const rel = posixPath(relative(bundleRoot, path));
      if (!/\.(?:m?js)$/u.test(rel)) continue;
      if (rel !== mainModule && !matchesModuleBasename(name, globs)) continue;
      modules[rel] = { type: 'esm' };
    }
  }
  visit(bundleRoot);
  assert.ok(
    Object.hasOwn(modules, mainModule),
    'main module missing from bundle'
  );
  return modules;
}

export function cfBundleModuleNames(buildRoot) {
  const bundleRoot = join(
    buildRoot,
    BUILD_OUTPUT_PREFIX,
    'workers/default/bundle'
  );
  const modules = [];
  function visit(directory) {
    for (const name of readdirSync(directory)) {
      const path = join(directory, name);
      const stat = lstatSync(path);
      assert.ok(!stat.isSymbolicLink(), 'cf bundle symlink forbidden');
      if (stat.isDirectory()) visit(path);
      else if (/\.(?:m?js)$/u.test(name) && !name.endsWith('.map'))
        modules.push(relative(bundleRoot, path).split('\\').join('/'));
    }
  }
  visit(bundleRoot);
  return modules.sort();
}

export function cfBuildOutputMainModule(buildRoot) {
  const workerConfigPath = join(
    buildRoot,
    BUILD_OUTPUT_PREFIX,
    'workers/default/worker.config.json'
  );
  const worker = JSON.parse(readFileSync(workerConfigPath, 'utf8'));
  assert.equal(worker.manifest?.type, 'complete', 'complete manifest required');
  return worker.manifest.mainModule;
}

/** Module paths staged for upload excluding the Worker entry module. */
export function cfBundleSecondaryModuleNames(buildRoot) {
  const mainModule = cfBuildOutputMainModule(buildRoot);
  return cfBundleModuleNames(buildRoot).filter((name) => name !== mainModule);
}

export function assertUploadNameParity(receipt, secondaryModuleNames) {
  const expected = receipt.secondaryModuleNames ?? [];
  assert.deepEqual(
    [...secondaryModuleNames].sort(),
    expected.map((item) => item.source).sort(),
    'cf Build Output bundle modules differ from emit manifest'
  );
  for (const item of expected) {
    assert.equal(
      item.cfUpload,
      item.source.startsWith('./') ? item.source : `./${item.source}`,
      'cf upload module name drift'
    );
  }
}

export function stageBuildOutput(appRoot, buildRoot) {
  const source = join(buildRoot, '.cloudflare', 'output');
  const target = join(appRoot, '.cloudflare', 'output');
  rmSync(target, { recursive: true, force: true });
  cpSync(source, target, { recursive: true });
  return target;
}

export function measureBuildOutputUpload(
  configPath,
  buildRoot,
  secretNames = []
) {
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  const bundleRoot = join(
    buildRoot,
    BUILD_OUTPUT_PREFIX,
    'workers/default/bundle'
  );
  const assetRoot = join(
    buildRoot,
    BUILD_OUTPUT_PREFIX,
    'workers/default/assets'
  );
  const modules = [];
  function visit(directory, root) {
    for (const name of readdirSync(directory)) {
      const path = join(directory, name);
      const stat = lstatSync(path);
      if (stat.isDirectory()) visit(path, root);
      else if (/\.(?:m?js)$/u.test(name) && !name.endsWith('.map')) {
        const rel = relative(root, path).split('\\').join('/');
        modules.push({ name: rel, bytes: stat.size, path });
      }
    }
  }
  visit(bundleRoot, bundleRoot);
  assert.ok(modules.length > 0, 'cf Build Output bundle is empty');
  const scriptBytes = modules.reduce((total, item) => total + item.bytes, 0);
  const gzipBytes = gzipSync(
    Buffer.concat(modules.map((item) => readFileSync(item.path)))
  ).length;
  let assetCount = 0;
  let maxAsset = 0;
  try {
    const walk = (directory) => {
      for (const name of readdirSync(directory)) {
        const path = join(directory, name);
        const stat = lstatSync(path);
        if (stat.isDirectory()) walk(path);
        else {
          assetCount += 1;
          maxAsset = Math.max(maxAsset, stat.size);
        }
      }
    };
    walk(assetRoot);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const plainSizes = Object.values(config.vars ?? {}).map((value) =>
    Buffer.byteLength(typeof value === 'string' ? value : JSON.stringify(value))
  );
  return {
    schema: 1,
    limits: uploadLimits,
    script: {
      bytes: scriptBytes,
      gzipBytes,
      gzipOrder: 'cf Build Output bundle paths',
      moduleCount: modules.length,
      maxModuleBytes: Math.max(...modules.map((item) => item.bytes)),
      modules: modules.map(({ name, bytes }) => ({ name, bytes })),
    },
    sourcemaps: {
      enabled: false,
      count: 0,
      encodedBytes: 0,
      gzipBytes: 0,
      unexpectedFiles: 0,
      measured: true,
    },
    assets: { count: assetCount, maxFileBytes: maxAsset },
    variables: {
      count: new Set([
        ...secretNames,
        ...(config.secrets?.required ?? []),
        ...Object.keys(config.vars ?? {}),
      ]).size,
      maxPlainValueBytes: Math.max(0, ...plainSizes),
      secretValues: 'existing provider bindings, not uploaded',
    },
    warnings:
      gzipBytes > 10 * 1024 ** 2
        ? ['Worker gzip exceeds 10 MiB; informational, no provider size limit']
        : [],
    startup: { cpuLimitMs: 1000, status: 'requires hosted native acceptance' },
  };
}

export function parseCfVersionId(output) {
  const combined = String(output);
  try {
    const json = JSON.parse(combined);
    const candidate =
      json.version_id ?? json.id ?? json.result?.id ?? json.result?.version_id;
    if (typeof candidate === 'string' && VERSION_ID.test(candidate))
      return candidate;
  } catch {
    // Fall through to table/text parsing.
  }
  const match = combined.match(
    /(?:version[_\s-]*id|Worker Version ID):\s*([0-9a-f-]{36})/i
  );
  return match?.[1];
}

const CF_ENV_KEYS = [
  'PATH',
  'HOME',
  'USER',
  'TMPDIR',
  'TMP',
  'TEMP',
  'LANG',
  'LC_ALL',
];

export function cfChildEnv(env, { cfToken, accountId } = {}) {
  return {
    ...Object.fromEntries(
      CF_ENV_KEYS.flatMap((name) =>
        env[name] === undefined ? [] : [[name, env[name]]]
      )
    ),
    CI: 'true',
    CF_SEND_TELEMETRY: 'false',
    ...(cfToken ? { CLOUDFLARE_API_TOKEN: cfToken } : {}),
    ...(accountId ? { CLOUDFLARE_ACCOUNT_ID: accountId } : {}),
  };
}

/**
 * @typedef {'activate' | 'version-only'} CfPublicationTraffic
 * activate: cf deploy --prebuilt (private staging accept path).
 * version-only: cf workers versions create --prebuilt without changing traffic.
 */

export function cfPrebuiltArgs({
  traffic,
  dryRun,
  sha,
  digest,
  workerName,
  outdir,
}) {
  if (traffic === 'version-only') {
    assert.ok(!dryRun, 'version-only upload forbids dry-run');
    return [
      'x',
      '--no-install',
      'cf',
      'workers',
      'versions',
      'create',
      '--prebuilt',
      '--worker',
      workerName,
      '--message',
      sha,
      '--tag',
      digest,
    ];
  }
  return [
    'x',
    '--no-install',
    'cf',
    'deploy',
    '--prebuilt',
    '--mode',
    'production',
    ...(dryRun
      ? ['--dry-run', '--no-provision']
      : ['--no-provision', '--message', sha, '--tag', digest]),
    ...(outdir ? [] : []),
  ];
}

export function runCfPrebuilt({
  env,
  appRoot,
  exec,
  traffic,
  dryRun,
  sha,
  digest,
  workerName,
  cfToken,
  accountId,
}) {
  const args = cfPrebuiltArgs({
    traffic,
    dryRun,
    sha,
    digest,
    workerName,
  });
  const cwd = resolve(appRoot);
  if (dryRun) assert.equal(cfToken, undefined);
  const stdio = dryRun ? ['ignore', 'pipe', 'pipe'] : 'pipe';
  const encoding = dryRun ? undefined : 'utf8';
  try {
    const result = exec('bun', args, {
      cwd,
      env: cfChildEnv(env, { cfToken, accountId }),
      stdio,
      encoding,
      timeout: dryRun ? 120000 : 180000,
      maxBuffer: 4 * 1024 * 1024,
    });
    return typeof result === 'string' ? result : '';
  } catch (error) {
    if (dryRun && error && typeof error === 'object') {
      const stdout = Buffer.isBuffer(error.stdout)
        ? error.stdout.toString('utf8')
        : String(error.stdout ?? '');
      const stderr = Buffer.isBuffer(error.stderr)
        ? error.stderr.toString('utf8')
        : String(error.stderr ?? '');
      if (!stderr.trim() && stdout.trim()) error.stderr = stdout;
      else if (stdout.trim()) error.stderr = `${stderr}\n${stdout}`;
    }
    throw error;
  }
}

export function teardownStagedOutput(appRoot) {
  rmSync(join(appRoot, '.cloudflare'), { recursive: true, force: true });
}

export function assertMeasuredLimits(configPath, buildRoot, secretNames) {
  assertUploadLimits(
    measureBuildOutputUpload(configPath, buildRoot, secretNames)
  );
}
