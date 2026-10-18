import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  assertEmployeeArtifact,
  assertEmployeeCatalog,
  assertEmployeeCompiler,
  compileEmployeeConsumer,
  createEmployeeBinding,
  employeeCompilerConfig,
  employeeFunctions,
  employeePublicConsumerReceipt,
  employeeTables,
  runEmployeePublicConsumer,
  runEmployeePublicConsumerLifecycle,
  selectEmployeePublicConsumer,
} from '../apps/database/scripts/employee-public-consumer-qualification.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const success = { status: 0, signal: null, stdout: '', stderr: '' };
const syntheticCompiler = () => ({
  version: 'synthetic-adapter-test',
  executable: fileURLToPath(import.meta.url),
});
const compilerEvidence = {
  sourceCompilerQualified: true,
  status: 0,
  signal: null,
  timedOut: false,
  processGroupStopped: true,
  compilerSha256: 'a'.repeat(64),
  fixtureSha256: 'b'.repeat(64),
  configSha256: 'c'.repeat(64),
};
const compilerSuccess = {
  status: 0,
  signal: null,
  timedOut: false,
  processGroupStopped: true,
  buildDiagnostic: { processOutput: { truncated: false } },
};
const binding = {
  sourceSha: '1'.repeat(40),
  controlSha: '2'.repeat(40),
  projectId: 'synthetic-employee',
  runId: '12',
  runAttempt: '1',
  repository: 'synthetic/project',
  sourceInventorySha256: 'a'.repeat(64),
  controlInventorySha256: 'b'.repeat(64),
  migrations: [{ version: '20261011002109', sha256: 'c'.repeat(64) }],
};
const catalog = {
  database: 'postgres',
  tables: employeeTables.map((name) => ({ name, sha256: 'f'.repeat(64) })),
  functions: employeeFunctions.map((name) => ({
    name,
    identity: 'p_actor_id uuid',
    sha256: 'd'.repeat(64),
  })),
  migrations: [{ version: '20261011002109', sha256: 'e'.repeat(64) }],
};
function temporary(t) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'employee-proof-test-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}
function artifact(t) {
  const directory = temporary(t);
  const file = path.join(directory, 'generated-types.ts');
  // Synthetic bytes test binding only; they are never accepted as generated-schema evidence.
  const bytes = 'synthetic artifact for binding controls';
  writeFileSync(file, bytes);
  return { directory, file, digest: hash(bytes) };
}

test('default-off selection rejects malformed flags and standalone-profile collisions', () => {
  assert.equal(selectEmployeePublicConsumer(undefined), false);
  assert.equal(selectEmployeePublicConsumer('false'), false);
  assert.equal(selectEmployeePublicConsumer('true'), true);
  for (const value of ['TRUE', '', true, null])
    assert.throws(() => selectEmployeePublicConsumer(value), /Invalid/);
  for (const option of ['chatInitialSettings', 'structuredProvenance'])
    assert.throws(
      () => selectEmployeePublicConsumer('true', { [option]: true }),
      /excludes/
    );
});

test('artifact binding rejects tamper, wrong hash and absent artifacts', (t) => {
  const { file, digest } = artifact(t);
  assertEmployeeArtifact(file, digest);
  assert.throws(
    () => assertEmployeeArtifact(file, '0'.repeat(64)),
    /artifact differs/
  );
  writeFileSync(file, 'tampered');
  assert.throws(() => assertEmployeeArtifact(file, digest), /artifact differs/);
  assert.throws(() => assertEmployeeArtifact(`${file}-missing`, digest));
});

test('applied identities reject absent functions, overloads and wrong migration sets', () => {
  assert.deepEqual(
    assertEmployeeCatalog(JSON.stringify(catalog), binding),
    catalog
  );
  for (const mutate of [
    (value) => {
      value.database = 'other';
    },
    (value) => {
      value.functions.pop();
    },
    (value) => {
      value.tables.pop();
    },
    (value) => {
      value.functions.push(value.functions[0]);
    },
    (value) => {
      value.functions[0].identity = '';
    },
    (value) => {
      value.functions[0].sha256 = null;
    },
    (value) => {
      value.functions[0].sha256 = ['d'.repeat(64)];
    },
    (value) => {
      value.migrations[0].version = '20260101000000';
    },
    (value) => {
      value.migrations[0].sha256 = '';
    },
  ]) {
    const wrong = structuredClone(catalog);
    mutate(wrong);
    assert.throws(
      () => assertEmployeeCatalog(wrong, binding),
      /identity differs/
    );
  }
});

