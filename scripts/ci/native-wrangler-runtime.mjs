import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  copyFile,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from 'node:path';

function closed(value, keys, label) {
  assert.ok(value && Object.getPrototypeOf(value) === Object.prototype, label);
  for (const key of Object.keys(value)) {
    assert.ok(keys.includes(key), `Unsupported ${label} field: ${key}`);
  }
}
function inside(root, path) {
  assert.ok(isAbsolute(path), 'Artifact paths must be absolute');
  const rel = relative(root, path);
  assert.ok(
    rel && !rel.startsWith('..') && !isAbsolute(rel),
    'Artifact path escapes root'
  );
  return path;
}

// Inventory names first: never read ambient credential files or follow links.
export async function sealArtifact(root) {
  return inventory(root);
}

async function inventory(root, ignored) {
  assert.equal(await realpath(root), root, 'Artifact root must be canonical');
  const files = [];
  async function visit(dir) {
    for (const entry of (await readdir(dir, { withFileTypes: true })).sort(
      (a, b) => a.name.localeCompare(b.name)
    )) {
      if (relative(root, join(dir, entry.name)) === ignored) continue;
      assert.ok(
        !entry.name.startsWith('.'),
        'Hidden artifact entry unsupported'
      );
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push([`${relative(root, path)}/`, null]);
        await visit(path);
      } else {
        assert.ok(entry.isFile(), 'Only regular artifact files supported');
        files.push([
          relative(root, path),
          createHash('sha256')
            .update(await readFile(path))
            .digest('hex'),
        ]);
      }
    }
  }
  await visit(root);
  return Object.fromEntries(files);
}

