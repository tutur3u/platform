import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire, findPackageJSON } from 'node:module';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readRegularFileSync } from '../safe-fs.js';
import {
  BUILD_OUTPUT_PREFIX,
  buildOutputObservability,
  discoverCfBuildOutputEsmModules,
} from './cf-build-output-publisher.mjs';
import { verify } from './wave1-native-artifact.mjs';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const posix = (value) => value.split(sep).join('/');

function inventory(root) {
  assert.equal(realpathSync(root), root, 'output path must be canonical');
  const entries = [];
  function visit(directory) {
    for (const name of readdirSync(directory).sort()) {
      const path = join(directory, name);
      const stat = lstatSync(path);
      assert.ok(!stat.isSymbolicLink(), 'output symlinks forbidden');
      const key = posix(relative(root, path));
      if (stat.isDirectory()) {
        entries.push([`${key}/`, null]);
        visit(path);
      } else {
        assert.ok(stat.isFile(), 'only regular output files supported');
        entries.push([key, hash(readRegularFileSync(path))]);
      }
    }
  }
  visit(root);
  return Object.fromEntries(entries);
}

const CALENDAR_PKG = resolve(
  fileURLToPath(new URL('../../apps/calendar/package.json', import.meta.url))
);

async function suppliers() {
  const require = createRequire(CALENDAR_PKG);
  const cfPath = require.resolve('cf/package.json');
  const cf = JSON.parse(readFileSync(cfPath));
  const api = {};
  const versions = { cf: cf.version };
  for (const [name, version] of [
    ['@cloudflare/config', '0.27.0'],
    ['@cloudflare/build-output-utils', '0.9.3'],
  ]) {
    const metadataPath = findPackageJSON(name, pathToFileURL(cfPath));
    const metadata = JSON.parse(readFileSync(metadataPath));
    assert.equal(metadata.version, version, 'unqualified output supplier');
    Object.assign(
      api,
      await import(
        new URL(metadata.exports['.'].import, pathToFileURL(metadataPath))
      )
    );
    versions[name] = metadata.version;
  }
  return { api, versions };
}

function publicationEnvBindings(config) {
  const env = {};
  const binding = config.assets?.binding ?? 'ASSETS';
  env[binding] = { type: 'assets' };
  for (const [name, value] of Object.entries(config.vars ?? {}))
    env[name] = { type: 'text', value: String(value) };
  for (const name of config.secrets?.required ?? [])
    env[name] = { type: 'secret' };
  return env;
}

