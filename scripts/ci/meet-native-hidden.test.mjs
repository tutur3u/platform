// biome-ignore-all lint/suspicious/noTemplateCurlyInString: Literal dotenv expansion must be rejected without evaluation.
import assert from 'node:assert/strict';
import { mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { meetFixture } from './meet-native-fixture.mjs';
import {
  assertMeetCopy,
  prepareMeetGraph,
} from './meet-native-graph-files.mjs';
import { inspectMeetGraph } from './meet-native-profile.mjs';

async function emittedHiddenFixture(t) {
  const f = await meetFixture(t, { server: 'server' });
  await mkdir(join(f.app, 'dist/server/.vite'));
  await writeFile(
    join(f.app, 'dist/client/.assetsignore'),
    'wrangler.json\n.dev.vars\n'
  );
  await writeFile(
    join(f.app, 'dist/server/.dev.vars'),
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY='sb_publishable_meet_ci_placeholder'\nNEXT_PUBLIC_SUPABASE_URL='https://meet-ci.supabase.invalid'\n"
  );
  await writeFile(
    join(f.app, 'dist/server/.vite/manifest.json'),
    JSON.stringify({
      'main.ts': {
        file: 'main.mjs',
        name: 'main',
        src: 'main.ts',
        isEntry: true,
        imports: ['_lazy.mjs'],
        dynamicImports: ['_lazy.mjs'],
        css: ['style.css'],
        assets: ['brand.bin'],
      },
      '_lazy.mjs': { file: 'lazy.mjs', name: 'lazy', isDynamicEntry: true },
    })
  );
  await writeFile(join(f.app, 'dist/server/lazy.mjs'), 'export default 1;');
  await writeFile(join(f.app, 'dist/server/style.css'), 'body {}');
  await writeFile(join(f.app, 'dist/server/brand.bin'), Buffer.from([0, 255]));
  await f.save();
  return f;
}

test('actual hosted hidden layout is admitted, hashed and copied without dropping bytes', async (t) => {
  const f = await emittedHiddenFixture(t);
  const plan = await inspectMeetGraph(f.options);
  for (const name of [
    'client/.assetsignore',
    'server/.dev.vars',
    'server/.vite/manifest.json',
  ])
    assert.match(plan.seal[name], /^[a-f0-9]{64}$/);
  assert.equal(plan.seal['server/.vite/'], null);
  const prepared = await prepareMeetGraph(plan, f.context);
  await assertMeetCopy(plan, prepared, true);
  await assertMeetCopy(plan, prepared);
  for (const name of [
    'client/.assetsignore',
    'server/.dev.vars',
    'server/.vite/manifest.json',
  ])
    assert.deepEqual(
      await readFile(join(f.app, 'dist', name)),
      await readFile(join(prepared.roles.app.root, name))
    );
});

for (const name of [
  'client/.assetsignore',
  'server/.dev.vars',
  'server/.vite/manifest.json',
]) {
  test(`hidden ${name} remains sealed against original and copy mutations`, async (t) => {
    const f = await emittedHiddenFixture(t),
      plan = await inspectMeetGraph(f.options);
    const prepared = await prepareMeetGraph(plan, f.context);
    await writeFile(join(prepared.roles.app.root, name), 'copied mutation');
    await assert.rejects(assertMeetCopy(plan, prepared));
    await writeFile(join(f.app, 'dist', name), 'original mutation');
    await assert.rejects(inspectMeetGraph(f.options));
  });
  test(`hidden ${name} rejects symlink substitution before SDK`, async (t) => {
    const f = await emittedHiddenFixture(t),
      path = join(f.app, 'dist', name);
    const bytes = await readFile(path);
    const target = join(f.root, 'outside-hidden-file');
    await writeFile(target, bytes);
    await rm(path);
    await symlink(target, path);
    await assert.rejects(inspectMeetGraph(f.options), /symlink/);
  });
}
for (const name of [
  'client/.unknown',
  'server/.vite/extra.json',
  'server/.dev.vars.extra',
  'client/.env',
  'server/.env.production',
  'server/credentials.json',
]) {
  test(`unknown hidden/credential artifact ${name} is rejected despite a fresh manifest`, async (t) => {
    const f = await emittedHiddenFixture(t);
    await writeFile(join(f.app, 'dist', name), 'untrusted fixture value');
    await f.save();
    await assert.rejects(inspectMeetGraph(f.options));
  });
}
for (const [name, bytes] of [
  ['extra env key', "SUPABASE_SECRET_KEY='private-fixture'\n"],
  [
    'forged public value',
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY='sb_publishable_foreign'\nNEXT_PUBLIC_SUPABASE_URL='https://meet-ci.supabase.invalid'\n",
  ],
  [
    'extra duplicate env',
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY='sb_publishable_meet_ci_placeholder'\nNEXT_PUBLIC_SUPABASE_URL='https://meet-ci.supabase.invalid'\nSUPABASE_SECRET_KEY='private-fixture'\n",
  ],
  [
    'forged env expansion',
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY='${AMBIENT_KEY}'\nNEXT_PUBLIC_SUPABASE_URL='https://meet-ci.supabase.invalid'\n",
  ],
])
  test(`${name} never becomes dev-vars discovery authority`, async (t) => {
    const f = await emittedHiddenFixture(t);
    await writeFile(join(f.app, 'dist/server/.dev.vars'), bytes);
    await f.save();
    await assert.rejects(
      inspectMeetGraph(f.options),
      /exact public CI fixture/
    );
  });
const viteEntry = {
  file: 'main.mjs',
  name: 'main',
  src: 'main.ts',
  isEntry: true,
};
for (const [name, metadata] of [
  ['null', null],
  ['array', []],
  ['empty', {}],
  ['entry null', { entry: null }],
  ['unknown field', { entry: { ...viteEntry, credential: 'private-fixture' } }],
  ['nonboolean', { entry: { ...viteEntry, isEntry: 'true' } }],
  ['source type', { entry: { ...viteEntry, src: {} } }],
  ['array type', { entry: { ...viteEntry, css: 'main.css' } }],
  ['output escape', { entry: { ...viteEntry, file: '../outside.mjs' } }],
  ['missing output', { entry: { ...viteEntry, file: 'absent.mjs' } }],
  ['missing import', { entry: { ...viteEntry, imports: ['foreign'] } }],
  ['asset escape', { entry: { ...viteEntry, assets: ['../outside.bin'] } }],
])
  test(`Vite metadata ${name} fails the finite typed sealed contract`, async (t) => {
    const f = await emittedHiddenFixture(t);
    await writeFile(
      join(f.app, 'dist/server/.vite/manifest.json'),
      JSON.stringify(metadata)
    );
    await f.save();
    await assert.rejects(inspectMeetGraph(f.options));
  });
test('malformed Vite JSON and changed asset ignore rules fail admission', async (t) => {
  const f = await emittedHiddenFixture(t);
  await writeFile(
    join(f.app, 'dist/server/.vite/manifest.json'),
    '{ "private": "must-not-print-private-marker", malformed'
  );
  await f.save();
  await assert.rejects(inspectMeetGraph(f.options), (error) => {
    assert.equal(error.message, 'Invalid Vite metadata JSON');
    assert.ok(!error.stack.includes('must-not-print-private-marker'));
    assert.equal(error.cause, undefined);
    return true;
  });
  await writeFile(join(f.app, 'dist/client/.assetsignore'), '*\n');
  await f.save();
  await assert.rejects(inspectMeetGraph(f.options), /Unexpected asset ignore/);
});

for (const name of [
  'client/.assetsignore',
  'server/.dev.vars',
  'server/.vite/manifest.json',
])
  test(`emitted server layout requires sealed hidden file ${name}`, async (t) => {
    const f = await emittedHiddenFixture(t);
    await rm(join(f.app, 'dist', name));
    await f.save();
    await assert.rejects(inspectMeetGraph(f.options), /Incomplete Meet/);
  });

test('empty hidden directory and missing complete server hidden layout fail closed', async (t) => {
  const f = await meetFixture(t, { server: 'server' });
  await assert.rejects(inspectMeetGraph(f.options), /Incomplete Meet/);
  await mkdir(join(f.app, 'dist/server/.vite'));
  await f.save();
  await assert.rejects(inspectMeetGraph(f.options), /Incomplete Meet/);
});
