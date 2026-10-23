import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertNoRuntimeResources } from '../../apps/apps/cloudflare/native-runtime-fence.mjs';
import { readRegularFile } from '../safe-fs.js';
import { readNativeRuntimeConfig } from './apps-native-runtime-pointer.mjs';
import {
  captureDiagnosticSnapshot,
  diagnosticError,
  persistFinalization,
} from './native-wrangler-evidence.mjs';
import {
  assertTempContents,
  sealArtifact,
} from './native-wrangler-runtime.mjs';

// Required trust pins; their presence here does not qualify an installed supplier.
export const APPS_SUPPLIER = Object.freeze({
  wranglerVersion: '4.151.2',
  wranglerSha256:
    '507cd3644d6a53f0d66922d79c04b03557b7d2d0a376d2d906b92ed20812bb30',
  miniflareVersion: '5.20261019.0-beta',
  miniflareSha256:
    '309b8863f0f4c3050e173e945b4c696db8c330cdf3f35f0ecfd8417d75891eaa',
});
export const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
export function within(root, path) {
  const rel = relative(root, path);
  assert.ok(
    rel && !rel.startsWith('..') && !isAbsolute(rel),
    'Path escaped Apps custody'
  );
  return path;
}
function freeze(value) {
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) freeze(item);
    Object.freeze(value);
  }
  return value;
}
export function appsRoles(mode) {
  assert.ok(['http', 'browser'].includes(mode), 'Closed Apps mode');
  return mode === 'http' ? ['app', 'negative'] : ['app'];
}
export function verifyAppsArtifact(plan) {
  execFileSync(
    'python3',
    [
      fileURLToPath(new URL('./apps-native-artifact.py', import.meta.url)),
      'verify',
      plan.appDirectory,
      '--receipt',
      plan.artifactReceipt,
    ],
    {
      stdio: 'pipe',
      env: {
        PATH: process.env.PATH,
        APPS_SOURCE_SHA: plan.sourceSHA,
        PYTHONDONTWRITEBYTECODE: '1',
      },
    }
  );
}

const VITE_DIRECTORY = 'server/.vite';
const VITE_MANIFEST = `${VITE_DIRECTORY}/manifest.json`;
const MAX_MANIFEST_BYTES = 1024 * 1024;
const MANIFEST_FIELDS = new Set([
  'file',
  'name',
  'src',
  'isEntry',
  'isDynamicEntry',
  'imports',
  'dynamicImports',
  'css',
  'assets',
]);
function metadataString(value) {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 1024 &&
    [...value].every((character) => {
      const code = character.codePointAt(0);
      return code >= 32 && code !== 127;
    })
  );
}
export function validateAppsViteManifest(bytes, seal) {
  assert.ok(
    bytes.length <= MAX_MANIFEST_BYTES,
    'Apps Vite manifest byte bound'
  );
  let manifest;
  try {
    manifest = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new Error('Malformed Apps Vite manifest');
  }
  assert.ok(
    manifest && typeof manifest === 'object' && !Array.isArray(manifest),
    'Apps Vite manifest object required'
  );
  const entries = Object.entries(manifest);
  assert.ok(
    entries.length > 0 && entries.length <= 512,
    'Apps Vite manifest entry bound'
  );
  for (const [name, entry] of entries) {
    assert.ok(metadataString(name), 'Invalid Apps Vite manifest key');
    assert.ok(
      entry && typeof entry === 'object' && !Array.isArray(entry),
      'Apps Vite manifest entry object required'
    );
    assert.ok(
      Object.keys(entry).every((key) => MANIFEST_FIELDS.has(key)),
      'Unknown Apps Vite manifest field'
    );
    assert.ok(
      Object.hasOwn(entry, 'file'),
      'Incomplete Apps Vite manifest entry'
    );
    const files = [entry.file];
    for (const key of ['css', 'assets', 'imports', 'dynamicImports']) {
      if (!Object.hasOwn(entry, key)) continue;
      assert.ok(
        Array.isArray(entry[key]) && entry[key].length <= 512,
        'Apps Vite manifest reference array required'
      );
      for (const value of entry[key]) {
        assert.ok(
          metadataString(value),
          'Invalid Apps Vite manifest reference'
        );
        if (key === 'css' || key === 'assets') files.push(value);
        else
          assert.ok(
            Object.hasOwn(manifest, value),
            'Missing own Apps Vite manifest import'
          );
      }
    }
    for (const value of files) {
      assert.ok(
        metadataString(value) &&
          !value.includes('\\') &&
          value
            .split('/')
            .every((part) => part && part !== '..' && !part.startsWith('.')),
        'Escaping Apps Vite manifest file'
      );
      const target = `server/${value}`;
      assert.ok(
        Object.hasOwn(seal, target) &&
          typeof seal[target] === 'string' &&
          /^[a-f0-9]{64}$/.test(seal[target]),
        'Apps Vite manifest file must be sealed'
      );
    }
    for (const key of ['name', 'src'])
      if (Object.hasOwn(entry, key))
        assert.ok(
          metadataString(entry[key]),
          'Invalid Apps Vite manifest metadata'
        );
    for (const key of ['isEntry', 'isDynamicEntry'])
      if (Object.hasOwn(entry, key))
        assert.equal(
          typeof entry[key],
          'boolean',
          'Invalid Apps Vite manifest flag'
        );
  }
  return manifest;
}