test('compiler completion rejects skips, nonzero exit, spawn error, signal and timeout', () => {
  assertEmployeeCompiler(success);
  for (const result of [
    null,
    {},
    { ...success, status: null },
    { ...success, status: 1 },
    { ...success, error: new Error('spawn failure') },
    { ...success, signal: 'SIGKILL' },
    { ...success, error: { code: 'ETIMEDOUT' } },
    { ...success, stdout: undefined },
  ])
    assert.throws(() => assertEmployeeCompiler(result), /did not complete/);
});

test('public source resolution follows actual exports and keeps strict repository flags', () => {
  const config = employeeCompilerConfig(
    root,
    '/synthetic/types',
    '/synthetic/fixture.ts'
  );
  assert.equal(config.compilerOptions.noEmit, true);
  assert.equal(config.compilerOptions.noCheck, false);
  assert.equal(
    config.compilerOptions.paths['@tuturuuu/internal-api/infrastructure'][0],
    path.join(root, 'packages/internal-api/src/infrastructure.ts')
  );
  assert.equal(
    config.compilerOptions.paths['@tuturuuu/types/supabase'][0],
    '/synthetic/types/src/supabase.ts'
  );
  const inherited = JSON.parse(
    readFileSync(path.join(root, 'packages/typescript-config/base.json'))
  );
  assert.equal(inherited.compilerOptions.strict, true);
  assert.equal(inherited.compilerOptions.noUncheckedIndexedAccess, true);
  assert.equal(config.compilerOptions.noUncheckedIndexedAccess, undefined);
  assert.equal(
    config.compilerOptions.paths[
      '@tuturuuu/internal-api/src/infrastructure/employee-creation'
    ],
    undefined
  );
});

test('compiler adapter uses noEmit and removes scratch on failure and success', async (t) => {
  const { directory, file, digest } = artifact(t);
  for (const status of [1, 0]) {
    let calls = 0;
    const run = () =>
      compileEmployeeConsumer({
        root,
        controlRoot: root,
        artifactPath: file,
        generatedTypesSha256: digest,
        temporaryRoot: directory,
        resolveCompiler: syntheticCompiler,
        execute(_command, args, options) {
          calls++;
          assert.equal(args.at(-1), '--noEmit');
          assert.equal(options.timeoutMs, 120000);
          assert.equal(options.buildOutput, true);
          const config = JSON.parse(readFileSync(args[2]));
          const generated =
            config.compilerOptions.paths['@tuturuuu/types/supabase'][0];
          assert.equal(
            readFileSync(generated, 'utf8'),
            readFileSync(file, 'utf8')
          );
          return { ...compilerSuccess, status };
        },
      });
    if (status === 1) await assert.rejects(run, /compiler did not complete/);
    else assert.equal((await run()).sourceCompilerQualified, true);
    assert.equal(calls, 1);
    assert.deepEqual(readdirSync(directory), ['generated-types.ts']);
  }
});

test('compiler cannot qualify artifact tampering or failed scratch cleanup', async (t) => {
  const { directory, file, digest } = artifact(t);
  const options = {
    root,
    controlRoot: root,
    artifactPath: file,
    generatedTypesSha256: digest,
    temporaryRoot: directory,
    resolveCompiler: syntheticCompiler,
  };
  await assert.rejects(
    () =>
      compileEmployeeConsumer({
        ...options,
        execute() {
          writeFileSync(file, 'changed during compiler');
          return compilerSuccess;
        },
      }),
    /artifact differs/
  );
  writeFileSync(file, 'synthetic artifact for binding controls');
  await assert.rejects(
    () =>
      compileEmployeeConsumer({
        ...options,
        execute: () => compilerSuccess,
        remove() {
          throw new Error('synthetic cleanup failure');
        },
      }),
    /cleanup failure/
  );
  assert.equal(
    readdirSync(directory).filter((name) =>
      name.startsWith('employee-consumer-')
    ).length,
    1
  );
});

function runFixture(t, overrides = {}) {
  const { directory, file, digest } = artifact(t);
  const options = {
    root,
    metadata: { projectId: binding.projectId },
    receiptDirectory: directory,
    generate: () => digest,
    env: { RUNNER_TEMP: directory },
    bind: () => structuredClone(binding),
    runSQL: () => ({ ...success, stdout: JSON.stringify(catalog) }),
    compile: () => ({ ...compilerEvidence }),
    ...overrides,
  };
  return { options, file, digest };
}

