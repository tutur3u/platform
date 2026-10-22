import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  assertAppsCopies,
  assertAppsOriginal,
  hash,
  inspectAppsPlan,
  inventoryApps,
  prepareAppsSessions,
  validateAppsViteManifest,
} from './apps-native-runtime-plan.mjs';

const sourceSHA = 'a'.repeat(40);
const valid = {
  'src/index.ts': {
    file: 'index.mjs',
    name: 'index',
    src: 'src/index.ts',
    isEntry: true,
    imports: ['_chunk.mjs'],
    dynamicImports: [],
    css: ['styles.css'],
    assets: [],
  },
  '_chunk.mjs': { file: 'chunk.mjs', isDynamicEntry: false },
};
async function fixture(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'apps-hidden-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'server/.vite'), { recursive: true });
  await mkdir(join(root, 'client'));
  for (const name of ['index.mjs', 'chunk.mjs', 'styles.css'])
    await writeFile(join(root, 'server', name), 'public fixture');
  await writeFile(
    join(root, 'client/.assetsignore'),
    'wrangler.json\n.dev.vars\n'
  );
  const manifest = join(root, 'server/.vite/manifest.json');
  await writeFile(manifest, JSON.stringify(valid));
  return { root, manifest };
}

test('exact server metadata is admitted, hashed and preserves own __proto__ inventory keys', async (t) => {
  const { root, manifest } = await fixture(t);
  await writeFile(join(root, '__proto__'), 'own inventory member');
  const seal = await inventoryApps(root);
  assert.equal(seal['server/.vite/'], null);
  assert.equal(
    seal['server/.vite/manifest.json'],
    hash(await readFile(manifest))
  );
  assert.equal(Object.hasOwn(seal, '__proto__'), true);
  assert.equal(
    Object.getOwnPropertyDescriptor(seal, '__proto__').value,
    hash('own inventory member')
  );
  assert.equal(Object.getPrototypeOf(seal), Object.prototype);
  assert.equal(
    seal['client/.assetsignore'],
    hash('wrangler.json\n.dev.vars\n')
  );
});

test('unknown hidden, credential and misplaced metadata paths stay denied in an otherwise admitted fixture', async (t) => {
  for (const name of [
    'server/.env',
    'server/.dev.vars',
    'server/.npmrc',
    'server/.credentials',
    'server/.hidden',
    'client/.vite/manifest.json',
    'server/nested/.vite/manifest.json',
    'server/.wrangler/state.json',
  ]) {
    const { root } = await fixture(t);
    await mkdir(dirname(join(root, name)), { recursive: true });
    await writeFile(join(root, name), 'public negative fixture');
    await assert.rejects(inventoryApps(root), /Unadmitted hidden/);
  }
});

test('metadata directory and child membership/types are closed before content reads', async (t) => {
  for (const mutation of [
    'missing',
    'extra',
    'credential',
    'file-directory',
    'directory-file',
    'symlink-directory',
    'symlink-file',
    'fifo',
  ]) {
    const { root, manifest } = await fixture(t);
    const directory = dirname(manifest);
    await rm(manifest);
    if (mutation === 'extra' || mutation === 'credential') {
      await writeFile(manifest, JSON.stringify(valid));
      execFileSync('mkfifo', [
        join(directory, mutation === 'extra' ? 'extra.json' : '.env'),
      ]);
    } else if (mutation === 'file-directory') await mkdir(manifest);
    else if (mutation === 'directory-file') {
      await rm(directory, { recursive: true });
      await writeFile(directory, 'not a directory');
    } else if (mutation === 'symlink-directory') {
      await rm(directory, { recursive: true });
      await symlink(join(root, 'client'), directory);
    } else if (mutation === 'symlink-file')
      await symlink(join(root, 'server/index.mjs'), manifest);
    else if (mutation === 'fifo') execFileSync('mkfifo', [manifest]);
    await assert.rejects(inventoryApps(root), /metadata|regular file/);
  }
});

