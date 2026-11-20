import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readRegularFileSync } from '../safe-fs.js';
import {
  BUILD_OUTPUT_PREFIX,
  buildOutputObservability,
} from './cf-build-output-publisher.mjs';
import { assertSupportedConfig } from './void-cf-config-guard.mjs';
import { suppliers } from './wave1-cf-output.mjs';

// Converts a sealed Void Worker artifact (its emitted deploy config, server
// modules and client assets) into cf Build Output without rebuilding.
// Bindings keep the Workers API wire shape the emitted config already
// produces, so a cf version stays interchangeable with the serving versions
// it may roll back to. Durable Objects stay on tag migrations: `exports` is never emitted
// (deploying one makes every later deployment require it), and pending tag
// migrations are refused because versioned uploads cannot apply them.

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const posix = (value) => value.split(sep).join('/');

/** Default Workers module rules for `no_bundle` additional modules. */
const MODULE_TYPES = [
  [/\.m?js$/u, 'esm'],
  [/\.cjs$/u, 'cjs'],
  [/\.wasm$/u, 'wasm'],
  [/\.bin$/u, 'data'],
  [/\.(?:txt|html|sql)$/u, 'text'],
];

function walk(root, visit, directory = root) {
  for (const name of readdirSync(directory).sort()) {
    const path = join(directory, name);
    const stat = lstatSync(path);
    assert.ok(!stat.isSymbolicLink(), `symlink forbidden: ${name}`);
    if (stat.isDirectory()) walk(root, visit, path);
    else {
      assert.ok(stat.isFile(), `regular file required: ${name}`);
      visit(posix(relative(root, path)), path);
    }
  }
}

/**
 * Minimal .assetsignore matcher for exact paths, single-segment `*` globs and
 * `dir/`. Other gitignore syntax is refused rather than approximated.
 */
export function assetIgnore(lines) {
  const patterns = lines
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      assert.ok(
        !/^!|\*\*|[?[]/u.test(line),
        `unsupported .assetsignore pattern ${line}`
      );
      const dir = line.endsWith('/');
      const body = line.replace(/^\//u, '').replace(/\/$/u, '');
      const source = body
        .split('*')
        .map((part) => part.replace(/[.+?^${}()|[\]\\]/gu, '\\$&'))
        .join('[^/]*');
      return new RegExp(
        body.includes('/') || line.startsWith('/')
          ? `^${source}${dir ? '/' : '(?:/|$)'}`
          : `(?:^|/)${source}${dir ? '/' : '(?:/|$)'}`,
        'u'
      );
    });
  return (path) =>
    path === '.assetsignore' || patterns.some((re) => re.test(path));
}

function moduleType(path) {
  return MODULE_TYPES.find(([re]) => re.test(path))?.[1];
}

/** Every uploadable module under the server directory. */
export function serverModules(serverRoot, mainModule, sourceMaps) {
  const modules = {};
  const maps = [];
  walk(serverRoot, (rel) => {
    if (rel.split('/').some((part) => part.startsWith('.'))) return;
    if (rel.endsWith('.map')) return void maps.push(rel);
    const type = moduleType(rel);
    if (type) modules[rel] = { type };
  });
  assert.equal(modules[mainModule]?.type, 'esm', 'main module must be ESM');
  if (sourceMaps)
    for (const rel of maps)
      if (modules[rel.slice(0, -4)]?.type === 'esm')
        modules[rel] = { type: 'sourcemap' };
  return modules;
}

function bindingFor(name, kind, entry, selfName) {
  switch (kind) {
    case 'service':
      assert.equal(entry.environment, undefined, `${name}: service env`);
      return {
        type: 'worker',
        worker: entry.service,
        ...(entry.entrypoint ? { exportName: entry.entrypoint } : {}),
      };
    case 'r2':
      return {
        type: 'r2',
        name: entry.bucket_name,
        ...(entry.jurisdiction ? { jurisdiction: entry.jurisdiction } : {}),
      };
    case 'kv':
      return { type: 'kv', id: entry.id };
    case 'd1':
      return { type: 'd1', id: entry.database_id };
    case 'analytics':
      return { type: 'analytics-engine-dataset', name: entry.dataset };
    case 'do':
      assert.equal(entry.environment, undefined, `${name}: DO environment`);
      // Self-hosted classes keep the serving shape (no script_name).
      if (!entry.script_name || entry.script_name === selfName)
        return {
          type: 'unsafe:durable_object_namespace',
          class_name: entry.class_name,
        };
      return {
        type: 'durable-object',
        worker: entry.script_name,
        exportName: entry.class_name,
      };
    default:
      throw new Error(`unsupported binding kind ${kind}`);
  }
}

