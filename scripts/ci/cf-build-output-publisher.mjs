import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  cpSync,
  lstatSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
} from 'node:fs';
import { join, posix, relative, resolve, sep } from 'node:path';
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

/**
 * Deploy-config rule globs matched against the bundle-relative path:
 * `**\/` spans zero or more directories, `*` and `?` stay within one path
 * segment, and `{a,b}` alternates (nesting allowed). Every other character
 * is literal; backslashes are path separators (see `moduleGlobs`), so there
 * is no escape syntax. Unbalanced braces fail with the offending glob.
 */
export function globToRegExp(glob) {
  return new RegExp(`^${compileGlob(glob, glob)}$`, 'u');
}

function compileGlob(part, glob) {
  let pattern = '';
  for (let index = 0; index < part.length; index += 1) {
    const char = part[index];
    if (char === '*' && part[index + 1] === '*') {
      const slash = part[index + 2] === '/';
      pattern += slash ? '(?:.*/)?' : '.*';
      index += slash ? 2 : 1;
    } else if (char === '*') pattern += '[^/]*';
    else if (char === '?') pattern += '[^/]';
    else if (char === '{') {
      const close = matchingBrace(part, index, glob);
      const options = splitTopLevel(part.slice(index + 1, close));
      pattern += `(?:${options.map((option) => compileGlob(option, glob)).join('|')})`;
      index = close;
    } else {
      assert.ok(char !== '}', `unbalanced "}" in module glob: ${glob}`);
      pattern += char.replace(/[.+^$()|[\]\\{}*?]/gu, '\\$&');
    }
  }
  return pattern;
}

function matchingBrace(part, open, glob) {
  let depth = 0;
  for (let index = open; index < part.length; index += 1) {
    if (part[index] === '{') depth += 1;
    else if (part[index] === '}' && --depth === 0) return index;
  }
  assert.fail(`unclosed "{" in module glob: ${glob}`);
}

function splitTopLevel(body) {
  const options = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < body.length; index += 1) {
    if (body[index] === '{') depth += 1;
    else if (body[index] === '}') depth -= 1;
    else if (body[index] === ',' && depth === 0) {
      options.push(body.slice(start, index));
      start = index + 1;
    }
  }
  options.push(body.slice(start));
  return options;
}

