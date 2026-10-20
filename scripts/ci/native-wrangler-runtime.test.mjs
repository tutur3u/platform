import assert from 'node:assert/strict';
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
import { join } from 'node:path';
import { test } from 'node:test';
import {
  assertAmbientEnvironment,
  assertArtifactUnchanged,
  assertChildTempIsolation,
  assertTempContents,
  inspectArtifact,
  sealArtifact,
} from './native-wrangler-runtime.mjs';

const sha = '5409c0a3704a29547c5a3cebf95df6b015b657f4';
async function fixture(run) {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), 'native-boundary-'))
  );
  const config = {
    name: 'boundary-fixture',
    main: 'main.mjs',
    compatibility_date: '2026-09-06',
    no_bundle: true,
    find_additional_modules: true,
    rules: [],
    vars: { COMPILED_SHA: sha },
  };
  const options = {
    root,
    config: join(root, 'wrangler.json'),
    main: join(root, 'main.mjs'),
    sourceSHA: sha,
    canonicalHost: 'fixture.invalid',
    ownerPackage: join(root, 'package.json'),
    outbound: () => new Response('denied', { status: 599 }),
  };
  async function save() {
    await writeFile(options.config, JSON.stringify(config));
    options.seal = await sealArtifact(root);
  }
  try {
    await writeFile(
      options.main,
      'export default { fetch() { return new Response("emitted"); } };'
    );
    await save();
    await run({ options, config, save });
  } finally {
    await rm(root, { recursive: true });
  }
}

test('closed emitted config accepts real input facts without SDK execution', {
  timeout: 30000,
}, async () => {
  await fixture(async ({ options }) => {
    assert.deepEqual((await inspectArtifact(options)).bindings, {});
    await assertArtifactUnchanged(options);
  });
});

test('unknown build, remote, auth, container and graph-changing fields fail closed', {
  timeout: 30000,
}, async () => {
  for (const field of [
    'build',
    'env',
    'containers',
    'account_id',
    'unsafe',
    'services_extra',
    'dev',
    'secrets',
    'site',
    'alias',
    'nodejs_compat',
  ]) {
    await fixture(async ({ options, config, save }) => {
      config[field] = {};
      await save();
      await assert.rejects(
        inspectArtifact(options),
        /Unsupported emitted config field/
      );
    });
  }
});

test('mutation, source identity, external workers and undeclared fixture keys reject', {
  timeout: 30000,
}, async () => {
  await fixture(async ({ options }) => {
    await writeFile(options.main, 'mutated');
    await assert.rejects(inspectArtifact(options), /Artifact hash mutation/);
    await assert.rejects(
      assertArtifactUnchanged(options),
      /Artifact hash mutation/
    );
  });
  await fixture(async ({ options }) => {
    await assert.rejects(
      inspectArtifact({ ...options, sourceSHA: '0'.repeat(40) }),
      /Compiled source SHA mismatch/
    );
    await assert.rejects(
      inspectArtifact({ ...options, externalWorkers: [{}] }),
      /External workers unsupported/
    );
    await assert.rejects(
      inspectArtifact({ ...options, fixtureServices: { UNKNOWN() {} } }),
      /Unsupported fixtureServices/
    );
    await assert.rejects(
      inspectArtifact({ ...options, fixtureVars: { COMPILED_SHA: 'forged' } }),
      /cannot be overridden/
    );
  });
});

test('ambient secret names and symlinks reject before content reads', {
  timeout: 30000,
}, async () => {
  await fixture(async ({ options }) => {
    await writeFile(join(options.root, '.dev.vars'), 'SYNTHETIC=unused');
    await assert.rejects(sealArtifact(options.root), /Hidden artifact/);
  });
  await fixture(async ({ options }) => {
    await symlink(options.main, join(options.root, 'linked.mjs'));
    await assert.rejects(sealArtifact(options.root), /regular artifact/);
  });
});

test('ambient discovery, preload and log controls fail closed', {
  timeout: 30000,
}, () => {
  const clean = { WRANGLER_WRITE_LOGS: 'false' };
  assert.doesNotThrow(() => assertAmbientEnvironment(clean));
  for (const key of [
    'CLOUDFLARE_INCLUDE_PROCESS_ENV',
    'CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV',
    'NODE_OPTIONS',
    'NODE_PATH',
    'CLOUDFLARE_ENV',
    'WRANGLER_LOG_PATH',
    'WRANGLER_REGISTRY_PATH',
    'WRANGLER_CACHE_DIR',
    'WRANGLER_OUTPUT_FILE_PATH',
    'WRANGLER_OUTPUT_FILE_DIRECTORY',
  ]) {
    assert.throws(
      () => assertAmbientEnvironment({ ...clean, [key]: 'synthetic' }),
      new RegExp(`Ambient (discovery|override): ${key}`)
    );
  }
  for (const value of [undefined, 'true', '1']) {
    assert.throws(
      () => assertAmbientEnvironment({ WRANGLER_WRITE_LOGS: value }),
      /WRANGLER_WRITE_LOGS must disable/
    );
  }
});

test('config main and asset paths cannot traverse outside the sealed root', {
  timeout: 30000,
}, async () => {
  await fixture(async ({ options, config, save }) => {
    config.main = '../outside.mjs';
    await save();
    await assert.rejects(
      inspectArtifact(options),
      /Expected values to be strictly equal/
    );
  });
  await fixture(async ({ options, config, save }) => {
    config.assets = {
      directory: '../outside',
      binding: 'ASSETS',
      run_worker_first: true,
    };
    await save();
    await assert.rejects(
      inspectArtifact(options),
      /Artifact path escapes root/
    );
  });
});

test('child temp admission rejects inherited host temp and symlinks', {
  timeout: 30000,
}, async () => {
  await fixture(async ({ options: { root } }) => {
    const temp = join(root, 'native-sdk-temp');
    await mkdir(temp);
    const env = Object.fromEntries(
      ['TMPDIR', 'TMP', 'TEMP', 'NATIVE_SDK_TEMP_ROOT'].map((key) => [
        key,
        temp,
      ])
    );
    assert.equal(await assertChildTempIsolation(env, root), temp);
    for (const key of Object.keys(env)) {
      await assert.rejects(
        assertChildTempIsolation({ ...env, [key]: tmpdir() }, root),
        /Missing isolated child temp environment/
      );
    }
    await rm(temp, { recursive: true });
    await symlink(root, temp);
    await assert.rejects(
      assertChildTempIsolation(env, root),
      /must be canonical/
    );
  });
});
test('SDK sibling residual fails without deleting evidence', {
  timeout: 30000,
}, async () => {
  await fixture(async ({ options: { root } }) => {
    const temp = join(root, 'native-sdk-temp');
    await mkdir(temp);
    await assertTempContents(temp);
    const sibling = join(temp, 'miniflare-negative-control');
    await mkdir(sibling);
    await writeFile(join(sibling, 'sentinel'), 'retain-owned-sdk-evidence');
    await assert.rejects(
      assertTempContents(temp),
      /SDK temporary residuals retained/
    );
    assert.equal(
      await readFile(join(sibling, 'sentinel'), 'utf8'),
      'retain-owned-sdk-evidence'
    );
  });
});