/**
 * Translate the emitted deploy config. `name` renames the Worker (and its
 * self references) for disposable rehearsals; `vars` overrides text vars.
 */
export function workerConfigFrom(config, { name, vars = {} } = {}) {
  const sourceName = config.name;
  const selfName = name ?? sourceName;
  const rename = (worker) => (worker === sourceName ? selfName : worker);
  assertSupportedConfig(config);
  const env = {};
  const add = (key, binding) => {
    assert.ok(!Object.hasOwn(env, key), `duplicate binding ${key}`);
    env[key] = binding;
  };
  for (const [key, value] of Object.entries({ ...config.vars, ...vars }))
    add(
      key,
      typeof value === 'string'
        ? { type: 'text', value }
        : { type: 'json', value }
    );
  for (const key of config.secrets?.required ?? [])
    add(key, { type: 'secret' });
  if (config.assets?.binding) add(config.assets.binding, { type: 'assets' });
  for (const entry of config.services ?? [])
    add(
      entry.binding,
      bindingFor(entry.binding, 'service', {
        ...entry,
        service: rename(entry.service),
      })
    );
  for (const entry of config.r2_buckets ?? [])
    add(entry.binding, bindingFor(entry.binding, 'r2', entry));
  for (const entry of config.kv_namespaces ?? [])
    add(entry.binding, bindingFor(entry.binding, 'kv', entry));
  for (const entry of config.d1_databases ?? [])
    add(entry.binding, bindingFor(entry.binding, 'd1', entry));
  for (const entry of config.analytics_engine_datasets ?? [])
    add(entry.binding, bindingFor(entry.binding, 'analytics', entry));
  if (config.images?.binding) add(config.images.binding, { type: 'images' });
  for (const entry of config.durable_objects?.bindings ?? [])
    add(entry.name, bindingFor(entry.name, 'do', entry, sourceName));
  const placement = config.placement?.region
    ? { region: config.placement.region }
    : config.placement?.mode
      ? { mode: config.placement.mode }
      : undefined;
  return {
    name: selfName,
    compatibilityDate: config.compatibility_date,
    compatibilityFlags: config.compatibility_flags ?? [],
    workersDev: config.workers_dev ?? false,
    previewUrls: config.preview_urls ?? false,
    ...(placement ? { placement } : {}),
    ...(config.limits?.cpu_ms
      ? { limits: { cpuMs: config.limits.cpu_ms } }
      : {}),
    ...(config.assets
      ? {
          assets: {
            runWorkerFirst: config.assets.run_worker_first ?? false,
            notFoundHandling: config.assets.not_found_handling ?? 'none',
            ...(config.assets.html_handling
              ? { htmlHandling: config.assets.html_handling }
              : {}),
          },
        }
      : {}),
    ...(config.observability
      ? { observability: buildOutputObservability(config.observability) }
      : {}),
    env,
  };
}

/** The last tag-migration tag the config declares, or null. */
export function lastMigrationTag(config) {
  const tags = (config.migrations ?? []).map((step) => step.tag);
  assert.ok(tags.every((tag) => typeof tag === 'string' && tag));
  return tags.at(-1) ?? null;
}

export function readEmittedConfig(configPath) {
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  assert.equal(config.no_bundle, true, 'sealed Void output must be no_bundle');
  assert.equal(typeof config.name, 'string');
  assert.equal(typeof config.main, 'string');
  return config;
}

/**
 * Emit `<destination>/.cloudflare/output/v0` from a sealed Void config and
 * write `void-cf-receipt.json` beside it. The destination must be new.
 */
