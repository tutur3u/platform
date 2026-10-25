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
import { readCalendarFile } from './calendar-cf-files.mjs';
import { validateOutput, verify } from './calendar-native-artifact.mjs';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const posix = (value) => value.split(sep).join('/');
const prefix = '.cloudflare/output/v0/';

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
        entries.push([key, hash(readCalendarFile(path).bytes)]);
      }
    }
  }
  visit(root);
  return Object.fromEntries(entries);
}

async function suppliers(app) {
  const require = createRequire(join(app, 'package.json'));
  const cfPath = require.resolve('cf/package.json');
  const cf = JSON.parse(readFileSync(cfPath));
  const own = JSON.parse(readFileSync(join(app, 'package.json')));
  assert.equal(own.devDependencies.cf, '1.0.0-beta.20');
  assert.equal(cf.version, own.devDependencies.cf);
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

function source(appDirectory, sourceSha, receiptPath) {
  const app = realpathSync(appDirectory);
  const receiptFile = resolve(
    receiptPath ?? join(app, 'calendar-artifact.json')
  );
  const receiptBytes = readCalendarFile(receiptFile).bytes;
  const receipt = JSON.parse(receiptBytes);
  verify(app, receipt, sourceSha);
  const qualified = validateOutput(app, sourceSha);
  const server = join(app, 'dist/server');
  assert.ok(
    qualified.main.startsWith(server + sep),
    'main must remain within server bundle'
  );
  const serverFiles = inventory(server);
  const assets = inventory(qualified.assets);
  const staticFiles = new Set();
  if (typeof serverFiles['.vite/manifest.json'] === 'string') {
    const vite = JSON.parse(
      readCalendarFile(join(server, '.vite/manifest.json')).bytes
    );
    for (const record of Object.values(vite))
      for (const name of [
        record.file,
        ...(record.css ?? []),
        ...(record.assets ?? []),
      ])
        if (/\.(?:css|woff2)$/.test(name)) staticFiles.add(name);
  }
  const configName = posix(relative(server, qualified.configPath));
  const modules = {};
  const excluded = [];
  const serverAssets = {};
  const routedServerAssets = [];
  for (const [name, digest] of Object.entries(serverFiles)) {
    if (digest === null) continue;
    if (name === configName || name === '.vite/manifest.json') {
      excluded.push(name);
      continue;
    }
    if (/\.(?:js|mjs)\.map$/.test(name)) {
      assert.ok(
        typeof serverFiles[name.slice(0, -4)] === 'string',
        'unqualified server file; source map has no ESM module'
      );
      excluded.push(name);
      continue;
    }
    if (staticFiles.has(name)) {
      assert.match(
        name,
        /^assets\/[A-Za-z0-9_-]+-[A-Za-z0-9_-]{8}\.(?:css|woff2)$/,
        'unqualified server file; static asset must be hashed'
      );
      assert.match(digest, /^[a-f0-9]{64}$/);
      assert.equal(
        digest,
        receipt.files[`dist/server/${name}`],
        'server asset differs from sealed source'
      );
      if (Object.hasOwn(assets, name))
        assert.equal(
          digest,
          assets[name],
          'server and client asset bytes differ'
        );
      else serverAssets[name] = digest;
      routedServerAssets.push(name);
      continue;
    }
    assert.match(
      name,
      /\.(?:js|mjs)$/,
      'unqualified server file; only ESM modules are admitted'
    );
    Object.defineProperty(modules, name, {
      value: { type: 'esm' },
      enumerable: true,
    });
  }
  const mainModule = posix(relative(server, qualified.main));
  assert.ok(Object.hasOwn(modules, mainModule), 'main module missing');
  const rootConfig = { buildContext: { mode: 'production', isPreview: false } };
  const workerConfig = {
    name: qualified.config.name,
    compatibilityDate: qualified.config.compatibility_date,
    compatibilityFlags: qualified.config.compatibility_flags,
    workersDev: qualified.config.workers_dev,
    assets: { runWorkerFirst: true, notFoundHandling: 'none' },
    env: { ASSETS: { type: 'assets' } },
    manifest: { type: 'complete', mainModule, modules },
  };
  return {
    app,
    server,
    qualified,
    receipt,
    receiptBytes,
    rootConfig,
    workerConfig,
    assets,
    serverAssets,
    routedServerAssets,
    serverFiles,
    excluded,
  };
}

function expectedFiles(input) {
  const files = new Map([
    [`${prefix}config.json`, Buffer.from(json(input.rootConfig))],
    [
      `${prefix}workers/default/worker.config.json`,
      Buffer.from(json(input.workerConfig)),
    ],
  ]);
  for (const name of Object.keys(input.workerConfig.manifest.modules))
    files.set(
      `${prefix}workers/default/bundle/${name}`,
      readCalendarFile(join(input.server, name)).bytes
    );
  for (const [name, digest] of Object.entries(input.assets)) {
    const target = `${prefix}workers/default/assets/${name}`;
    files.set(
      target,
      digest === null
        ? null
        : readCalendarFile(join(input.qualified.assets, name)).bytes
    );
  }
  for (const name of Object.keys(input.serverAssets))
    files.set(
      `${prefix}workers/default/assets/${name}`,
      readCalendarFile(join(input.server, name)).bytes
    );
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

function parityReceipt(input, versions, files, sourceSha) {
  return {
    schema: 1,
    sourceSha,
    sourceReceiptHash: hash(input.receiptBytes),
    suppliers: versions,
    target: input.workerConfig.name,
    mode: 'production',
    sourceFiles: input.receipt.files,
    outputFiles: expectedInventory(files),
    excludedServerMetadata: input.excluded,
    routedServerAssets: input.routedServerAssets,
    unqualifiedAssetControlFiles: [
      '.assetsignore',
      '_headers',
      '_redirects',
    ].map((path) => ({ path, present: Object.hasOwn(input.assets, path) })),
    accountQualified: false,
    publicationQualified: false,
    secondaryModuleNames: Object.keys(input.workerConfig.manifest.modules)
      .filter((name) => name !== input.workerConfig.manifest.mainModule)
      .map((name) => ({ source: name, cfUpload: `./${name}` })),
  };
}

async function inspect(destination, input, supplied, files, sourceSha) {
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
  assert.deepEqual(
    parsed.rootConfig,
    input.rootConfig,
    'Build Output context differs'
  );
  assert.deepEqual(
    Object.keys(parsed.workers),
    ['default'],
    'unexpected Workers'
  );
  assert.deepEqual(
    parsed.workers.default.config,
    input.workerConfig,
    'Build Output Worker differs'
  );
  assert.deepEqual(parsed.containers, [], 'unexpected containers');
  verify(input.app, input.receipt, sourceSha);
  assert.ok(
    readCalendarFile(resolve(input.app, 'calendar-artifact.json')).bytes.equals(
      input.receiptBytes
    ),
    'source receipt changed'
  );
}

export async function emitCalendarOutput({
  appDirectory,
  sourceSha,
  destination,
}) {
  const input = source(appDirectory, sourceSha);
  const supplied = await suppliers(input.app);
  const target = resolve(destination);
  assert.equal(
    realpathSync(dirname(target)),
    dirname(target),
    'output parent must be canonical'
  );
  assert.ok(
    !target.startsWith(input.app + sep) && target !== input.app,
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
    await inspect(target, input, supplied, files, sourceSha);
    const receipt = parityReceipt(input, supplied.versions, files, sourceSha);
    writeFileSync(join(target, 'parity.json'), json(receipt), { flag: 'wx' });
    return receipt;
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

export async function verifyCalendarOutput({
  appDirectory,
  sourceSha,
  destination,
}) {
  const input = source(appDirectory, sourceSha);
  const supplied = await suppliers(input.app);
  const target = resolve(destination);
  const files = expectedFiles(input);
  await inspect(target, input, supplied, files, sourceSha);
  const receipt = parityReceipt(input, supplied.versions, files, sourceSha);
  assert.deepEqual(
    JSON.parse(readFileSync(join(target, 'parity.json'))),
    receipt,
    'parity receipt differs'
  );
  return receipt;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const [operation, appDirectory, sourceSha, destination, ...extra] =
    process.argv.slice(2);
  assert.ok(
    (operation === 'emit' || operation === 'verify') &&
      appDirectory &&
      sourceSha &&
      destination &&
      extra.length === 0,
    'usage: emit|verify <app> <sha> <new-comparison-root>'
  );
  const run = operation === 'emit' ? emitCalendarOutput : verifyCalendarOutput;
  console.log(
    JSON.stringify(await run({ appDirectory, sourceSha, destination }))
  );
}