test('same-run adapter rejects a changed source, catalog, project or artifact after compilation', async (t) => {
  const baseline = runFixture(t);
  assert.equal(
    (await runEmployeePublicConsumer(baseline.options)).generatedTypesSha256,
    baseline.digest
  );
  for (const key of [
    'sourceSha',
    'controlSha',
    'projectId',
    'runId',
    'runAttempt',
    'sourceInventorySha256',
  ]) {
    let reads = 0;
    const { options } = runFixture(t, {
      bind() {
        reads++;
        return { ...binding, ...(reads === 2 ? { [key]: 'changed' } : {}) };
      },
    });
    await assert.rejects(
      () => runEmployeePublicConsumer(options),
      /changed during/
    );
  }
  let reads = 0;
  const { options } = runFixture(t, {
    runSQL() {
      const value = structuredClone(catalog);
      if (++reads === 2) value.functions[0].sha256 = 'f'.repeat(64);
      return { ...success, stdout: JSON.stringify(value) };
    },
  });
  await assert.rejects(
    () => runEmployeePublicConsumer(options),
    /changed during/
  );
  const tamper = runFixture(t);
  tamper.options.compile = () => {
    writeFileSync(tamper.file, 'replaced');
    return { ...compilerEvidence };
  };
  await assert.rejects(
    () => runEmployeePublicConsumer(tamper.options),
    /artifact differs/
  );
});

test('same-run adapter rejects SQL failure and compiler skip/failure before creating acceptance state', async (t) => {
  for (const overrides of [
    { runSQL: () => ({ ...success, status: 1 }) },
    { compile: () => null },
    { compile: () => ({ sourceCompilerQualified: false }) },
    ...[
      { status: 1 },
      { timedOut: true },
      { processGroupStopped: false },
      { compilerSha256: null },
    ].map((change) => ({
      compile: () => ({ ...compilerEvidence, ...change }),
    })),
    {
      compile: () => {
        throw new Error('compiler failed');
      },
    },
  ]) {
    const { options } = runFixture(t, overrides);
    await assert.rejects(() => runEmployeePublicConsumer(options));
  }
});

test('receipt never turns compiler-only success into database or emitted-package acceptance', () => {
  const digest = 'a'.repeat(64);
  const options = {
    state: {
      generatedTypesSha256: digest,
      compiler: { ...compilerEvidence },
    },
    generatedTypesSha256: digest,
    selected: true,
    schemaQualified: true,
    lifecycleCode: 0,
    cleanupSucceeded: true,
    finalization: {
      qualified: true,
      beforeDatabaseStop: true,
      afterCleanup: true,
    },
  };
  assert.equal(
    employeePublicConsumerReceipt(options).sourceCompilerQualified,
    true
  );
  assert.equal(
    employeePublicConsumerReceipt(options).emittedPublicPackageQualified,
    false
  );
  for (const change of [
    { state: null },
    { finalization: null },
    { finalization: { qualified: false } },
    { generatedTypesSha256: null },
    { generatedTypesSha256: 'b'.repeat(64) },
    { selected: false },
    { schemaQualified: false },
    { lifecycleCode: 1 },
    { cleanupSucceeded: false },
  ])
    assert.equal(
      employeePublicConsumerReceipt({ ...options, ...change })
        .sourceCompilerQualified,
      false
    );
});