export async function emitVoidCfOutput({
  configPath,
  destination,
  name,
  vars = {},
  sourceSha,
}) {
  const absoluteConfig = realpathSync(configPath);
  const config = readEmittedConfig(absoluteConfig);
  const configDir = dirname(absoluteConfig);
  const mainPath = resolve(configDir, config.main);
  const serverRoot = dirname(mainPath);
  assert.equal(serverRoot, configDir, 'main module must sit beside config');
  const mainModule = posix(relative(serverRoot, mainPath));
  const modules = serverModules(
    serverRoot,
    mainModule,
    config.upload_source_maps === true
  );
  const workerConfig = {
    ...workerConfigFrom(config, { name, vars }),
    manifest: { type: 'complete', mainModule, modules },
  };
  const rootConfig = {
    ...(config.account_id ? { accountId: config.account_id } : {}),
    buildContext: { mode: 'production', isPreview: false },
  };
  const { api, versions } = await suppliers();
  api.OutputRootConfigSchema.parse(rootConfig);
  api.OutputWorkerSchema.parse(workerConfig);

  const target = resolve(destination);
  assert.ok(!existsSync(target), 'destination must not exist');
  const root = join(target, BUILD_OUTPUT_PREFIX);
  const files = {};
  const write = (rel, bytes) => {
    const path = join(root, rel);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, bytes, { flag: 'wx' });
    files[`${BUILD_OUTPUT_PREFIX}${rel}`] = hash(bytes);
  };
  write('config.json', json(rootConfig));
  write('workers/default/worker.config.json', json(workerConfig));
  for (const rel of Object.keys(modules))
    write(
      `workers/default/bundle/${rel}`,
      readRegularFileSync(join(serverRoot, rel))
    );
  let assetCount = 0;
  if (config.assets) {
    const assetsDir = resolve(configDir, config.assets.directory);
    const ignorePath = join(assetsDir, '.assetsignore');
    const ignored = assetIgnore(
      existsSync(ignorePath) ? readFileSync(ignorePath, 'utf8').split('\n') : []
    );
    walk(assetsDir, (rel, path) => {
      if (ignored(rel)) return;
      assetCount += 1;
      write(`workers/default/assets/${rel}`, readRegularFileSync(path));
    });
  }
  const parsed = await api.readBuildOutput(target);
  assert.deepEqual(Object.keys(parsed.workers), ['default']);
  assert.deepEqual(parsed.workers.default.config, workerConfig);
  const receipt = {
    schema: 1,
    kind: 'void-cf-output',
    sourceSha: sourceSha ?? null,
    sourceConfigHash: hash(readFileSync(absoluteConfig)),
    suppliers: versions,
    worker: workerConfig.name,
    sourceWorker: config.name,
    migrationTag: lastMigrationTag(config),
    varOverrides: Object.keys(vars).sort(),
    moduleCount: Object.keys(modules).length,
    assetCount,
    files,
  };
  writeFileSync(join(target, 'void-cf-receipt.json'), json(receipt), {
    flag: 'wx',
  });
  return { ...receipt, buildRoot: target, workerConfig };
}

function parseArgs(argv) {
  const options = { vars: {} };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    assert.ok(value !== undefined, `missing value for ${flag}`);
    index += 1;
    if (flag === '--config') options.configPath = value;
    else if (flag === '--out') options.destination = value;
    else if (flag === '--name') options.name = value;
    else if (flag === '--sha') options.sourceSha = value;
    else if (flag === '--var') {
      const at = value.indexOf('=');
      assert.ok(at > 0, '--var expects KEY=VALUE');
      options.vars[value.slice(0, at)] = value.slice(at + 1);
    } else throw new Error(`unknown flag ${flag}`);
  }
  assert.ok(
    options.configPath && options.destination,
    'usage: --config <emitted-config.json> --out <dir> [--name n] [--var K=V] [--sha s]'
  );
  return options;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  emitVoidCfOutput(parseArgs(process.argv.slice(2)))
    .then(({ files, workerConfig, ...summary }) =>
      console.log(JSON.stringify(summary))
    )
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