// Preserve .assetsignore admission. Only this observed server metadata directory
// is newly admitted; SDK workdirs remain separately inventoried exact exclusions.
export async function inventoryApps(root, ignored) {
  assert.equal(await realpath(root), root);
  const files = [];
  let manifest;
  async function walk(directory) {
    for (const item of (await readdir(directory, { withFileTypes: true })).sort(
      (a, b) => a.name.localeCompare(b.name)
    )) {
      const path = join(directory, item.name),
        name = relative(root, path);
      if (name === ignored) continue;
      assert.ok(
        !item.name.startsWith('.') ||
          item.name === '.assetsignore' ||
          name === VITE_DIRECTORY,
        'Unadmitted hidden artifact entry'
      );
      if (name === VITE_DIRECTORY) {
        assert.ok(item.isDirectory(), 'Apps Vite metadata must be a directory');
        const children = await readdir(path, { withFileTypes: true });
        assert.deepEqual(
          children.map((child) => child.name),
          ['manifest.json'],
          'Incomplete or extra Apps Vite metadata'
        );
        assert.ok(
          children[0].isFile(),
          'Apps Vite manifest must be a regular file'
        );
      }
      if (item.isDirectory()) {
        files.push([`${name}/`, null]);
        await walk(path);
      } else {
        assert.ok(item.isFile(), 'Artifact links/special entries forbidden');
        const bytes = await readRegularFile(path, {
          maxBytes: name === VITE_MANIFEST ? MAX_MANIFEST_BYTES : Infinity,
        }).catch((error) => {
          if (
            name === VITE_MANIFEST &&
            error.message === 'Input size cap exceeded'
          )
            assert.fail('Apps Vite manifest byte bound');
          throw error;
        });
        files.push([name, hash(bytes)]);
        if (name === VITE_MANIFEST) manifest = bytes;
      }
    }
  }
  await walk(root);
  const seal = Object.fromEntries(files);
  if (manifest) validateAppsViteManifest(manifest, seal);
  return seal;
}
async function fileHash(path) {
  assert.equal(await realpath(path), path);
  return hash(await readRegularFile(path));
}
export async function inspectAppsPlan(
  { appDirectory, ownerPackage, sourceSHA, artifactReceipt },
  io = {}
) {
  assert.match(sourceSHA ?? '', /^[a-f0-9]{40}$/);
  appDirectory = await realpath(appDirectory);
  assert.equal(
    ownerPackage,
    join(appDirectory, 'package.json'),
    'Owning Apps package required'
  );
  assert.ok(
    isAbsolute(artifactReceipt),
    'Absolute sealed artifact receipt required'
  );
  artifactReceipt = await realpath(artifactReceipt);
  const repository = resolve(appDirectory, '../..');
  const head = (
    io.checkout ??
    (() =>
      execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: repository,
        encoding: 'utf8',
      }).trim())
  )();
  assert.equal(head, sourceSHA, 'Checkout/source identity mismatch');
  const base = { appDirectory, ownerPackage, sourceSHA, artifactReceipt };
  (io.verify ?? verifyAppsArtifact)(base);
  const receipt = JSON.parse(await readFile(artifactReceipt));
  assert.equal(receipt.sourceSha, sourceSHA, 'Wrong artifact receipt source');
  const { configPath, config } = readNativeRuntimeConfig(appDirectory);
  assertNoRuntimeResources(config);
  assert.equal(
    Object.hasOwn(config.vars, 'PLATFORM_BUILD_COMMIT_HASH'),
    false,
    'Runtime build identity injection forbidden'
  );
  const root = join(appDirectory, 'dist');
  const main = within(root, resolve(dirname(configPath), config.main));
  const assets = within(
    root,
    resolve(dirname(configPath), config.assets.directory)
  );
  const pointers = [
    '.wrangler/deploy/config.json',
    '.void/preview-deploy-config.json',
  ];
  const pointerPath = pointers
    .map((name) => join(appDirectory, name))
    .find((path) => Object.hasOwn(receipt.files, relative(appDirectory, path)));
  assert.ok(pointerPath, 'Receipt must seal the actual pointer');
  const seal = await inventoryApps(root);
  if (Object.hasOwn(seal, `${VITE_DIRECTORY}/`)) {
    assert.equal(
      relative(root, configPath),
      'server/wrangler.json',
      'Apps Vite metadata/config layout mismatch'
    );
    assert.equal(dirname(main), join(root, 'server'));
    assert.equal(assets, join(root, 'client'));
  }
  const lockPath = join(repository, 'bun.lock');
  const identities = {};
  for (const path of [ownerPackage, lockPath, artifactReceipt, pointerPath])
    identities[path] = await fileHash(path);
  const plan = {
    ...base,
    root,
    configPath,
    config,
    main,
    assets,
    lockPath,
    pointerPath,
    configRelative: relative(root, configPath),
    supplierPins: APPS_SUPPLIER,
    seal,
    identities,
  };
  await assertAppsOriginal(plan, io.verify);
  return freeze(plan);
}
export async function assertAppsOriginal(plan, verify = verifyAppsArtifact) {
  verify(plan);
  const { configPath, config } = readNativeRuntimeConfig(plan.appDirectory);
  assert.equal(configPath, plan.configPath);
  assert.deepEqual(config, plan.config);
  assertNoRuntimeResources(config);
  assert.deepEqual(
    await inventoryApps(plan.root),
    plan.seal,
    'Original artifact mutation'
  );
  for (const [path, digest] of Object.entries(plan.identities))
    assert.equal(
      await fileHash(path),
      digest,
      'Owner/lock/pointer/receipt identity changed'
    );
}