export async function inspectArtifact(options) {
  closed(
    options,
    [
      'root',
      'config',
      'main',
      'seal',
      'sourceSHA',
      'canonicalHost',
      'ownerPackage',
      'fixtureVars',
      'fixtureSecrets',
      'fixtureServices',
      'outbound',
      'externalWorkers',
    ],
    'adapter'
  );
  assert.match(options.sourceSHA, /^[a-f0-9]{40}$/);
  assert.match(options.canonicalHost, /^(?:[a-z0-9-]+\.)+[a-z0-9-]+$/);
  assert.ok(
    isAbsolute(options.ownerPackage),
    'Absolute SDK owner package required'
  );
  assert.deepEqual(
    options.externalWorkers ?? [],
    [],
    'External workers unsupported; preserve caller until admitted'
  );
  const { root } = options;
  inside(root, options.config);
  inside(root, options.main);
  assert.deepEqual(
    await sealArtifact(root),
    options.seal,
    'Artifact hash mutation'
  );
  const config = JSON.parse(await readFile(options.config, 'utf8'));
  closed(
    config,
    [
      'name',
      'main',
      'compatibility_date',
      'compatibility_flags',
      'no_bundle',
      'find_additional_modules',
      'rules',
      'vars',
      'durable_objects',
      'migrations',
      'assets',
      'services',
    ],
    'emitted config'
  );
  assert.match(config.name, /^[a-z0-9-]+$/);
  assert.equal(resolve(dirname(options.config), config.main), options.main);
  assert.match(config.compatibility_date, /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual(
    config.compatibility_flags ?? [],
    [],
    'Compatibility flags unsupported'
  );
  assert.equal(config.no_bundle, true);
  assert.equal(config.find_additional_modules, true);
  assert.ok(Array.isArray(config.rules));
  for (const rule of config.rules) {
    closed(rule, ['type', 'globs', 'fallthrough'], 'module rule');
    assert.ok(['ESModule', 'Text', 'CompiledWasm', 'Data'].includes(rule.type));
    assert.ok(
      Array.isArray(rule.globs) &&
        rule.globs.every((glob) => typeof glob === 'string')
    );
    assert.ok(
      rule.fallthrough === undefined || typeof rule.fallthrough === 'boolean'
    );
  }
  assert.equal(
    config.vars?.COMPILED_SHA,
    options.sourceSHA,
    'Compiled source SHA mismatch'
  );
  closed(config.vars ?? {}, Object.keys(config.vars ?? {}), 'vars');
  for (const value of Object.values(config.vars ?? {}))
    assert.equal(typeof value, 'string');
  const namespaces = config.durable_objects?.bindings ?? [];
  if (config.durable_objects)
    closed(config.durable_objects, ['bindings'], 'durable_objects');
  assert.ok(Array.isArray(namespaces));
  for (const binding of namespaces) {
    closed(binding, ['name', 'class_name'], 'internal DO');
    assert.equal(typeof binding.name, 'string');
    assert.equal(typeof binding.class_name, 'string');
  }
  for (const migration of config.migrations ?? []) {
    closed(migration, ['tag', 'new_sqlite_classes'], 'migration');
    assert.equal(typeof migration.tag, 'string');
    assert.ok(Array.isArray(migration.new_sqlite_classes));
    for (const name of migration.new_sqlite_classes)
      assert.equal(typeof name, 'string');
  }
  if (config.assets) {
    closed(
      config.assets,
      [
        'directory',
        'binding',
        'run_worker_first',
        'html_handling',
        'not_found_handling',
      ],
      'assets'
    );
    const assets = inside(
      root,
      resolve(dirname(options.config), config.assets.directory)
    );
    assert.equal(await realpath(assets), assets);
    assert.equal(typeof config.assets.binding, 'string');
    assert.equal(config.assets.run_worker_first, true);
    assert.ok(
      [
        'auto-trailing-slash',
        'force-trailing-slash',
        'drop-trailing-slash',
        'none',
        undefined,
      ].includes(config.assets.html_handling)
    );
    assert.ok(
      ['none', '404-page', 'single-page-application', undefined].includes(
        config.assets.not_found_handling
      )
    );
  }
  const serviceNames = new Set();
  for (const service of config.services ?? []) {
    closed(service, ['binding', 'service'], 'fixture service');
    assert.equal(typeof service.binding, 'string');
    assert.equal(typeof service.service, 'string');
    assert.ok(!serviceNames.has(service.binding), 'Duplicate service');
    serviceNames.add(service.binding);
  }
  closed(options.fixtureServices ?? {}, [...serviceNames], 'fixtureServices');
  assert.deepEqual(
    Object.keys(options.fixtureServices ?? {}).sort(),
    [...serviceNames].sort(),
    'Every service requires a same-process fixture'
  );
  const bindingNames = [...namespaces.map((b) => b.name), ...serviceNames];
  if (config.assets) bindingNames.push(config.assets.binding);
  assert.equal(
    new Set(bindingNames).size,
    bindingNames.length,
    'Duplicate resource binding'
  );
  const names = new Set(bindingNames);
  for (const name of Object.keys(config.vars ?? {})) {
    assert.ok(
      !names.has(name),
      'Config variable collides with resource binding'
    );
  }
  const bindings = {};
  for (const [group, type] of [
    ['fixtureVars', 'plain_text'],
    ['fixtureSecrets', 'secret_text'],
  ]) {
    const values = options[group] ?? {};
    closed(values, Object.keys(values), group);
    for (const [name, value] of Object.entries(values)) {
      assert.notEqual(
        name,
        'COMPILED_SHA',
        'Compiled identity cannot be overridden'
      );
      assert.ok(!names.has(name), 'Fixture binding collision');
      assert.equal(typeof value, 'string');
      names.add(name);
      bindings[name] = { type, value };
    }
  }
  for (const name of serviceNames) {
    assert.equal(typeof options.fixtureServices[name], 'function');
    bindings[name] = {
      type: 'fetcher',
      fetcher: options.fixtureServices[name],
    };
  }
  assert.equal(
    typeof options.outbound,
    'function',
    'Explicit deny-by-default egress fixture required'
  );
  return { config, bindings };
}

// The existing CI step owns the watchdog, including startup and disposal.
let supplier;
export function assertAmbientEnvironment(env = process.env) {
  for (const key of [
    'CLOUDFLARE_INCLUDE_PROCESS_ENV',
    'CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV',
  ]) {
    assert.ok(!env[key] || env[key] === 'false', `Ambient discovery: ${key}`);
  }
  for (const key of [
    'NODE_OPTIONS',
    'NODE_PATH',
    'CLOUDFLARE_ENV',
    'WRANGLER_LOG_PATH',
    'WRANGLER_REGISTRY_PATH',
    'WRANGLER_CACHE_DIR',
    'WRANGLER_OUTPUT_FILE_PATH',
    'WRANGLER_OUTPUT_FILE_DIRECTORY',
  ]) {
    assert.ok(!env[key], `Ambient override: ${key}`);
  }
  assert.ok(
    ['false', '0'].includes(env.WRANGLER_WRITE_LOGS?.toLowerCase()),
    'WRANGLER_WRITE_LOGS must disable asynchronous SDK disk logging'
  );
}

// Admission is supplied by the isolated child launcher before SDK loading.
export async function assertChildTempIsolation(
  env = process.env,
  cwd = process.cwd()
) {
  const root = join(await realpath(cwd), 'native-sdk-temp');
  assert.equal(await realpath(root), root, 'Child temp root must be canonical');
  for (const key of ['TMPDIR', 'TMP', 'TEMP', 'NATIVE_SDK_TEMP_ROOT']) {
    assert.equal(
      env[key],
      root,
      `Missing isolated child temp environment: ${key}`
    );
  }
  return root;
}
export async function assertTempContents(root, expected = []) {
  assert.deepEqual(
    (await readdir(root)).sort(),
    [...expected].sort(),
    `SDK temporary residuals retained: ${root}`
  );
}

export async function startNativeWrangler(options) {
  const tempRoot = await assertChildTempIsolation();
  assert.equal(tmpdir(), tempRoot, 'SDK os.tmpdir must use the admitted root');
  await assertTempContents(tempRoot);
  assertAmbientEnvironment();
  const { bindings } = await inspectArtifact(options);
  const require = createRequire(options.ownerPackage);
  const sdkPath = require.resolve('wrangler');
  assert.equal(
    createHash('sha256')
      .update(await readFile(sdkPath))
      .digest('hex'),
    '507cd3644d6a53f0d66922d79c04b03557b7d2d0a376d2d906b92ed20812bb30',
    'Unreviewed public Wrangler supplier bytes'
  );
  if (!supplier) {
    assert.ok(!require.cache[sdkPath], 'Preloaded Wrangler SDK unsupported');
    supplier = { path: sdkPath, sdk: require('wrangler') };
  }
  assert.equal(supplier.path, sdkPath, 'SDK owner changed');
  const { unstable_startWorker } = supplier.sdk;
  const scratch = await realpath(
    await mkdtemp(join(tmpdir(), 'native-wrangler-fixture-'))
  );
  const copyRoot = join(scratch, 'artifact');
  const copyConfig = join(copyRoot, relative(options.root, options.config));
  const copyMain = join(copyRoot, relative(options.root, options.main));
  const sdkWorkingDir = join(dirname(copyConfig), '.wrangler');
  const envFile = join(scratch, 'synthetic.env');
  // Copy every sealed file without changing config/main/module/asset relationships.
  // Fresh inventory rejects added files; both seals are checked before SDK startup.
  try {
    await mkdir(copyRoot);
    for (const name of Object.keys(options.seal)) {
      const target = inside(copyRoot, join(copyRoot, name));
      await mkdir(dirname(target), { recursive: true });
      if (name.endsWith('/')) await mkdir(target, { recursive: true });
      else
        await copyFile(inside(options.root, join(options.root, name)), target);
    }
    await assertArtifactUnchanged(options);
    assert.deepEqual(
      await sealArtifact(copyRoot),
      options.seal,
      'Copy hash mutation'
    );
    await writeFile(envFile, '');
  } catch (error) {
    throw new Error(`Artifact copy rejected; scratch retained: ${scratch}`, {
      cause: error,
    });
  }
  let worker;
  try {
    worker = await unstable_startWorker({
      config: copyConfig,
      envFiles: [envFile],
      sendMetrics: false,
      bindings,
      build: { bundle: false, processEntrypoint: false },
      dev: {
        remote: false,
        watch: false,
        persist: false,
        inspector: false,
        liveReload: false,
        generateTypes: false,
        enableContainers: false,
        registry: join(scratch, 'registry'),
        server: { hostname: '127.0.0.1', port: 0 },
        origin: { hostname: options.canonicalHost, secure: true },
        inferOriginFromRoutes: false,
        routeRequestsByRoutes: false,
        auth: () => {
          throw new Error('Provider auth forbidden in fixture');
        },
        outboundService: options.outbound,
      },
    });
  } catch (error) {
    // startWorker can reject before returning its Worker. SDK owns any pending teardown.
    // Retain scratch and report custody; the provider watchdog must fail a stuck stage.
    throw new Error(
      `Public SDK startup rejected; scratch retained: ${scratch}`,
      { cause: error }
    );
  }
  let cleanup;
  return {
    worker,
    scratch,
    copyRoot,
    copyConfig,
    copyMain,
    sdkWorkingDir,
    cleanup() {
      cleanup ??= (async () => {
        try {
          await worker.dispose();
          // Miniflare removal is fire-and-forget. Residuals are failure evidence;
          // never sweep them to manufacture a successful cleanup.
          await assertTempContents(tempRoot, [basename(scratch)]);
          const checks = await Promise.allSettled([
            assertArtifactUnchanged(options),
            (async () => {
              assert.deepEqual(
                await inventory(copyRoot, relative(copyRoot, sdkWorkingDir)),
                options.seal,
                'Copy hash mutation'
              );
            })(),
          ]);
          const errors = checks
            .filter((c) => c.status === 'rejected')
            .map((c) => c.reason);
          if (errors.length)
            throw new AggregateError(errors, 'Artifact cleanup seals failed');
          await rm(scratch, { recursive: true });
          try {
            await realpath(scratch);
            throw new Error('Owned scratch removal did not remove root');
          } catch (error) {
            if (error.code !== 'ENOENT') throw error;
          }
        } catch (error) {
          throw new Error(
            `Public SDK cleanup failed; evidence retained: ${scratch}`,
            { cause: error }
          );
        }
      })();
      return cleanup;
    },
  };
}

export async function assertArtifactUnchanged(options) {
  assert.deepEqual(
    await sealArtifact(options.root),
    options.seal,
    'Artifact hash mutation'
  );
}
