import { createHash } from 'node:crypto';
import {
  closeSync,
  existsSync,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nativeDefaultProbe } from './native-config-default-probe.mjs';

const MAX_RECEIPT = 16 * 1024;
const MAX_INPUT = 4 * 1024 * 1024;
// Public Wrangler constructor keys captured in V441, plus its five computed
// fields and root defaults. This is a disclosure vocabulary, never acceptance.
const PUBLIC_KEYS = new Set(
  `account_id compatibility_date compatibility_flags
jsx_factory jsx_fragment tsconfig rules name main find_additional_modules
preserve_file_names base_dir route routes triggers assets limits placement build
workers_dev preview_urls vars secrets define durable_objects workflows migrations
exports kv_namespaces cloudchamber containers send_email queues connect r2_buckets
d1_databases vectorize ai_search_namespaces ai_search agent_memory hyperdrive
services analytics_engine_datasets dispatch_namespaces mtls_certificates
tail_consumers streaming_tail_consumers unsafe browser analytics ai images stream
media pipelines k2 secrets_store_secrets artifacts unsafe_hello_world flagship
worker_loaders ratelimits vpc_services vpc_networks version_metadata logfwdr
no_bundle minify keep_names first_party_worker logpush upload_source_maps
observability access cache compliance_region python_modules previews configPath
userConfigPath topLevelName definedEnvironments targetEnvironment dev
`
    .split(/\s+/)
    .filter(Boolean)
);

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const reject = (code) => {
  throw Object.assign(new Error(code), { receiptCode: code });
};
const type = (value) =>
  value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
const object = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
// Matches the current qualification predicate; false/null/"" are not empty.
const empty = (value) =>
  (Array.isArray(value) && value.length === 0) ||
  (object(value) && Object.keys(value).length === 0);
const within = (root, path) => {
  const part = relative(root, path);
  return (
    part === '' ||
    (!isAbsolute(part) && part !== '..' && !part.startsWith(`..${sep}`))
  );
};

function bytes(path, limit = MAX_INPUT) {
  const absolute = resolve(path);
  if (realpathSync(absolute) !== absolute || !lstatSync(absolute).isFile())
    reject('unsafe_file');
  const fd = openSync(absolute, 'r');
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > limit) reject('input_limit');
    const result = readFileSync(fd);
    if (result.length > limit) reject('input_limit');
    return result;
  } finally {
    closeSync(fd);
  }
}

function json(path) {
  return JSON.parse(bytes(path).toString('utf8'));
}

function keyShape(value) {
  const keys = Object.keys(value);
  return { keyCount: keys.length, keyHashes: keys.map(hash).sort() };
}

function shape(value) {
  const result = { type: type(value), empty: empty(value) };
  if (object(value)) Object.assign(result, keyShape(value));
  if (Array.isArray(value)) {
    result.count = value.length;
    result.itemTypes = [...new Set(value.map(type))].sort();
    const objects = value.filter(object);
    result.objectCount = objects.length;
    result.objectKeyCounts = objects.map((item) => Object.keys(item).length);
    result.objectKeyHashes = [
      ...new Set(objects.flatMap((item) => Object.keys(item).map(hash))),
    ].sort();
  }
  return result;
}

function queueShape(value) {
  if (!object(value)) return shape(value);
  const keys = Object.keys(value);
  return {
    ...shape(value),
    topKeys: keys.map((name) =>
      ['producers', 'consumers'].includes(name)
        ? { name }
        : { unknownNameHash: hash(name) }
    ),
    producers: Object.hasOwn(value, 'producers')
      ? shape(value.producers)
      : { type: 'absent' },
    consumers: Object.hasOwn(value, 'consumers')
      ? shape(value.consumers)
      : { type: 'absent' },
  };
}

function pathBits(value, app, dist, emitted, base) {
  const result = { type: type(value) };
  if (typeof value !== 'string') return result;
  const path = resolve(base, value);
  return {
    ...result,
    absolute: isAbsolute(value),
    emptyString: value === '',
    insideApp: within(app, path),
    insideDist: within(dist, path),
    equalsEmitted: path === emitted,
  };
}

