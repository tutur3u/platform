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
  casePhaseSummary,
  createChildProducer,
  persistFinalization,
  requireChildOutcome,
} from './native-wrangler-evidence.mjs';
import {
  assertAmbientEnvironment,
  assertArtifactUnchanged,
  assertChildTempIsolation,
  assertTempContents,
  createNativeFinalizer,
  inspectArtifact,
  memoizePublicDispose,
  phaseErrors,
  sealArtifact,
} from './native-wrangler-runtime.mjs';

const archiveMain = 'case/temp/declared-scratch/artifact/main.mjs';
const saved = (result, path) => readFile(join(result.snapshot.path, path));
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
async function finalizerFixture(run) {
  const storage = await realpath(
    await mkdtemp(join(tmpdir(), 'native-finalizer-run-'))
  );
  const cwd = join(storage, 'case');
  const diagnosticRoot = join(storage, 'diagnostics');
  await mkdir(cwd);
  await mkdir(diagnosticRoot, { mode: 0o700 });
  try {
    const root = join(cwd, 'original');
    const tempRoot = join(cwd, 'temp');
    await mkdir(root);
    await mkdir(tempRoot);
    await writeFile(join(root, 'main.mjs'), 'export default {};');
    const scratch = join(tempRoot, 'declared-scratch');
    const copyRoot = join(scratch, 'artifact');
    await mkdir(copyRoot, { recursive: true });
    await writeFile(join(copyRoot, 'main.mjs'), 'export default {};');
    const foreignPath = join(cwd, 'foreign');
    await writeFile(foreignPath, 'foreign-value');
    const plan = {
      root,
      caseRoot: cwd,
      diagnosticRoot,
      tempRoot,
      scratch,
      copyRoot,
      seal: await sealArtifact(root),
      sdkWorkingDir: join(copyRoot, '.wrangler'),
      foreignPath,
      foreignValue: 'foreign-value',
    };
    await run(plan);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}
function failedPhases(result) {
  return Object.entries(result.phases)
    .filter(([, value]) => !value.ok)
    .map(([name]) => name);
}
for (const target of ['original', 'copy', 'both']) {
  test(`post-exit finalizer detects ${target} mutation independently`, async () => {
    await finalizerFixture(async (plan) => {
      if (target !== 'copy')
        await writeFile(join(plan.root, 'main.mjs'), 'changed-original');
      if (target !== 'original')
        await writeFile(join(plan.copyRoot, 'main.mjs'), 'changed-copy');
      let removals = 0;
      const finish = createNativeFinalizer(plan, async () => {
        removals++;
      });
      const first = finish();
      assert.equal(finish(), first);
      const result = await first;
      assert.deepEqual(
        failedPhases(result),
        target === 'both'
          ? ['originalSeal', 'copySeal']
          : [target === 'original' ? 'originalSeal' : 'copySeal']
      );
      assert.equal(removals, 0);
      assert.equal(result.phases.residual.ok, true);
      await realpath(plan.scratch);
      assert.equal(await readFile(plan.foreignPath, 'utf8'), plan.foreignValue);
    });
  });
}
test('post-exit residual attributes the exact sentinel with matched clean control', async () => {
  for (const residual of [false, true])
    await finalizerFixture(async (plan) => {
      if (residual) {
        await mkdir(join(plan.tempRoot, 'miniflare-negative-control'));
        await writeFile(
          join(plan.tempRoot, 'miniflare-negative-control/sentinel'),
          'owned-control'
        );
      }
      const result = await createNativeFinalizer(plan)();
      assert.deepEqual(failedPhases(result), residual ? ['residual'] : []);
      if (residual) {
        assert.deepEqual(result.phases.residual.error.residual, [
          'miniflare-negative-control',
        ]);
        assert.equal(result.phases.originalSeal.ok, true);
        assert.equal(result.phases.copySeal.ok, true);
        await realpath(plan.scratch);
        assert.equal(
          await readFile(
            join(plan.tempRoot, 'miniflare-negative-control/sentinel'),
            'utf8'
          ),
          'owned-control'
        );
      } else {
        assert.equal(result.phases.removal.ok, true);
        await assert.rejects(realpath(plan.scratch), { code: 'ENOENT' });
      }
      assert.equal(await readFile(plan.foreignPath, 'utf8'), plan.foreignValue);
    });
});
test('post-exit no-op removal fails the real ENOENT postcondition', async () => {
  await finalizerFixture(async (plan) => {
    const result = await createNativeFinalizer(plan, async () => {})();
    assert.deepEqual(failedPhases(result), ['removal']);
    await realpath(plan.copyRoot);
  });
});
test('post-exit removal error retains the exact failure and evidence', async () => {
  await finalizerFixture(async (plan) => {
    const failure = Object.assign(new Error('denied'), { code: 'EACCES' });
    const result = await createNativeFinalizer(plan, async () => {
      throw failure;
    })();
    assert.equal(result.phases.removal.error, failure);
    assert.deepEqual(result.errors, [failure]);
    assert.deepEqual(await sealArtifact(plan.copyRoot), plan.seal);
    assert.deepEqual(await sealArtifact(plan.root), plan.seal);
    assert.equal(await readFile(plan.foreignPath, 'utf8'), plan.foreignValue);
  });
});
test('primary and dispose errors retain each identity alone and together', () => {
  const primary = new Error('primary');
  const dispose = new Error('dispose');
  assert.equal(phaseErrors(), undefined);
  assert.equal(phaseErrors(primary), primary);
  assert.equal(phaseErrors(undefined, dispose), dispose);
  const both = phaseErrors(primary, dispose);
  assert.deepEqual(both.errors, [primary, dispose]);
  assert.equal(both.primary, primary);
  assert.equal(both.dispose, dispose);
  assert.deepEqual(phaseErrors(primary, primary).errors, [primary, primary]);
});
test('failed child gates retain scratch while every proof runs', async () => {
  await finalizerFixture(async (plan) => {
    const primary = new Error('failed child receipt');
    const result = await createNativeFinalizer(plan)([primary]);
    assert.deepEqual(result.errors, [primary]);
    assert.deepEqual(Object.keys(result.phases), [
      'residual',
      'originalSeal',
      'copySeal',
      'foreign',
      'snapshot',
    ]);
    assert.equal(result.phases.snapshot.ok, true);
    assert.match(result.snapshot.seal, /^[a-f0-9]{64}$/);
    await saved(result, 'pre-removal.json');
    assert.equal(result.phases.removal, undefined);
    assert.ok(Object.values(result.phases).every((phase) => phase.ok));
    await realpath(plan.scratch);
  });
});
test('public dispose is memoized and preserves rejection identity without filesystem claims', async () => {
  for (const failure of [undefined, new Error('dispose-rejection')]) {
    let calls = 0;
    const cleanup = memoizePublicDispose({
      dispose() {
        calls++;
        if (failure) throw failure;
      },
    });
    const first = cleanup();
    assert.equal(cleanup(), first);
    if (failure) await assert.rejects(first, (error) => error === failure);
    else await first;
    assert.equal(cleanup(), first);
    assert.equal(calls, 1);
  }
});
test('primary and independent filesystem proof failures remain visible together', async () => {
  await finalizerFixture(async (plan) => {
    const primary = new Error('primary-assertion');
    await mkdir(join(plan.tempRoot, 'exact-residual'));
    await writeFile(join(plan.root, 'main.mjs'), 'changed-original');
    await writeFile(join(plan.copyRoot, 'main.mjs'), 'changed-copy');
    const result = await createNativeFinalizer(plan)([primary]);
    assert.deepEqual(failedPhases(result), [
      'residual',
      'originalSeal',
      'copySeal',
    ]);
    assert.equal(result.errors[0], primary);
    assert.equal(result.errors.length, 4);
    assert.deepEqual(result.phases.residual.error.residual, ['exact-residual']);
    assert.equal(result.phases.foreign.ok, true);
    await realpath(plan.scratch);
  });
});
test('verified snapshot survives a destructive partial removal with the exact error', async () => {
  await finalizerFixture(async (plan) => {
    const file = join(plan.copyRoot, 'main.mjs');
    const originalBytes = await readFile(file);
    await mkdir(plan.sdkWorkingDir);
    await writeFile(join(plan.sdkWorkingDir, 'sdk-evidence'), 'sdk-original');
    await symlink(
      '/external/not-followed',
      join(plan.scratch, 'external-link')
    );
    const failure = new Error('partial removal');
    const result = await createNativeFinalizer(plan, async () => {
      await rm(file);
      throw failure;
    })();
    assert.equal(result.phases.removal.error, failure);
    assert.deepEqual(result.errors, [failure]);
    await assert.rejects(readFile(file), { code: 'ENOENT' });
    const archive = join(result.snapshot.path, 'case');
    assert.deepEqual(await saved(result, archiveMain), originalBytes);
    assert.equal(
      await readFile(
        join(archive, 'temp/declared-scratch/artifact/.wrangler/sdk-evidence'),
        'utf8'
      ),
      'sdk-original'
    );
    assert.deepEqual(await sealArtifact(plan.root), plan.seal);
    const metadata = JSON.parse(
      await readFile(join(result.snapshot.path, 'pre-removal.json'), 'utf8')
    );
    assert.deepEqual(metadata.plan.seal, plan.seal);
    assert.ok(
      metadata.source.some(
        (entry) =>
          entry.type === 'link' && entry.target === '/external/not-followed'
      )
    );
  });
});
test('capture failure prevents every removal dispatch', async () => {
  await finalizerFixture(async (plan) => {
    let dispatched = 0;
    const result = await createNativeFinalizer(
      { ...plan, diagnosticRoot: plan.scratch },
      async () => {
        dispatched++;
      }
    )();
    assert.deepEqual(failedPhases(result), ['snapshot']);
    assert.equal(dispatched, 0);
    assert.deepEqual(await sealArtifact(plan.copyRoot), plan.seal);
  });
});
test('successful cleanup and failed removal postcheck retain verified snapshots', async () => {
  for (const postcheckFailure of [false, true])
    await finalizerFixture(async (plan) => {
      const original = await readFile(join(plan.copyRoot, 'main.mjs'));
      const result = await createNativeFinalizer(
        plan,
        async (path, options) => {
          await rm(path, options);
          if (postcheckFailure)
            await mkdir(join(plan.tempRoot, 'postcheck-residual'));
        }
      )();
      assert.deepEqual(
        failedPhases(result),
        postcheckFailure ? ['removal'] : []
      );
      await assert.rejects(realpath(plan.scratch), { code: 'ENOENT' });
      assert.deepEqual(await saved(result, archiveMain), original);
      await saved(result, 'pre-removal.json');
    });
});
test('returned Worker producer observes exact public C and rejects mismatched lifecycle or target', async () => {
  const diagnostics = {
    wrongModule:
      'TypeError: WebAssembly.Instance(): Argument 0 must be a WebAssembly.Module\n  at main.mjs:2:18',
    graphEscape:
      'TypeError: Invalid module specifier "../outside.mjs".\n  imported from "main.mjs".',
    wrongType:
      "SyntaxError: The requested module './message.txt' does not provide an export named 'absent'\n  at file:///fixture/artifact/main.mjs:1:9",
    nodeBuiltin: 'Error: No such module "node:fs".\n  imported from "main.mjs"',
  };
  const exit = { code: 0, signal: null };
  for (const [name, diagnostic] of Object.entries(diagnostics)) {
    for (const variant of [
      'exact',
      'service',
      'target',
      'text',
      'name',
      'code',
      'import',
      'primary',
      'fulfilled',
      'missing',
      'readyRejected',
      'preReturn',
    ]) {
      const producer = createChildProducer(name);
      let message = `service core:user:native-portable-fixture: Uncaught ${diagnostic}`;
      if (variant === 'service')
        message = message.replace('core:user:', 'core:other:');
      if (variant === 'import')
        message = message
          .replace('message.txt', 'other.txt')
          .replaceAll('main.mjs', 'other.mjs');
      if (variant === 'target')
        message = message.replaceAll('main.mjs', 'other.mjs');
      if (variant === 'text')
        message = message
          .replace('WebAssembly.Instance()', 'OtherWASM')
          .replace('../outside.mjs', './allowed.mjs')
          .replace("'absent'", "'present'")
          .replace('node:fs', 'node:path');
      const C = Object.assign(
        new Error(`Runtime stderr:\n${JSON.stringify({ message })}`),
        {
          name:
            variant === 'name'
              ? 'MiniflareCoreError'
              : 'MiniflareCoreError [ERR_RUNTIME_FAILURE]',
          code: variant === 'code' ? 'OTHER' : 'ERR_RUNTIME_FAILURE',
        }
      );
      const E = new Error('independent failure');
      let calls = 0,
        primary;
      const worker = {
        get ready() {
          return variant === 'readyRejected'
            ? Promise.reject(E)
            : Promise.resolve();
        },
        async dispose() {
          calls++;
          if (variant !== 'fulfilled') throw C;
        },
      };
      try {
        await producer.observeReturnedStartup(async () => {
          if (variant === 'preReturn') throw E;
          return variant === 'missing'
            ? {}
            : { worker, cleanup: memoizePublicDispose(worker) };
        });
        if (variant === 'primary') throw E;
      } catch (error) {
        primary = error;
      }
      const completion = producer.finish(primary);
      assert.equal(producer.finish(primary), completion);
      const raw = await completion;
      const receipt = JSON.parse(JSON.stringify(raw.receipt));
      const classify = (value = exit) =>
        requireChildOutcome(receipt, name, value);
      assert.equal(calls, ['preReturn', 'missing'].includes(variant) ? 0 : 1);
      if (calls && variant !== 'fulfilled') assert.equal(raw.errors.dispose, C);
      if (primary) assert.equal(raw.errors.primary, primary);
      if (variant !== 'exact') {
        assert.throws(classify);
        continue;
      }
      assert.equal(raw.errors.startup, undefined);
      assert.equal(receipt.disposeIsStartup, false);
      assert.equal(receipt.facts.readyFulfilled, true);
      assert.equal(classify(), 'EXPECTED_USER_STARTUP_REJECTION_OBSERVED');
      for (const failure of [
        { code: 1, signal: null },
        { code: 0, signal: 'SIGTERM' },
        { error: E },
      ])
        assert.throws(() => classify(failure));
      for (const key of Object.keys(receipt.facts)) {
        receipt.facts[key] = !receipt.facts[key];
        assert.throws(classify);
        receipt.facts[key] = !receipt.facts[key];
      }
      const phaseNames =
        'residual originalSeal copySeal foreign snapshot removal'.split(' ');
      for (const [kind, phase, ...completion] of [
        ['none', null, true, 'ok'],
        ['errors', null, true, 'ok'],
        ['persistence', null, false, 'ok'],
        ['persistence', null, undefined, 'ok'],
        ['receipt', null, true],
        ...['fail', 'notrun', undefined].map((status) =>
          Array.of('receipt', null, true, status)
        ),
        ...phaseNames.flatMap((key) =>
          [{ ok: false }, 'absent', {}, { ok: undefined }].map((phase) =>
            Array.of(key, phase, true, 'ok')
          )
        ),
      ]) {
        const phases = Object.fromEntries(
          phaseNames.map((key) => [key, { ok: true }])
        );
        const result = { phases, errors: kind === 'errors' ? [E] : [] };
        if (phase === 'absent') delete result.phases[kind];
        else if (phase) result.phases[kind] = phase;
        const inputs = [name, receipt, exit, classify(), result, ...completion];
        const summary = casePhaseSummary(...inputs);
        assert.equal(summary.includes('_WITH_CLOSED_PROCESS'), kind === 'none');
        assert.equal(summary.includes(E.message), false);
      }
    }
  }
});
test('actual persistence attempts both destinations and retains all partial-removal errors', async () => {
  for (const failing of ['case', 'archive', 'both'])
    await finalizerFixture(async (plan) => {
      const original = await readFile(join(plan.copyRoot, 'main.mjs'));
      const removal = new Error(`partial removal ${'E'.repeat(3000)}`);
      const result = await createNativeFinalizer(plan, async () => {
        await rm(join(plan.copyRoot, 'main.mjs'));
        throw removal;
      })();
      const attempts = [],
        failures = [];
      const io = {
        readFile,
        async writeFile(path, bytes, options) {
          if (options.flag === 'wx') {
            const target = path.startsWith(result.snapshot.path)
              ? 'archive'
              : 'case';
            attempts.push(target);
            if (failing === target || failing === 'both') {
              const error = new Error(`${target} write failed`);
              failures.push(error);
              throw error;
            }
          }
          return writeFile(path, bytes, options);
        },
      };
      await assert.rejects(
        persistFinalization(plan, result, {}, io),
        (error) => {
          assert.deepEqual(error.errors, [removal, ...failures]);
          assert.equal(error.record.errors[0].message, removal.message);
          assert.equal(error.record.persistenceErrors.length, failures.length);
          return true;
        }
      );
      assert.deepEqual(attempts, ['case', 'archive']);
      assert.deepEqual(await saved(result, archiveMain), original);
      assert.deepEqual(await sealArtifact(plan.root), plan.seal);
      await saved(result, 'pre-removal.json');
      if (failing !== 'both') {
        const target =
          failing === 'case' ? result.snapshot.path : plan.caseRoot;
        const persisted = JSON.parse(
          await readFile(join(target, 'parent-finalization.json'), 'utf8')
        );
        assert.equal(persisted.errors[0].message, removal.message);
        assert.equal(persisted.persistenceErrors.length, 1);
      }
    });
});