test('binding rejects wrong exact source/control, dirty tracked source and malformed run identity', (t) => {
  const directory = temporary(t);
  const migration =
    'apps/database/supabase/migrations/20261011002109_employee_restoration.sql';
  for (const file of [
    'bun.lock',
    migration,
    '.github/workflows/employee-schema-contract.yaml',
    'apps/database/scripts/employee-public-consumer-qualification.mjs',
    'apps/database/scripts/fixtures/employee-public-consumer.ts',
    'apps/database/scripts/verify-employee-schema-contract.mjs',
    'apps/database/scripts/employee-web-session-process.mjs',
    'apps/database/scripts/employee-web-session-build-diagnostic.mjs',
    'apps/database/scripts/chat-initial-settings-qualification.mjs',
  ]) {
    const target = path.join(directory, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, 'synthetic binding bytes');
  }
  const env = {
    EMPLOYEE_SCHEMA_SOURCE_SHA: binding.sourceSha,
    EMPLOYEE_SCHEMA_CONTROL_SHA: binding.controlSha,
    GITHUB_REPOSITORY: binding.repository,
    GITHUB_RUN_ID: binding.runId,
    GITHUB_RUN_ATTEMPT: binding.runAttempt,
  };
  const metadata = { headSha: binding.sourceSha, projectId: binding.projectId };
  const read = (dirty = false) => {
    let heads = 0;
    return (_root, args) => {
      if (args[0] === 'rev-parse')
        return ++heads === 1 ? binding.sourceSha : binding.controlSha;
      if (args[0] === 'status') return dirty ? ' M bun.lock' : '';
      if (args[0] === 'ls-files') return `bun.lock\0${migration}`;
      throw new Error('Unexpected Git read');
    };
  };
  const actual = createEmployeeBinding(
    directory,
    directory,
    metadata,
    env,
    read()
  );
  assert.equal(actual.sourceSha, binding.sourceSha);
  assert.equal(actual.migrations[0].version, binding.migrations[0].version);
  for (const change of [
    { EMPLOYEE_SCHEMA_SOURCE_SHA: '9'.repeat(40) },
    { EMPLOYEE_SCHEMA_CONTROL_SHA: '9'.repeat(40) },
    { GITHUB_RUN_ID: '' },
    { GITHUB_RUN_ATTEMPT: '0' },
    { GITHUB_REPOSITORY: '' },
  ])
    assert.throws(
      () =>
        createEmployeeBinding(
          directory,
          directory,
          metadata,
          { ...env, ...change },
          read()
        ),
      /binding differs/
    );
  assert.throws(
    () =>
      createEmployeeBinding(directory, directory, metadata, env, read(true)),
    /binding differs/
  );
  assert.throws(
    () =>
      createEmployeeBinding(
        directory,
        directory,
        { ...metadata, headSha: '9'.repeat(40) },
        env,
        read()
      ),
    /binding differs/
  );
  writeFileSync(path.join(directory, 'bun.lock'), 'changed');
  assert.notEqual(
    createEmployeeBinding(directory, directory, metadata, env, read())
      .sourceInventorySha256,
    actual.sourceInventorySha256
  );
});

test('compiler rejects copied schema/config tampering and incomplete group termination', async (t) => {
  const { directory, file, digest } = artifact(t);
  const options = {
    root,
    controlRoot: root,
    artifactPath: file,
    generatedTypesSha256: digest,
    temporaryRoot: directory,
    resolveCompiler: syntheticCompiler,
  };
  for (const target of ['schema', 'config', 'fixture']) {
    await assert.rejects(
      () =>
        compileEmployeeConsumer({
          ...options,
          execute(_command, args) {
            const config = JSON.parse(readFileSync(args[2]));
            const changed =
              target === 'schema'
                ? config.compilerOptions.paths['@tuturuuu/types/supabase'][0]
                : target === 'config'
                  ? args[2]
                  : config.files[0];
            writeFileSync(changed, 'tampered compiler input');
            return compilerSuccess;
          },
        }),
      /artifact differs|fixture\/config changed/
    );
  }
  for (const change of [
    { status: null },
    { signal: 'SIGABRT' },
    { timedOut: true },
    { processGroupStopped: false },
    { buildDiagnostic: { processOutput: { truncated: true } } },
  ])
    await assert.rejects(
      () =>
        compileEmployeeConsumer({
          ...options,
          execute: () => ({ ...compilerSuccess, ...change }),
        }),
      /did not complete/
    );
  await assert.rejects(
    () =>
      compileEmployeeConsumer({
        ...options,
        execute: () => compilerSuccess,
        remove() {},
      }),
    /scratch cleanup failed/
  );
});

test('generation failure or catalog drift cannot reach the compiler', async (t) => {
  for (const generation of ['throw', 'skip', 'catalog']) {
    let calls = 0;
    let generated = false;
    const { options, digest } = runFixture(t, {
      compile() {
        calls++;
        return { ...compilerEvidence };
      },
      generate() {
        generated = true;
        if (generation === 'throw')
          throw new Error('synthetic generation failure');
        return generation === 'skip' ? undefined : digest;
      },
      runSQL() {
        const value = structuredClone(catalog);
        if (generated && generation === 'catalog')
          value.tables[0].sha256 = '1'.repeat(64);
        return { ...success, stdout: JSON.stringify(value) };
      },
    });
    await assert.rejects(() => runEmployeePublicConsumer(options));
    assert.equal(calls, 0);
  }
});