function buildInput(appRoot, app, environment, sha) {
  const verified = verify(appRoot, app, environment, sha);
  const config = JSON.parse(readFileSync(verified.config, 'utf8'));
  assert.equal(config.no_bundle, true);
  const configDir = dirname(verified.config);
  const mainRel = posix(config.main.replace(/^\.\//, ''));
  const mainPath = resolve(configDir, mainRel);
  const bundleRoot = dirname(mainPath);
  const mainModule = posix(relative(bundleRoot, mainPath));
  const modules = discoverCfBuildOutputEsmModules(
    bundleRoot,
    config,
    mainModule
  );
  const assetsDir = resolve(configDir, config.assets.directory);
  const assetFiles = inventory(assetsDir);
  const rootConfig = { buildContext: { mode: 'production', isPreview: false } };
  const workerConfig = {
    name: config.name,
    compatibilityDate: config.compatibility_date,
    compatibilityFlags: config.compatibility_flags ?? [],
    workersDev: config.workers_dev ?? false,
    assets: {
      runWorkerFirst: config.assets.run_worker_first ?? true,
      notFoundHandling: config.assets.not_found_handling ?? 'none',
    },
    observability: buildOutputObservability(config.observability),
    env: publicationEnvBindings(config),
    manifest: { type: 'complete', mainModule, modules },
  };
  return {
    appRoot: realpathSync(appRoot),
    receiptPath: resolve(appRoot, 'wave1-artifact.json'),
    receiptBytes: readRegularFileSync(resolve(appRoot, 'wave1-artifact.json')),
    bundleRoot,
    assetsDir,
    assetFiles,
    rootConfig,
    workerConfig,
    mainModule,
    config,
    configPath: verified.config,
  };
}

function expectedFiles(input) {
  const files = new Map([
    [`${BUILD_OUTPUT_PREFIX}config.json`, Buffer.from(json(input.rootConfig))],
    [
      `${BUILD_OUTPUT_PREFIX}workers/default/worker.config.json`,
      Buffer.from(json(input.workerConfig)),
    ],
  ]);
  for (const name of Object.keys(input.workerConfig.manifest.modules)) {
    files.set(
      `${BUILD_OUTPUT_PREFIX}workers/default/bundle/${name}`,
      readRegularFileSync(join(input.bundleRoot, name))
    );
  }
  for (const [name, digest] of Object.entries(input.assetFiles)) {
    if (digest === null) continue;
    files.set(
      `${BUILD_OUTPUT_PREFIX}workers/default/assets/${name}`,
      readRegularFileSync(join(input.assetsDir, name))
    );
  }
  return files;
}

function expectedInventory(files) {
  const entries = new Map();
  for (const [name, bytes] of files) {
    entries.set(name, bytes === null ? null : hash(bytes));
    for (let parent = dirname(name); parent !== '.'; parent = dirname(parent))
      entries.set(`${parent}/`, null);
  }
  return Object.fromEntries(
    [...entries].sort(([a], [b]) => a.localeCompare(b))
  );
}

function parityReceipt(input, versions, sourceSha) {
  return {
    schema: 1,
    kind: 'wave1-void',
    sourceSha,
    sourceReceiptHash: hash(input.receiptBytes),
    suppliers: versions,
    target: input.workerConfig.name,
    mode: 'production',
    secondaryModuleNames: Object.keys(input.workerConfig.manifest.modules)
      .filter((name) => name !== input.mainModule)
      .map((name) => ({ source: name, cfUpload: `./${name}` })),
  };
}

async function inspect(
  destination,
  input,
  supplied,
  files,
  app,
  environment,
  sourceSha
) {
  supplied.api.OutputRootConfigSchema.parse(input.rootConfig);
  supplied.api.OutputWorkerSchema.parse(input.workerConfig);
  const actual = inventory(destination);
  delete actual['parity.json'];
  assert.deepEqual(
    actual,
    expectedInventory(files),
    'Build Output paths or bytes differ from sealed source'
  );
  const parsed = await supplied.api.readBuildOutput(destination);
  assert.deepEqual(parsed.rootConfig, input.rootConfig);
  assert.deepEqual(Object.keys(parsed.workers), ['default']);
  assert.deepEqual(parsed.workers.default.config, input.workerConfig);
  assert.deepEqual(parsed.containers, []);
  verify(input.appRoot, app, environment, sourceSha);
}

export async function emitWave1Output({
  appRoot,
  app,
  environment,
  sha,
  destination,
}) {
  const input = {
    ...buildInput(appRoot, app, environment, sha),
    app,
    environment,
  };
  const supplied = await suppliers();
  const target = resolve(destination);
  assert.ok(
    !target.startsWith(input.appRoot + sep) && target !== input.appRoot,
    'comparison output must be outside source app'
  );
  const files = expectedFiles(input);
  mkdirSync(target);
  const owned = lstatSync(target);
  try {
    for (const [name, bytes] of files) {
      const path = join(target, name);
      if (bytes === null) mkdirSync(path, { recursive: true });
      else {
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, bytes, { flag: 'wx' });
      }
    }
    await inspect(target, input, supplied, files, app, environment, sha);
    const receipt = parityReceipt(input, supplied.versions, sha);
    writeFileSync(join(target, 'parity.json'), json(receipt), { flag: 'wx' });
    return { ...receipt, buildRoot: target };
  } catch (error) {
    const current = lstatSync(target);
    if (
      current.ino === owned.ino &&
      current.dev === owned.dev &&
      !current.isSymbolicLink()
    )
      rmSync(target, { recursive: true });
    throw error;
  }
}