export async function prepareAppsSessions(plan, context, mode) {
  await assertAppsOriginal(plan);
  await assertTempContents(context.tempRoot);
  const scratch = await realpath(
    await mkdtemp(join(context.tempRoot, 'apps-sessions-'))
  );
  const roles = {};
  for (const role of appsRoles(mode)) {
    const root = join(scratch, role);
    await mkdir(root, { mode: 0o700 });
    for (const name of Object.keys(plan.seal)) {
      const destination = within(root, join(root, name));
      await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
      if (name.endsWith('/')) await mkdir(destination, { recursive: true });
      else
        await copyFile(within(plan.root, join(plan.root, name)), destination);
    }
    const registry = join(scratch, `${role}-registry`);
    await mkdir(registry, { mode: 0o700 });
    roles[role] = { root, config: join(root, plan.configRelative), registry };
  }
  const evidenceRoot = join(scratch, 'source-evidence');
  await mkdir(evidenceRoot);
  await copyFile(plan.pointerPath, join(evidenceRoot, 'deploy-pointer.json'));
  await copyFile(
    plan.artifactReceipt,
    join(evidenceRoot, 'artifact-receipt.json')
  );
  const envFile = join(scratch, 'synthetic.env');
  await writeFile(envFile, '', { flag: 'wx', mode: 0o600 });
  const prepared = {
    ...context,
    mode,
    scratch,
    roles,
    evidenceRoot,
    envFile,
    evidenceSeal: await sealArtifact(evidenceRoot),
  };
  await assertAppsCopies(plan, prepared, true);
  await assertAppsOriginal(plan);
  return prepared;
}
export async function assertAppsCopies(plan, prepared, beforeLoad = false) {
  const roles = appsRoles(prepared.mode);
  assert.deepEqual(Object.keys(prepared.roles), roles);
  assert.deepEqual(
    (await readdir(prepared.scratch)).sort(),
    [
      ...roles,
      ...roles.map((role) => `${role}-registry`),
      'source-evidence',
      'synthetic.env',
    ].sort()
  );
  assert.equal(
    prepared.evidenceRoot,
    join(prepared.scratch, 'source-evidence')
  );
  assert.equal(prepared.envFile, join(prepared.scratch, 'synthetic.env'));
  assert.equal(await readFile(prepared.envFile, 'utf8'), '');
  assert.deepEqual(
    await sealArtifact(prepared.evidenceRoot),
    prepared.evidenceSeal
  );
  for (const [name, source] of [
    ['deploy-pointer.json', plan.pointerPath],
    ['artifact-receipt.json', plan.artifactReceipt],
  ])
    assert.equal(
      await fileHash(join(prepared.evidenceRoot, name)),
      plan.identities[source]
    );
  for (const role of roles) {
    const copy = prepared.roles[role];
    assert.deepEqual(Object.keys(copy).sort(), ['config', 'registry', 'root']);
    assert.equal(copy.root, join(prepared.scratch, role));
    assert.equal(copy.config, join(copy.root, plan.configRelative));
    assert.equal(copy.registry, join(prepared.scratch, `${role}-registry`));
    assert.equal(await realpath(copy.registry), copy.registry);
    if (beforeLoad) await assertTempContents(copy.registry);
    const ignored = beforeLoad
      ? undefined
      : relative(copy.root, join(dirname(copy.config), '.wrangler'));
    assert.deepEqual(
      await inventoryApps(copy.root, ignored),
      plan.seal,
      'Copied artifact mutation'
    );
    assert.deepEqual(JSON.parse(await readFile(copy.config)), plan.config);
  }
}