test('late runtime artifact/catalog drift cannot qualify and still cleans up once', async (t) => {
  for (const drift of ['none', 'artifact', 'catalog']) {
    const fixture = runFixture(t);
    const state = await runEmployeePublicConsumer(fixture.options);
    const original = readFileSync(fixture.file);
    let destroyed = false;
    let cleanups = 0;
    let changed = false;
    const result = await runEmployeePublicConsumerLifecycle({
      ...fixture.options,
      selected: true,
      state: () => state,
      runSQL() {
        assert.equal(destroyed, false, 'Never query after owned database stop');
        const value = structuredClone(catalog);
        if (changed && drift === 'catalog')
          value.tables[0].sha256 = '1'.repeat(64);
        return { ...success, stdout: JSON.stringify(value) };
      },
      runLifecycle: async (runner) => {
        changed = true;
        if (drift === 'artifact')
          writeFileSync(fixture.file, 'late HTTP/Web tamper');
        return (await runner('supabase', ['stop'], fixture.options.root)).code;
      },
      runner: async () => {
        cleanups++;
        writeFileSync(fixture.file, original);
        destroyed = true;
        return { code: 0 };
      },
    });
    assert.equal(cleanups, 1);
    assert.equal(result.finalization.afterCleanup, true);
    assert.equal(result.finalization.qualified, drift === 'none');
    assert.equal(result.lifecycleCode, drift === 'none' ? 0 : 1);
    const receipt = employeePublicConsumerReceipt({
      state,
      selected: true,
      schemaQualified: true,
      lifecycleCode: result.lifecycleCode,
      cleanupSucceeded: true,
      generatedTypesSha256: fixture.digest,
      finalization: result.finalization,
    });
    assert.equal(receipt.sourceCompilerQualified, drift === 'none');
  }
});

test('source or control drift during cleanup fails the final filesystem fence', async (t) => {
  for (const field of ['sourceSha', 'controlSha']) {
    const fixture = runFixture(t);
    const state = await runEmployeePublicConsumer(fixture.options);
    let destroyed = false;
    const result = await runEmployeePublicConsumerLifecycle({
      ...fixture.options,
      selected: true,
      state: () => state,
      bind: () => ({
        ...binding,
        ...(destroyed ? { [field]: '9'.repeat(40) } : {}),
      }),
      runSQL() {
        assert.equal(
          destroyed,
          false,
          'Cleanup finalization cannot query a destroyed database'
        );
        return { ...success, stdout: JSON.stringify(catalog) };
      },
      runLifecycle: async (runner) =>
        (await runner('supabase', ['stop'], fixture.options.root)).code,
      runner: async () => {
        destroyed = true;
        return { code: 0 };
      },
    });
    assert.equal(result.finalization.beforeDatabaseStop, true);
    assert.equal(result.finalization.afterCleanup, false);
    assert.equal(result.finalization.qualified, false);
    assert.equal(result.lifecycleCode, 1);
    assert.match(result.failure.message, /binding changed/);
  }
});

test('a failed final check preserves cleanup failure and original unselected errors', async (t) => {
  const fixture = runFixture(t);
  const state = await runEmployeePublicConsumer(fixture.options);
  const cleanup = new Error('owned stop failure');
  writeFileSync(fixture.file, 'late tamper');
  let attempts = 0;
  const result = await runEmployeePublicConsumerLifecycle({
    ...fixture.options,
    selected: true,
    state: () => state,
    runLifecycle: async (runner) =>
      (await runner('supabase', ['stop'], fixture.options.root)).code,
    runner: async () => {
      attempts++;
      throw cleanup;
    },
  });
  assert.equal(attempts, 1);
  assert.equal(result.lifecycleCode, 1);
  assert.equal(result.finalization.qualified, false);
  assert.ok(result.failure instanceof AggregateError);
  assert.ok(result.failure.errors.includes(cleanup));
  const original = new Error('original lifecycle failure');
  await assert.rejects(
    () =>
      runEmployeePublicConsumerLifecycle({
        selected: false,
        runner() {},
        runLifecycle: async () => {
          throw original;
        },
      }),
    (error) => error === original
  );
});