test('malformed, incomplete, oversized and mistyped metadata fails with bounded diagnostics', async (t) => {
  const { root, manifest } = await fixture(t);
  for (const value of [
    null,
    [],
    {},
    { entry: null },
    { entry: [] },
    { entry: {} },
    { entry: { file: 'index.mjs', extra: true } },
    { entry: { file: 'index.mjs', css: 'styles.css' } },
    { entry: { file: 'index.mjs', assets: [null] } },
    { entry: { file: 'index.mjs', imports: {} } },
    { entry: { file: 'index.mjs', isEntry: 1 } },
    { entry: { file: 'index.mjs', src: false } },
  ]) {
    await writeFile(manifest, JSON.stringify(value));
    await assert.rejects(inventoryApps(root), /manifest/);
  }
  await writeFile(manifest, 'public malformed fixture');
  await assert.rejects(
    inventoryApps(root),
    (error) => error.message === 'Malformed Apps Vite manifest'
  );
  await writeFile(manifest, 'x'.repeat(1024 * 1024 + 1));
  await assert.rejects(inventoryApps(root), /byte bound/);
  const oversized = Object.fromEntries(
    Array.from({ length: 513 }, (_, index) => [
      String(index),
      { file: 'index.mjs' },
    ])
  );
  await writeFile(manifest, JSON.stringify(oversized));
  await assert.rejects(inventoryApps(root), /entry bound/);
});

test('file references must be own sealed regular entries and imports must be own manifest entries', async (t) => {
  const { root, manifest } = await fixture(t);
  for (const file of [
    '../escape',
    '/absolute',
    'nested/../../escape',
    './index.mjs',
    'nested\\escape',
    '.env',
    'missing.mjs',
    '',
  ]) {
    await writeFile(manifest, JSON.stringify({ entry: { file } }));
    await assert.rejects(inventoryApps(root), /manifest/);
  }
  for (const reference of ['missing', '__proto__', 'constructor', 'toString']) {
    for (const field of ['imports', 'dynamicImports']) {
      await writeFile(
        manifest,
        JSON.stringify({ entry: { file: 'index.mjs', [field]: [reference] } })
      );
      await assert.rejects(inventoryApps(root), /Missing own/);
    }
  }
  for (const field of ['css', 'assets']) {
    await writeFile(
      manifest,
      JSON.stringify({
        entry: { file: 'index.mjs', [field]: ['../client/escape'] },
      })
    );
    await assert.rejects(inventoryApps(root), /Escaping/);
  }
  assert.throws(
    () =>
      validateAppsViteManifest(
        Buffer.from('{"entry":{"file":"index.mjs"}}'),
        Object.create({ 'server/index.mjs': 'inherited' })
      ),
    /must be sealed/
  );
  assert.throws(
    () =>
      validateAppsViteManifest(Buffer.from('{"entry":{"file":"directory"}}'), {
        'server/directory': null,
      }),
    /must be sealed/
  );
});

test('own __proto__ manifest entries are preserved without prototype mutation', () => {
  const bytes = Buffer.from(
    '{"entry":{"file":"index.mjs","imports":["__proto__"]},"__proto__":{"file":"proto.mjs"}}'
  );
  const parsed = validateAppsViteManifest(bytes, {
    'server/index.mjs': hash('index'),
    'server/proto.mjs': hash('proto'),
  });
  assert.equal(Object.hasOwn(parsed, '__proto__'), true);
  assert.equal(
    Object.getOwnPropertyDescriptor(parsed, '__proto__').value.file,
    'proto.mjs'
  );
  assert.equal(Object.getPrototypeOf(parsed), Object.prototype);
  assert.equal(Object.prototype.file, undefined);
  assert.throws(
    () =>
      validateAppsViteManifest(
        Buffer.from(
          '{"entry":{"file":"index.mjs","__proto__":{"file":"bad"}}}'
        ),
        { 'server/index.mjs': hash('index') }
      ),
    /Unknown/
  );
});

test('post-start exact workdir exclusion does not admit hidden source siblings', async (t) => {
  const { root } = await fixture(t);
  const workdir = join(root, 'server/.wrangler');
  await mkdir(workdir);
  await writeFile(join(workdir, '.sdk-fixture'), 'public SDK workdir fixture');
  await assert.rejects(inventoryApps(root), /Unadmitted hidden/);
  const seal = await inventoryApps(root, 'server/.wrangler');
  assert.ok(Object.hasOwn(seal, 'server/.vite/manifest.json'));
  assert.equal(Object.hasOwn(seal, 'server/.wrangler/'), false);
  await writeFile(join(root, 'server/.other'), 'unadmitted');
  await assert.rejects(
    inventoryApps(root, 'server/.wrangler'),
    /Unadmitted hidden/
  );
});