function gitHead(root) {
  let git = resolve(root, '.git');
  if (lstatSync(git).isFile()) {
    const line = bytes(git).toString('utf8').trim();
    if (!line.startsWith('gitdir: ')) reject('source_unavailable');
    git = resolve(root, line.slice(8));
  }
  const head = bytes(resolve(git, 'HEAD')).toString('utf8').trim();
  let sha = head;
  if (head.startsWith('ref: ')) {
    const ref = head.slice(5);
    if (!/^refs\/[A-Za-z0-9_./-]+$/.test(ref) || ref.includes('..'))
      reject('source_unavailable');
    const commonFile = resolve(git, 'commondir');
    const common = existsSync(commonFile)
      ? resolve(git, bytes(commonFile).toString('utf8').trim())
      : git;
    const refFile = resolve(common, ref);
    if (existsSync(refFile)) sha = bytes(refFile).toString('utf8').trim();
    else {
      const packed = bytes(resolve(common, 'packed-refs'))
        .toString('utf8')
        .split('\n');
      const matches = packed.filter((line) => line.endsWith(` ${ref}`));
      if (matches.length !== 1) reject('source_unavailable');
      sha = matches[0].split(' ')[0];
    }
  }
  if (!/^[a-f0-9]{40}$/.test(sha)) reject('source_unavailable');
  return sha;
}

// Resolve without importing supplier code. Walk the owner's module ancestry,
// respecting package boundaries; never substitute the app's visible Wrangler.
function packageFrom(owner, name) {
  let directory = dirname(owner);
  while (true) {
    const candidate = resolve(directory, 'node_modules', name, 'package.json');
    if (existsSync(candidate)) {
      const path = realpathSync(candidate);
      const metadata = json(path);
      if (
        metadata.name !== name ||
        !/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/.test(metadata.version)
      ) {
        reject('provenance_unavailable');
      }
      return { directory: dirname(path), path, metadata };
    }
    const parent = dirname(directory);
    if (parent === directory) reject('provenance_unavailable');
    directory = parent;
  }
}

function publicPackage(pkg, entry) {
  const path = realpathSync(entry);
  if (!within(pkg.directory, path)) reject('provenance_unavailable');
  return {
    version: pkg.metadata.version,
    packageHash: hash(bytes(pkg.path)),
    sourceHash: hash(bytes(path, 64 * 1024 * 1024)),
  };
}

function provenance(app) {
  const appPackage = resolve(app, 'package.json');
  const voidEntry = realpathSync(createRequire(appPackage).resolve('void'));
  const voidPackage = packageFrom(appPackage, 'void');
  const plugin = packageFrom(voidEntry, '@cloudflare/vite-plugin');
  const exported = plugin.metadata.exports?.['.'] ?? plugin.metadata.exports;
  const importEntry =
    typeof exported === 'string' ? exported : exported?.import;
  if (typeof importEntry !== 'string') reject('provenance_unavailable');
  const pluginEntry = resolve(plugin.directory, importEntry);
  if (!within(plugin.directory, pluginEntry)) reject('provenance_unavailable');
  const wranglerEntry = realpathSync(
    createRequire(pluginEntry).resolve('wrangler')
  );
  const wrangler = packageFrom(pluginEntry, 'wrangler');
  return {
    void: publicPackage(voidPackage, voidEntry),
    plugin: publicPackage(plugin, pluginEntry),
    wrangler: publicPackage(wrangler, wranglerEntry),
  };
}

