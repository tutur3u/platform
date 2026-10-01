import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  assertSyntheticCliEnvironment,
  assertUnlinkedCliDirectory,
  CliEnvironmentFailure,
  createSyntheticCliContext,
} from './cli-environment.mjs';
import { runCliProbe, verificationFailureStatus } from './native-cli.mjs';
import { runOwnedProcess } from './process-group.mjs';
import { runHostedHelper } from './proposal.mjs';

async function fixture(t) {
  const base = await mkdtemp(path.join(os.tmpdir(), 'cli-isolation-contract-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  const context = createSyntheticCliContext({
    root: path.join(base, 'private'),
    nativeBinary: process.execPath,
    temporaryRoot: os.tmpdir(),
  });
  return { base, context };
}
const forbiddenKeys = [
  'SUPABASE_ACCESS_TOKEN',
  'SUPABASE_PROFILE',
  'SUPABASE_PROJECT_ID',
  'SUPABASE_API_URL',
  'SUPABASE_DB_PASSWORD',
  'SUPABASE_GO_BINARY_OVERRIDE',
  'PGPASSWORD',
  'PGHOST',
  'DATABASE_URL',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'NODE_OPTIONS',
  'BUN_OPTIONS',
  'DOCKER_HOST',
  'DOCKER_CONTEXT',
  'DBUS_SESSION_BUS_ADDRESS',
  'SSH_AUTH_SOCK',
  'AWS_ACCESS_KEY_ID',
  'GH_TOKEN',
  'GITHUB_TOKEN',
];
test('allowlist ignores ambient credential/profile/proxy/loader values without reading them', async (t) => {
  const { base } = await fixture(t);
  const unreadable = Object.fromEntries(
    forbiddenKeys.map((key) => [key, 'synthetic-never-forward'])
  );
  for (const key of forbiddenKeys)
    Object.defineProperty(unreadable, key, {
      get: () => assert.fail('ambient value must not be read'),
    });
  const { env, cwd } = createSyntheticCliContext({
    root: path.join(base, 'another'),
    nativeBinary: process.execPath,
    temporaryRoot: os.tmpdir(),
    ambient: unreadable,
  });
  for (const key of forbiddenKeys) assert.equal(Object.hasOwn(env, key), false);
  assert.equal(env.SUPABASE_TELEMETRY_DISABLED, '1');
  assert.equal(env.DO_NOT_TRACK, '1');
  assert.equal(env.SUPABASE_NO_KEYRING, '1');
  assert.equal(env.SUPABASE_WORKDIR, cwd);
  assert.equal(env.PATH, '/usr/local/bin:/usr/bin:/bin');
  assert.equal(env.SUPABASE_INTERNAL_IMAGE_REGISTRY, 'ghcr.io');
  assert(Object.isFrozen(env));
  assert.throws(() => {
    env.SUPABASE_ACCESS_TOKEN = 'synthetic';
  }, TypeError);
});
test('prepare probes enforce admitted private context and explicit telemetry flags', async (t) => {
  const { context } = await fixture(t);
  const text = await runCliProbe(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      'console.log(JSON.stringify({keys:Object.keys(process.env),telemetry:process.env.SUPABASE_TELEMETRY_DISABLED,dnt:process.env.DO_NOT_TRACK,keyring:process.env.SUPABASE_NO_KEYRING,cwd:process.cwd(),home:process.env.HOME}))',
    ],
    { ...context, phase: 'cli-version', timeoutMs: 2000 }
  );
  const observed = JSON.parse(text);
  for (const key of forbiddenKeys) assert(!observed.keys.includes(key));
  assert(!observed.keys.includes('SUPABASE_CLI_BINARY_OVERRIDE'));
  assert.equal(observed.telemetry, '1');
  assert.equal(observed.dnt, '1');
  assert.equal(observed.keyring, '1');
  assert.equal(observed.cwd, context.cwd);
  assert.equal(observed.home, context.env.HOME);
  assert.throws(
    () =>
      runCliProbe('/synthetic/missing', [], {
        env: { ...context.env, SUPABASE_ACCESS_TOKEN: 'synthetic' },
        cwd: context.cwd,
        phase: 'cli-version',
        timeoutMs: 1000,
      }),
    CliEnvironmentFailure
  );
});
for (const mode of ['--resume', '--cleanup']) {
  test(`actual hosted helper passes only isolated environment for ${mode}`, async (t) => {
    const { base } = await fixture(t);
    const project = path.join(base, 'project');
    await mkdir(project);
    const args = ['/synthetic/helper.mjs', mode, project];
    let called = false;
    await runHostedHelper(
      process.execPath,
      args,
      { timeoutMs: 1000 },
      {
        nativeBinary: process.execPath,
        context: (nativeBinary, workdir) =>
          createSyntheticCliContext({
            root: path.join(base, 'helper-private'),
            nativeBinary,
            temporaryRoot: os.tmpdir(),
            workdir,
          }),
        runner: async (binary, actualArgs, options) => {
          called = true;
          assert.equal(binary, process.execPath);
          assert.deepEqual(actualArgs, args);
          assertSyntheticCliEnvironment(
            options.env,
            options.env.SUPABASE_WORKDIR
          );
          assert.equal(options.env.SUPABASE_TELEMETRY_DISABLED, '1');
          assert.equal(options.env.DO_NOT_TRACK, '1');
          for (const key of forbiddenKeys)
            assert(!Object.hasOwn(options.env, key));
        },
      }
    );
    assert(called);
  });
}
test('generic owned process uses explicit environment instead of ambient inheritance', async (t) => {
  const { base, context } = await fixture(t);
  const target = path.join(base, 'observed.json');
  await runOwnedProcess(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      'import {writeFileSync} from "node:fs";writeFileSync(process.argv[1],JSON.stringify({telemetry:process.env.SUPABASE_TELEMETRY_DISABLED,dnt:process.env.DO_NOT_TRACK,token:process.env.SUPABASE_ACCESS_TOKEN??null}))',
      target,
    ],
    { timeoutMs: 2000, env: context.env }
  );
  const { readFile } = await import('node:fs/promises');
  assert.deepEqual(JSON.parse(await readFile(target, 'utf8')), {
    telemetry: '1',
    dnt: '1',
    token: null,
  });
});
for (const file of ['profile', 'access-token', 'profiles']) {
  test(`persisted ${file} is rejected by existence only, never read`, async (t) => {
    const { context } = await fixture(t);
    await writeFile(
      path.join(context.env.SUPABASE_HOME, file),
      'synthetic contents never parsed'
    );
    assert.throws(
      () => assertSyntheticCliEnvironment(context.env, context.cwd),
      CliEnvironmentFailure
    );
  });
}
for (const file of [
  '.supabase/project.json',
  'supabase/.temp/project-ref',
  '.env',
  'supabase/.env',
]) {
  test(`linked/dotenv state ${file} on an ancestor fails closed`, async (t) => {
    const { base, context } = await fixture(t);
    const target = path.join(base, file);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, 'synthetic-not-read');
    assert.throws(
      () => assertUnlinkedCliDirectory(context.cwd),
      CliEnvironmentFailure
    );
    assert.throws(
      () => assertSyntheticCliEnvironment(context.env, context.cwd),
      CliEnvironmentFailure
    );
  });
}
test('symlinked private HOME/link directory cannot redirect credential resolution', async (t) => {
  const { base, context } = await fixture(t);
  await symlink(base, path.join(context.cwd, '.supabase'));
  assert.throws(
    () => assertUnlinkedCliDirectory(context.cwd),
    CliEnvironmentFailure
  );
  const directory = path.join(base, 'redirected');
  await symlink(base, directory);
  assert.throws(
    () =>
      createSyntheticCliContext({
        root: directory,
        nativeBinary: process.execPath,
        temporaryRoot: os.tmpdir(),
      }),
    CliEnvironmentFailure
  );
});
test('environment failure diagnostics stay fixed without raw paths or state', () => {
  assert.equal(
    verificationFailureStatus('prepare', new CliEnvironmentFailure()),
    'Programming verification phase=cli-environment outcome=unavailable'
  );
});

test('private directories are revalidated immediately before a probe', async (t) => {
  const { base, context } = await fixture(t);
  await rm(context.env.HOME, { recursive: true });
  await symlink(base, context.env.HOME);
  assert.throws(
    () => assertSyntheticCliEnvironment(context.env, context.cwd),
    CliEnvironmentFailure
  );
});
test('temporary root identity remains unchanged for supported isolated cleanup', async (t) => {
  const { context } = await fixture(t);
  assert.equal(context.env.TMPDIR, os.tmpdir());
});