async function sealedFixture(t, configDirectory = 'server') {
  const temporary = await realpath(
    await mkdtemp(join(tmpdir(), 'apps-hidden-plan-'))
  );
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const app = join(temporary, 'repository/apps/apps');
  await mkdir(app, { recursive: true });
  await writeFile(join(app, 'package.json'), '{"name":"@tuturuuu/apps"}');
  await writeFile(join(app, '../../bun.lock'), 'fixture lock');
  execFileSync(
    'python3',
    [
      '-B',
      '-c',
      `
import importlib.util,json,sys
from pathlib import Path
spec=importlib.util.spec_from_file_location('artifact',sys.argv[1]);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
a=Path(sys.argv[2])
for d in ['dist/server/.vite','dist/client','.void','public']:(a/d).mkdir(parents=True,exist_ok=True)
for n in m.PUBLIC_FILES:
 (a/'public'/n).write_text('public fixture');(a/'dist/client'/n).write_text('public fixture')
(a/'dist/client/.assetsignore').write_text('wrangler.json\\n.dev.vars\\n')
(a/'dist/server/index.mjs').write_text('public fixture')
(a/'dist/server/.vite/manifest.json').write_text('{"entry":{"file":"index.mjs","isEntry":true}}')
c={**m.IDENTITY,**m.NORMALIZED_DEFAULTS,'main':'index.mjs' if sys.argv[4]=='server' else '../server/index.mjs','configPath':str(a/'.void-wrangler.jsonc'),'userConfigPath':str(a/'.void-wrangler.jsonc'),'assets':{'binding':'ASSETS','directory':'../client','run_worker_first':True,'not_found_handling':'none'}}
configdir=a/'dist'/sys.argv[4];configdir.mkdir(parents=True,exist_ok=True)
(configdir/'wrangler.json').write_text(json.dumps(c))
(a/'.void/preview-deploy-config.json').write_text(json.dumps({'configPath':'../../dist/'+sys.argv[4]+'/wrangler.json','auxiliaryWorkers':[]}))
(a/'receipt.json').write_text(json.dumps(m.artifact(a,sys.argv[3])))
`,
      fileURLToPath(new URL('./apps-native-artifact.py', import.meta.url)),
      app,
      sourceSHA,
      configDirectory,
    ],
    { stdio: 'pipe' }
  );
  const options = {
    appDirectory: app,
    ownerPackage: join(app, 'package.json'),
    artifactReceipt: join(app, 'receipt.json'),
    sourceSHA,
  };
  const plan = await inspectAppsPlan(options, { checkout: () => sourceSHA });
  const caseRoot = join(temporary, 'case'),
    tempRoot = join(caseRoot, 'native-sdk-temp');
  await mkdir(tempRoot, { recursive: true });
  const context = { caseRoot, tempRoot };
  return { plan, options, context };
}

test('original and both copied manifests remain source-receipt sealed; source and receipt mutations reject', async (t) => {
  const { plan, options, context } = await sealedFixture(t);
  const prepared = await prepareAppsSessions(plan, context, 'http');
  const manifest = 'server/.vite/manifest.json';
  const bytes = await readFile(join(plan.root, manifest));
  for (const role of Object.values(prepared.roles))
    assert.equal(
      hash(await readFile(join(role.root, manifest))),
      plan.seal[manifest]
    );
  await assertAppsCopies(plan, prepared, true);
  await writeFile(
    join(prepared.roles.app.root, manifest),
    Buffer.concat([bytes, Buffer.from(' ')])
  );
  await assert.rejects(
    assertAppsCopies(plan, prepared),
    /Copied artifact mutation/
  );
  await writeFile(join(prepared.roles.app.root, manifest), bytes);
  await writeFile(
    join(plan.root, manifest),
    Buffer.concat([bytes, Buffer.from(' ')])
  );
  await assert.rejects(assertAppsOriginal(plan));
  await writeFile(join(plan.root, manifest), bytes);
  await assert.rejects(
    inspectAppsPlan(
      { ...options, sourceSHA: 'b'.repeat(40) },
      { checkout: () => sourceSHA }
    ),
    /identity mismatch/
  );
  const receipt = JSON.parse(await readFile(plan.artifactReceipt));
  await writeFile(
    plan.artifactReceipt,
    JSON.stringify({ ...receipt, sourceSha: 'b'.repeat(40) })
  );
  await assert.rejects(assertAppsOriginal(plan));
});

test('server Vite metadata cannot authorize a different emitted config layout', async (t) => {
  await assert.rejects(
    sealedFixture(t, 'native'),
    /metadata.config layout mismatch/
  );
});

test('manifest reference and metadata string bounds reject incomplete data', () => {
  const seal = { 'server/index.mjs': hash('index') };
  for (const entry of [
    { file: 'index.mjs', imports: Array(513).fill('entry') },
    { file: 'index.mjs', src: 'x'.repeat(1025) },
    { file: 'index.mjs', name: String.fromCharCode(0) },
  ]) {
    assert.throws(
      () =>
        validateAppsViteManifest(Buffer.from(JSON.stringify({ entry })), seal),
      /manifest/
    );
  }
});