export function collect({ root, appDirectory, eventSha }) {
  const app = resolve(root, appDirectory);
  if (!within(root, app) || realpathSync(app) !== app) reject('unsafe_app');
  const dist = resolve(app, 'dist');
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
  if (candidates.length !== 1) reject('pointer_count');
  const pointerBytes = bytes(candidates[0]);
  const pointer = JSON.parse(pointerBytes.toString('utf8'));
  if (
    !object(pointer) ||
    Object.keys(pointer).sort().join(',') !== 'auxiliaryWorkers,configPath' ||
    typeof pointer.configPath !== 'string' ||
    !pointer.configPath ||
    !Array.isArray(pointer.auxiliaryWorkers) ||
    pointer.auxiliaryWorkers.length !== 0
  )
    reject('pointer_shape');
  const emitted = resolve(dirname(native), pointer.configPath);
  if (!within(dist, emitted)) reject('config_escape');
  const configBytes = bytes(emitted);
  const config = JSON.parse(configBytes.toString('utf8'));
  if (!object(config)) reject('config_shape');
  const inventory = Object.entries(config).map(([name, value]) => ({
    ...(PUBLIC_KEYS.has(name) ? { name } : { unknownNameHash: hash(name) }),
    ...shape(value),
  }));
  const receipt = {
    schema: 1,
    diagnosticOnly: true,
    status: 'recorded',
    acceptance: 'unchanged',
    keyCount: inventory.length,
    configHash: hash(configBytes),
    pointerHash: hash(pointerBytes),
    inventoryHash: hash(JSON.stringify(inventory)),
    inventory,
    pointer: {
      form: candidates[0] === native ? 'native' : 'saved',
      nativeRelativeBase: true,
      configPath: pathBits(
        pointer.configPath,
        app,
        dist,
        emitted,
        dirname(native)
      ),
    },
    metadata: {
      configPath: pathBits(config.configPath, app, dist, emitted, app),
      userConfigPath: pathBits(config.userConfigPath, app, dist, emitted, app),
      pathsEqual:
        typeof config.configPath === 'string' &&
        typeof config.userConfigPath === 'string'
          ? config.configPath === config.userConfigPath
          : null,
      definedEnvironmentsAllStrings: Array.isArray(config.definedEnvironments)
        ? config.definedEnvironments.every((item) => typeof item === 'string')
        : null,
    },
    queues: Object.hasOwn(config, 'queues')
      ? queueShape(config.queues)
      : { type: 'absent' },
  };
  try {
    if (!/^[a-f0-9]{40}$/.test(eventSha ?? '')) reject('source_unavailable');
    const head = gitHead(root);
    receipt.source = { head, eventSha, equal: head === eventSha };
    receipt.suppliers = provenance(app);
    receipt.defaultProbe = nativeDefaultProbe(app, config, receipt.suppliers);
  } catch {
    receipt.status = 'unavailable';
    receipt.reason = 'public_provenance_unavailable';
  }
  return receipt;
}

export function bounded(receipt) {
  const serialized = `${JSON.stringify(receipt)}\n`;
  if (Buffer.byteLength(serialized) <= MAX_RECEIPT) return serialized;
  return `${JSON.stringify({
    schema: 1,
    diagnosticOnly: true,
    status: 'unavailable',
    reason: 'overflow',
    keyCount: receipt.keyCount,
    configHash: receipt.configHash,
    pointerHash: receipt.pointerHash,
    inventoryHash: receipt.inventoryHash,
  })}\n`;
}

export function run({ root, appDirectory, eventSha, output, runnerTemp }) {
  let fd;
  try {
    const temp = resolve(runnerTemp);
    const target = resolve(output);
    if (
      realpathSync(temp) !== temp ||
      !within(temp, target) ||
      target === temp ||
      realpathSync(dirname(target)) !== dirname(target)
    )
      reject('unsafe_output');
    // The sole mutation: one explicit, previously absent file. Never mkdir,
    // rewrite a pointer/config, append to GitHub outputs, or follow a link.
    fd = openSync(target, 'wx', 0o600);
    let receipt;
    try {
      receipt = collect({ root: resolve(root), appDirectory, eventSha });
    } catch (error) {
      receipt = {
        schema: 1,
        diagnosticOnly: true,
        status: 'unavailable',
        reason: error.receiptCode ?? 'input_unavailable',
      };
    }
    const serialized = bounded(receipt);
    writeFileSync(fd, serialized);
    const ok = JSON.parse(serialized).status === 'recorded';
    process.stdout.write(ok ? 'receipt=recorded\n' : 'receipt=unavailable\n');
    return ok ? 0 : 1;
  } catch {
    process.stderr.write('receipt=unavailable\n');
    return 1;
  } finally {
    if (fd !== undefined) {
      try {
        closeSync(fd);
      } catch {
        /* The result remains unavailable on write errors. */
      }
    }
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const [appDirectory, eventSha, output] = process.argv.slice(2);
  process.exitCode = run({
    root: process.cwd(),
    appDirectory,
    eventSha,
    output,
    runnerTemp: process.env.RUNNER_TEMP,
  });
}
