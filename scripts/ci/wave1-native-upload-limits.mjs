import assert from 'node:assert/strict';
import { lstatSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from 'node:path';
import { gzipSync } from 'node:zlib';

// Workers Paid confirmed by the release owner. Documentation read 2026-10-27:
// https://developers.cloudflare.com/workers/platform/limits/#worker-size
// https://developers.cloudflare.com/workers/observability/source-maps/#limits
// There is no compressed Worker-size limit. Startup CPU is a hosted acceptance gate.
export const uploadLimits = Object.freeze({
  checkedOn: '2026-10-27',
  plan: 'paid',
  scriptBytes: 64 * 1024 ** 2,
  sourcemapEncodedBytes: 60 * 1024 ** 2,
  sourcemapGzipBytes: 15 * 1024 ** 2,
  assetCount: 100000,
  assetBytes: 25 * 1024 ** 2,
  variableCount: 128,
  variableBytes: 5000,
  startupCpuMs: 1000,
});

function files(root) {
  assert.equal(realpathSync(root), root, 'Measurement root must be canonical');
  const result = [];
  function visit(directory) {
    for (const name of readdirSync(directory).sort()) {
      const path = join(directory, name);
      const stat = lstatSync(path);
      assert.ok(!stat.isSymbolicLink(), 'Measurement symlink forbidden');
      if (stat.isDirectory()) visit(path);
      else {
        assert.ok(stat.isFile(), 'Only regular upload files supported');
        result.push({ name: relative(root, path), bytes: stat.size, path });
      }
    }
  }
  visit(root);
  return result;
}
const sum = (items) => items.reduce((total, item) => total + item.bytes, 0);
const maximum = (items) =>
  items.reduce((n, item) => Math.max(n, item.bytes), 0);

function sourceMaps(configPath, config, modules) {
  if (config.upload_source_maps === false) return [];
  const dist = resolve(dirname(configPath), '..');
  const main = resolve(dirname(configPath), config.main);
  const clean = (path) =>
    path
      .replace(/^\.\.\\/u, '')
      .replace(/^\.\.\//u, '')
      .replace(/^\.\\/u, '')
      .replace(/^\.\//u, '');
  const maps = [];
  for (const module of modules) {
    const lines = readFileSync(module.path, 'utf8').split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (!line) continue;
      const prefix = '//# sourceMappingURL=';
      if (line.startsWith(prefix)) {
        const reference = line.slice(prefix.length).trim();
        assert.ok(
          !/^[a-z]+:/iu.test(reference),
          'Unsupported source map reference'
        );
        const original =
          module.name === basename(main)
            ? main
            : resolve(dirname(main), module.name);
        const path = resolve(dirname(original), reference);
        const rel = relative(dist, path);
        assert.ok(
          rel && !rel.startsWith('..') && !isAbsolute(rel),
          'Source map escapes sealed output'
        );
        assert.equal(realpathSync(path), path, 'Source map symlink forbidden');
        const map = JSON.parse(readFileSync(path, 'utf8'));
        map.file = module.name;
        if (map.sourceRoot) map.sourceRoot = clean(map.sourceRoot);
        map.sources = map.sources.map(clean);
        maps.push(Buffer.from(JSON.stringify(map)));
        break;
      }
      if (!line.startsWith('//#') && !line.startsWith('//@')) break;
    }
  }
  return maps;
}

/** Measure the actual token-free CLI outdir, never an estimate from source imports. */
export function measureUpload(configPath, outdir, secretNames = [], cliSize) {
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  const emitted = files(outdir).filter((file) => file.name !== 'README.md');
  const mapFiles = emitted.filter((file) => file.name.endsWith('.map'));
  const modules = emitted.filter((file) => !file.name.endsWith('.map'));
  assert.ok(modules.length > 0, 'Empty Worker upload output');
  const scriptBytes = sum(modules);
  const maps =
    scriptBytes <= uploadLimits.scriptBytes
      ? sourceMaps(configPath, config, modules)
      : [];
  const mapBytes = maps.reduce((total, bytes) => total + bytes.length, 0);
  // Avoid reading an already oversized candidate into memory; retain exact stat sizes.
  const gzipBytes = cliSize
    ? cliSize.gzip_bytes
    : scriptBytes <= uploadLimits.scriptBytes
      ? gzipSync(Buffer.concat(modules.map((file) => readFileSync(file.path))))
          .length
      : null;
  if (cliSize) {
    assert.equal(
      cliSize.raw_bytes,
      scriptBytes,
      'CLI module inventory size differs'
    );
    assert.ok(
      Number.isSafeInteger(gzipBytes) && gzipBytes >= 0,
      'Invalid CLI gzip measurement'
    );
  }
  const mapGzipBytes =
    mapBytes <= uploadLimits.sourcemapEncodedBytes
      ? maps.reduce((total, bytes) => total + gzipSync(bytes).length, 0)
      : null;
  const assetsRoot = resolve(dirname(configPath), config.assets.directory);
  const assets = files(assetsRoot).filter(
    (file) =>
      !file.name
        .split('/')
        .some((name) =>
          ['.assetsignore', basename(configPath), '.dev.vars'].includes(name)
        )
  );
  const vars = Object.values(config.vars ?? {});
  const plainSizes = vars.map((value) =>
    Buffer.byteLength(typeof value === 'string' ? value : JSON.stringify(value))
  );
  return {
    schema: 1,
    limits: uploadLimits,
    script: {
      bytes: scriptBytes,
      gzipBytes,
      gzipOrder: cliSize
        ? 'pinned CLI module order'
        : 'lexicographic emitted module paths',
      moduleCount: modules.length,
      maxModuleBytes: maximum(modules),
      modules: modules.map(({ name, bytes }) => ({ name, bytes })),
    },
    sourcemaps: {
      enabled: config.upload_source_maps !== false,
      count: maps.length,
      encodedBytes: mapBytes,
      gzipBytes: mapGzipBytes,
      unexpectedFiles:
        config.upload_source_maps === false ? mapFiles.length : 0,
      measured:
        scriptBytes <= uploadLimits.scriptBytes ||
        config.upload_source_maps === false,
    },
    assets: {
      count: assets.length,
      maxFileBytes: maximum(assets),
    },
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

export class UploadLimitsError extends Error {
  constructor(measurements, failures) {
    super(`Documented upload limits exceeded: ${failures.join(', ')}`);
    this.measurements = measurements;
  }
}
export function assertUploadLimits(measurements) {
  assert.equal(measurements?.schema, 1, 'Missing upload measurements');
  assert.deepEqual(measurements.limits, uploadLimits, 'Upload limits changed');
  assert.equal(
    measurements.script.moduleCount,
    measurements.script.modules.length
  );
  assert.equal(measurements.script.bytes, sum(measurements.script.modules));
  assert.equal(
    measurements.script.maxModuleBytes,
    maximum(measurements.script.modules)
  );
  const failures = [];
  for (const [name, actual, limit] of [
    ['script bytes', measurements.script.bytes, uploadLimits.scriptBytes],
    [
      'source map encoded bytes',
      measurements.sourcemaps.encodedBytes,
      uploadLimits.sourcemapEncodedBytes,
    ],
    [
      'source map gzip bytes',
      measurements.sourcemaps.gzipBytes,
      uploadLimits.sourcemapGzipBytes,
    ],
    ['asset count', measurements.assets.count, uploadLimits.assetCount],
    ['asset bytes', measurements.assets.maxFileBytes, uploadLimits.assetBytes],
    [
      'variable count',
      measurements.variables.count,
      uploadLimits.variableCount,
    ],
    [
      'variable bytes',
      measurements.variables.maxPlainValueBytes,
      uploadLimits.variableBytes,
    ],
  ]) {
    if (actual === null) {
      assert.ok(
        name === 'source map gzip bytes' &&
          measurements.sourcemaps.encodedBytes >
            uploadLimits.sourcemapEncodedBytes,
        'Missing compressed source map measurement'
      );
      continue;
    }
    assert.ok(
      Number.isSafeInteger(actual) && actual >= 0,
      'Invalid size measurement'
    );
    if (actual > limit) failures.push(`${name} ${actual} > ${limit}`);
  }
  assert.ok(
    measurements.sourcemaps.enabled ||
      (measurements.sourcemaps.count === 0 &&
        !measurements.sourcemaps.unexpectedFiles),
    'Source maps emitted despite explicit upload opt-out'
  );
  if (failures.length) throw new UploadLimitsError(measurements, failures);
  return measurements;
}