function matchesModuleGlob(rel, globs) {
  return globs.some((glob) => globToRegExp(glob).test(rel));
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

/** The ssr Vite graph: a presence check, never the upload set. */
function viteGraphModules(bundleRoot, mainModule) {
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
    if (!/\.(?:m?js)$/u.test(rel) || rel.endsWith('.map')) continue;
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

/**
 * Relative static and dynamic import specifiers in emitted ESM, including
 * comments inside `import(` (`/* @vite-ignore *\/`) and constant template
 * literals (`import(\`./rsc/bridge-api.js\`)`). Vite RSC loads its second
 * environment this way, and that graph is absent from the ssr manifest.
 */
const RELATIVE_SPECIFIER =
  /(?:\bfrom\s*|\bimport\s*\(\s*(?:\/\*[\s\S]*?\*\/\s*)*|\bimport\s*)(["'`])(\.{1,2}\/[^"'`$\s?#]+)(?:[?#][^"'`]*)?\1/gu;
const DYNAMIC_IMPORT = /\bimport\s*\(\s*(?:\/\*[\s\S]*?\*\/\s*)*/gu;

/**
 * Whether any `import(` takes an argument other than one constant string or
 * template literal (a variable, concatenation or interpolation). Such an
 * import can load any sealed file, so it forbids excluding orphans.
 */
export function hasComputedDynamicImport(source) {
  for (const match of source.matchAll(DYNAMIC_IMPORT)) {
    const start = match.index + match[0].length;
    const quote = source[start];
    if (quote !== '"' && quote !== "'" && quote !== '`') return true;
    const end = source.indexOf(quote, start + 1);
    if (end < 0) return true;
    if (quote === '`' && source.slice(start, end).includes('${')) return true;
    const next = source.slice(end + 1).match(/^\s*(.)/su)?.[1];
    if (next !== ')' && next !== ',') return true;
  }
  return false;
}

/** Bundle-root-relative paths of every relative specifier a module names. */
export function relativeReferences(bundleRoot, rel) {
  const source = readFileSync(join(bundleRoot, rel), 'utf8');
  const references = new Set();
  for (const match of source.matchAll(RELATIVE_SPECIFIER))
    references.add(posix.normalize(posix.join(posix.dirname(rel), match[2])));
  return references;
}

/** Bundle-root-relative `.js`/`.mjs` paths a module's specifiers name. */
export function relativeModuleReferences(bundleRoot, rel) {
  return new Set(
    [...relativeReferences(bundleRoot, rel)].filter((target) =>
      /\.(?:m?js)$/u.test(target)
    )
  );
}

/**
 * Every `.js`/`.mjs` module under the bundle root that the deploy config's
 * rules match, as a `--no-bundle` deploy uploads them. Dot directories and
 * source maps are skipped; symlinks (files or directories) are refused.
 */
export function sealedModules(bundleRoot, config, mainModule) {
  const globs = moduleGlobs(config);
  const modules = [];
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
      if (rel !== mainModule && !matchesModuleGlob(rel, globs)) continue;
      modules.push(rel);
    }
  }
  visit(bundleRoot);
  return modules.sort();
}

/** All `.js`/`.mjs` files under a bundle root, skipping dot directories. */
export function sealedModuleCount(bundleRoot) {
  let count = 0;
  const visit = (directory) => {
    for (const name of readdirSync(directory)) {
      const path = join(directory, name);
      const stat = lstatSync(path);
      if (stat.isDirectory()) {
        if (!name.startsWith('.')) visit(path);
      } else if (stat.isFile() && /\.(?:m?js)$/u.test(name)) count += 1;
    }
  };
  visit(bundleRoot);
  return count;
}

function referenceState(bundleRoot, target) {
  const path = resolve(bundleRoot, target);
  let real;
  try {
    real = realpathSync(path);
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') return 'missing';
    throw error;
  }
  if (!lstatSync(real).isFile()) return 'not-a-file';
  const root = realpathSync(bundleRoot);
  const inside =
    real.startsWith(root + sep) &&
    !target.startsWith('../') &&
    !target.split('/').some((segment) => segment.startsWith('.'));
  return inside ? 'inside' : 'outside';
}

/**
 * Fails when an emitted module imports, by relative path, an existing file
 * that is not emitted. An ES module target fails when it is excluded, outside
 * the bundle root or in a dot directory: the Worker would start and then
 * reject the import on every request that reaches it. A non-ESM target
 * (wasm, text, data) inside the root fails as unsupported by this emit.
 * Missing paths, directories and non-ESM files outside the root pass, since
 * specifier text also appears in comments and strings.
 */
export function assertModuleClosure(bundleRoot, modules) {
  const dropped = [];
  const unsupported = [];
  for (const rel of Object.keys(modules)) {
    for (const target of relativeReferences(bundleRoot, rel)) {
      if (Object.hasOwn(modules, target)) continue;
      const state = referenceState(bundleRoot, target);
      if (state === 'missing' || state === 'not-a-file') continue;
      if (/\.(?:m?js)$/u.test(target)) dropped.push(`${rel} -> ${target}`);
      else if (state === 'inside') unsupported.push(`${rel} -> ${target}`);
    }
  }
  assert.equal(
    dropped.length,
    0,
    `cf Build Output drops imported modules: ${dropped.slice(0, 5).join(', ')}`
  );
  assert.equal(
    unsupported.length,
    0,
    `non-ESM modules are unsupported by this emit: ${unsupported.slice(0, 5).join(', ')}`
  );
}

/**
 * Compares a published version's module names with the emitted manifest.
 * Names are normalized (`./`, `/`, backslashes); duplicates fail. Not yet
 * called by a publish path: see the module discovery docs page.
 */
export function assertUploadedModuleSet(uploadedNames, expectedModules) {
  const normalize = (name) =>
    name.replaceAll('\\', '/').replace(/^(?:\.\/|\/)+/u, '');
  const names = uploadedNames
    .map(normalize)
    .filter((name) => /\.(?:m?js)$/u.test(name));
  const uploaded = new Set(names);
  assert.equal(uploaded.size, names.length, 'uploaded module names repeat');
  const expected = new Set(Object.keys(expectedModules).map(normalize));
  const missing = [...expected].filter((name) => !uploaded.has(name));
  const extra = [...uploaded].filter((name) => !expected.has(name));
  assert.deepEqual(
    { missing: missing.slice(0, 5), extra: extra.slice(0, 5) },
    { missing: [], extra: [] },
    `uploaded modules differ from the emitted manifest (${uploaded.size} uploaded, ${expected.size} expected)`
  );
}

/**
 * The Worker module set for a cf Build Output emit: every sealed module the
 * rules match (`--no-bundle` deploy parity), minus an explicit
 * `excludedOrphans` list. The ssr Vite graph and relative-import closure are
 * independent checks, so a graph the manifest omits (Vite RSC) or a module
 * loaded through a computed path can never be dropped silently.
 */
export function discoverCfBuildOutputEsmModules(
  bundleRoot,
  config,
  mainModule,
  { excludedOrphans = [] } = {}
) {
  const sealed = sealedModules(bundleRoot, config, mainModule);
  assert.ok(sealed.includes(mainModule), 'main module missing from bundle');
  const graph = viteGraphModules(bundleRoot, mainModule);
  const excluded = new Set(excludedOrphans.map(posixPath));
  for (const name of excluded) {
    assert.ok(sealed.includes(name), `excluded orphan not sealed: ${name}`);
    assert.ok(name !== mainModule, 'main module cannot be excluded');
    assert.ok(!graph?.[name], `excluded orphan is in the Vite graph: ${name}`);
  }
  const modules = {};
  for (const name of sealed)
    if (!excluded.has(name)) modules[name] = { type: 'esm' };
  for (const name of Object.keys(graph ?? {}))
    assert.ok(Object.hasOwn(modules, name), `Vite module not emitted: ${name}`);
  if (excluded.size > 0) {
    // A computed dynamic import could load an excluded file.
    for (const name of Object.keys(modules)) {
      const source = readFileSync(join(bundleRoot, name), 'utf8');
      assert.ok(
        !hasComputedDynamicImport(source),
        `computed dynamic import in ${name} forbids excluding orphans`
      );
    }
  }
  assertModuleClosure(bundleRoot, modules);
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
  // Source maps the emit kept ship with the version, so they count against
  // Cloudflare's source map limits exactly as uploaded.
  const maps = [];
  function visit(directory, root) {
    for (const name of readdirSync(directory)) {
      const path = join(directory, name);
      const stat = lstatSync(path);
      if (stat.isDirectory()) visit(path, root);
      else if (name.endsWith('.map')) maps.push({ bytes: stat.size, path });
      else if (/\.(?:m?js)$/u.test(name)) {
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
      enabled: maps.length > 0,
      count: maps.length,
      encodedBytes: maps.reduce((total, item) => total + item.bytes, 0),
      gzipBytes:
        maps.length > 0
          ? gzipSync(Buffer.concat(maps.map((item) => readFileSync(item.path))))
              .length
          : 0,
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

export function cfChildEnv(env, { cfToken, accountId, dryRun } = {}) {
  return {
    ...Object.fromEntries(
      CF_ENV_KEYS.flatMap((name) =>
        env[name] === undefined ? [] : [[name, env[name]]]
      )
    ),
    CI: 'true',
    CF_SEND_TELEMETRY: 'false',
    ...(dryRun && env.DEBUG === undefined ? { DEBUG: 'cf:*' } : {}),
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
  cfCli,
  exec = execFileSync,
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
    const result = exec(cfCli ?? 'bun', cfCli ? args.slice(3) : args, {
      cwd,
      env: cfChildEnv(env, { cfToken, accountId, dryRun }),
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
