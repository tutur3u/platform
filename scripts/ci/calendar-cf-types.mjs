// biome-ignore-all lint/suspicious/noUndeclaredEnvVars: finite CLI subprocess PATH, not a cached task input.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  qualifyDeclarations,
  standaloneDeclaration,
} from './calendar-cf-types-proof.mjs';
import { manifest, validateOutput } from './calendar-native-artifact.mjs';

const PIN = '1.0.0-beta.20';
const digest = (value) => createHash('sha256').update(value).digest('hex');

function regular(path) {
  const stat = lstatSync(path);
  assert.ok(
    stat.isFile() && !stat.isSymbolicLink(),
    'regular type-generation file required'
  );
  assert.equal(
    realpathSync(path),
    path,
    'type-generation path must be canonical'
  );
  const bytes = readFileSync(path);
  assert.ok(bytes.length > 0, 'empty type-generation file');
  return { bytes, stat };
}

function immutableFiles(app, sha) {
  const { 'cloudflare-env.d.ts': _declaration, ...files } = manifest(
    app,
    sha
  ).files;
  return files;
}

function resolveSuppliers(app) {
  const require = createRequire(join(app, 'package.json'));
  const cfManifest = require.resolve('cf/package.json');
  const cf = JSON.parse(readFileSync(cfManifest, 'utf8'));
  const own = JSON.parse(readFileSync(join(app, 'package.json'), 'utf8'));
  assert.equal(
    own.devDependencies?.cf,
    PIN,
    'Calendar must own the exact cf pin'
  );
  assert.equal(cf.version, PIN, 'unexpected cf supplier');
  const tsManifest = require.resolve('typescript/package.json');
  const ts = JSON.parse(readFileSync(tsManifest, 'utf8'));
  return {
    cli: resolve(dirname(cfManifest), cf.bin.cf),
    compiler: resolve(dirname(tsManifest), ts.bin.tsc),
    workersTypes: require.resolve('@cloudflare/workers-types/index.d.ts'),
  };
}

export function requireSupportedNode(version) {
  const [major, minor] = version.split('.').map(Number);
  assert.ok(
    (major === 22 && minor >= 23) ||
      (major === 24 && minor >= 22) ||
      (major === 26 && minor >= 12),
    'cf beta.20 requires Node ^22.23 || ^24.22 || ^26.12'
  );
}

export function generateCalendarTypes({
  appDirectory,
  configPath,
  referencePath,
  sourceSha,
  execute = spawnSync,
  nodeVersion = process.versions.node,
  replace = renameSync,
}) {
  requireSupportedNode(nodeVersion);
  const app = realpathSync(appDirectory);
  const cache = join(app, '.cloudflare');
  mkdirSync(cache, { recursive: true });
  assert.equal(
    realpathSync(cache),
    cache,
    'type-generation cache must not be symlinked'
  );
  const custody = join(cache, 'calendar-types.lock');
  try {
    mkdirSync(custody);
  } catch (error) {
    if (error.code === 'EEXIST')
      throw new Error('Calendar declaration publication custody is held');
    throw error;
  }
  try {
    return generateUnderCustody({
      app,
      cache,
      configPath,
      referencePath,
      sourceSha,
      execute,
      nodeVersion,
      replace,
    });
  } finally {
    rmdirSync(custody);
  }
}

function generateUnderCustody({
  app,
  cache,
  configPath,
  referencePath,
  sourceSha,
  execute,
  nodeVersion,
  replace,
}) {
  const qualified = validateOutput(app, sourceSha);
  if (configPath !== undefined)
    assert.equal(
      realpathSync(configPath),
      qualified.configPath,
      'type input differs from qualified emitted config'
    );
  const sha =
    sourceSha ??
    execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: app,
      encoding: 'utf8',
    }).trim();
  const before = immutableFiles(app, sha);
  const output = join(app, 'cloudflare-env.d.ts');
  const previous = regular(output);
  const reference =
    referencePath === undefined
      ? undefined
      : regular(resolve(referencePath)).bytes.toString('utf8');
  const suppliers = resolveSuppliers(app);
  const stage = mkdtempSync(join(cache, 'calendar-types-'));
  const temporary = `${output}.cf-${randomUUID()}`;
  try {
    const { config } = qualified;
    writeFileSync(
      join(stage, 'cloudflare.config.ts'),
      `import { bindings, defineConfig } from 'cf/config';
export default defineConfig({ worker: {
  name: ${JSON.stringify(config.name)},
  compatibilityDate: ${JSON.stringify(config.compatibility_date)},
  compatibilityFlags: ${JSON.stringify(config.compatibility_flags)},
  workersDev: ${JSON.stringify(config.workers_dev)},
  env: { ASSETS: bindings.assets() }
} });\n`
    );
    const result = execute(
      process.execPath,
      [
        suppliers.cli,
        'workers',
        'types',
        '--no-include-runtime',
        '--mode',
        'production',
      ],
      {
        cwd: stage,
        encoding: 'utf8',
        env: { PATH: process.env.PATH, CF_SEND_TELEMETRY: 'false' },
        timeout: 120_000,
      }
    );
    assert.ifError(result.error);
    assert.equal(result.signal, null, 'cf types interrupted');
    assert.equal(result.status, 0, 'cf workers types failed');
    const generated = regular(
      join(stage, '.cloudflare/types/index.d.ts')
    ).bytes.toString('utf8');
    const declaration = standaloneDeclaration(output, qualified.main);
    qualifyDeclarations({
      stage,
      generated,
      candidate: declaration,
      reference,
      ...suppliers,
      execute,
    });
    const after = immutableFiles(app, sha);
    assert.deepEqual(
      after,
      before,
      'type generation changed emitted artifact bytes'
    );
    writeFileSync(temporary, declaration, {
      flag: 'wx',
      mode: previous.stat.mode & 0o777,
    });
    const current = regular(output);
    assert.ok(
      current.stat.ino === previous.stat.ino &&
        current.stat.dev === previous.stat.dev &&
        current.bytes.equals(previous.bytes),
      'declaration changed concurrently'
    );
    replace(temporary, output);
    return {
      schema: 1,
      app: 'calendar',
      sourceSha: sha,
      cf: PIN,
      node: nodeVersion,
      runtimeTypes: false,
      referenceCompared: reference !== undefined,
      configHash: digest(readFileSync(qualified.configPath)),
      artifactBefore: digest(JSON.stringify(before)),
      artifactAfter: digest(JSON.stringify(after)),
      declarationHash: digest(declaration),
    };
  } finally {
    rmSync(temporary, { force: true });
    rmSync(stage, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const options = { appDirectory: process.cwd() };
  const flags = {
    '--app': 'appDirectory',
    '--config': 'configPath',
    '--reference': 'referencePath',
    '--sha': 'sourceSha',
  };
  const seen = new Set();
  for (let index = 2; index < process.argv.length; index++) {
    const flag = process.argv[index];
    assert.ok(Object.hasOwn(flags, flag), 'invalid Calendar cf types argument');
    const key = flags[flag];
    const value = process.argv[++index];
    assert.ok(
      key && value && !value.startsWith('--'),
      'invalid Calendar cf types arguments'
    );
    assert.ok(!seen.has(key), 'duplicate Calendar cf types argument');
    seen.add(key);
    options[key] = value;
  }
  console.log(JSON.stringify(generateCalendarTypes(options)));
}