export async function inventoryAppsWorkdir(path) {
  const entries = [];
  async function walk(path, name) {
    const info = await lstat(path);
    assert.ok(
      info.isDirectory() || info.isFile(),
      'SDK link/special file forbidden'
    );
    entries.push({
      name,
      type: info.isDirectory() ? 'directory' : 'file',
      hash: info.isFile() ? hash(await readRegularFile(path)) : null,
    });
    if (info.isDirectory())
      for (const child of (await readdir(path)).sort())
        await walk(join(path, child), `${name}/${child}`);
  }
  try {
    await lstat(path);
  } catch (error) {
    if (error.code === 'ENOENT') return entries;
    throw error;
  }
  await walk(path, '');
  return entries;
}

export function createAppsFinalizer(plan, prepared, io = {}) {
  let completion;
  return (gates = [], records = {}) =>
    (completion ??= (async () => {
      const errors = [...gates],
        phases = {},
        inventories = {};
      async function check(name, run) {
        try {
          await run();
          phases[name] = { ok: true };
        } catch (error) {
          errors.push(error);
          phases[name] = { ok: false, error };
        }
      }
      await check('residual', () =>
        assertTempContents(prepared.tempRoot, [basename(prepared.scratch)])
      );
      await check('originalSeal', () => assertAppsOriginal(plan, io.verify));
      await check('copySeal', () => assertAppsCopies(plan, prepared));
      for (const [name, role] of Object.entries(prepared.roles)) {
        await check(`${name}Registry`, () => assertTempContents(role.registry));
        await check(`${name}Workdir`, async () => {
          inventories[name] = await inventoryAppsWorkdir(
            join(dirname(role.config), '.wrangler')
          );
        });
      }
      await check('foreign', async () =>
        assert.equal(
          await readFile(prepared.foreignPath, 'utf8'),
          prepared.foreignValue
        )
      );
      let snapshot;
      await check('snapshot', async () => {
        snapshot = await (io.snapshot ?? captureDiagnosticSnapshot)(prepared, {
          ...records,
          inventories,
          gates: gates.map(diagnosticError),
          phases,
        });
      });
      await check('persistence', async () => {
        const destination = join(prepared.caseRoot, 'pre-finalization.json');
        const bytes = JSON.stringify({
          sourceSHA: plan.sourceSHA,
          snapshot,
          errors: errors.map(diagnosticError),
        });
        await (io.write ?? writeFile)(destination, bytes, {
          flag: 'wx',
          mode: 0o600,
        });
        assert.equal(
          await readFile(destination, 'utf8'),
          bytes,
          'Pre-removal persistence readback'
        );
      });
      const context = {
        ...records,
        internalCleanup: 'UNKNOWN',
        descendantClosure: 'UNKNOWN',
      };
      await check('finalizationPersistence', () =>
        (io.persist ?? persistFinalization)(
          prepared,
          { phases, errors, snapshot },
          { ...context, stage: 'before-removal' }
        )
      );
      if (!errors.length)
        await check('removal', async () => {
          await (io.remove ?? rm)(prepared.scratch, { recursive: true });
          await assert.rejects(realpath(prepared.scratch), { code: 'ENOENT' });
          await assertTempContents(prepared.tempRoot);
          assert.equal(
            await readFile(prepared.foreignPath, 'utf8'),
            prepared.foreignValue
          );
        });
      const result = { phases, errors, snapshot };
      // Both owned destinations were independently created/read back before removal.
      // Rewrite their final phase observations; any failure still fails qualification.
      await persistFinalization(
        prepared,
        result,
        { ...context, stage: 'after-removal-check' },
        {
          writeFile: (path, bytes, options) =>
            writeFile(path, bytes, { ...options, flag: 'w' }),
          readFile,
        }
      );
      return result;
    })());
}
