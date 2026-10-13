import assert from 'node:assert/strict';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  compileEmployeeComposedConsumers,
  employeeCatalogQuery,
  employeeCatalogReceipt,
  employeeCatalogSignatures,
  employeeComposedChainComplete,
  employeeConsumerCompilerConfig,
  employeeConsumerFiles,
  employeePublicTypeControl,
  observeEmployeeConsumerFiles,
  validateEmployeeAppliedIdentity,
  validateEmployeeConsumerFiles,
} from './employee-schema-composed-consumers.mjs';
import {
  assertEmployeeQualificationUnchanged,
  employeeQualificationHash,
  observeEmployeeGitCommit,
  observeEmployeeQualification,
  qualificationControlPaths,
} from './employee-schema-qualification-profile.mjs';
import { runIsolatedLifecycle } from './run-supabase-isolated.js';

const sourceSha = process.env.EMPLOYEE_COMPOSED_SOURCE_FIXTURE_SHA;
const sourceRoot = process.env.EMPLOYEE_COMPOSED_SOURCE_FIXTURE_ROOT;
const consumers = () => observeEmployeeConsumerFiles(sourceRoot);
const identity = () => ({
  profile: 'employee-creation-composed-reviewed-auth-declaration-v1',
  sourceSha,
  controlSha: 'f47e6ba5952359c85f0ef1791be5e379cd5768b3',
  projectId: `tt-source-${sourceSha?.slice(0, 8)}-0123456789`,
  snapshotSha256: 'a'.repeat(64),
  networkId: 'b'.repeat(64),
  sourceManifestSha256: 'c'.repeat(64),
  consumerManifestSha256: consumers().consumerManifestSha256,
  controlManifestSha256: 'd'.repeat(64),
});
const migrations = [
  {
    path: 'apps/database/supabase/migrations/20261013030000_employee_creation_operations.sql',
    sha256: 'a'.repeat(64),
  },
];
const rows = () => ({
  functions: employeeCatalogSignatures.map((signature) => ({
    signature,
    definition: `CREATE FUNCTION ${signature} RETURNS void`,
  })),
  migrations: ['20261013030000'],
});
// These definitions are synthetic parser controls. They never originate from PostgreSQL.
const catalog = () =>
  employeeCatalogReceipt(identity(), JSON.stringify(rows()), migrations);
const generated = () => ({
  ...identity(),
  generated: true,
  artifact: 'generated-types.ts',
  sha256: 'e'.repeat(64),
  appliedIdentity: identity(),
  actualCatalogDefinitionHash: catalog().actualCatalogDefinitionHash,
  appliedMigrationLedgerHash: catalog().appliedMigrationLedgerHash,
});
const consumer = () => ({
  ...identity(),
  kind: 'strict-public-employee-consumer-v1',
  generatedTypesSha256: 'e'.repeat(64),
  actualCatalogDefinitionHash: catalog().actualCatalogDefinitionHash,
  exitCode: 0,
  strict: true,
  noEmit: true,
  skipLibCheck: false,
  noUncheckedIndexedAccess: true,
  files: consumers().files,
});
const chain = () => ({
  identity: identity(),
  catalog: catalog(),
  typeGeneration: generated(),
  consumer: consumer(),
  lifecycleCode: 0,
  cleanupSucceeded: true,
  packetsValidated: true,
});

test('independent consumer closure reads all five real frozen public source bytes', () => {
  assert.ok(sourceRoot);
  const observed = consumers();
  assert.deepEqual(observed.files, employeeConsumerFiles);
  assert.equal(
    observed.consumerCommit,
    '68a47c83c4ecc40f422749a6dd288b82a75441d6'
  );
  assert.equal(
    observed.files.at(-1).path,
    'packages/internal-api/src/infrastructure.ts'
  );
  const entry = readFileSync(
    `${sourceRoot}/packages/internal-api/src/infrastructure.ts`,
    'utf8'
  );
  assert.match(
    entry,
    /createInternalEmployee as createJournaledInternalEmployee/u
  );
});
for (const change of [
  'missing',
  'extra',
  'reordered',
  'changed',
  'duplicate',
  'extra-key',
])
  test(`consumer byte manifest denies ${change}`, () => {
    const files = structuredClone(consumers().files);
    if (change === 'missing') files.pop();
    if (change === 'extra') files.push(files[0]);
    if (change === 'reordered') files.reverse();
    if (change === 'changed') files[4].sha256 = 'f'.repeat(64);
    if (change === 'duplicate') files[4] = files[0];
    if (change === 'extra-key') files[4].consumerQualified = true;
    assert.throws(() => validateEmployeeConsumerFiles(files));
  });
test('actual catalog definitions are hashed separately from SQL source', () => {
  const receipt = catalog();
  assert.equal(receipt.functions.length, 8);
  assert.match(receipt.actualCatalogDefinitionHash, /^[a-f0-9]{64}$/u);
  assert.match(
    employeeCatalogQuery,
    /pg_get_functiondef\(to_regprocedure\(signature\)\)/u
  );
  assert.match(employeeCatalogQuery, /supabase_migrations.schema_migrations/u);
  assert.equal(Object.hasOwn(receipt, 'catalogQualified'), false);
  const changed = rows();
  changed.functions[0].definition += ' changed';
  assert.notEqual(
    employeeCatalogReceipt(identity(), JSON.stringify(changed), migrations)
      .actualCatalogDefinitionHash,
    receipt.actualCatalogDefinitionHash
  );
});
for (const change of [
  'missing-function',
  'null-definition',
  'wrong-signature',
  'reordered',
  'missing-migration',
  'duplicate-migration',
  'extra-key',
  'malformed',
])
  test(`catalog input denies ${change}`, () => {
    const data = rows();
    if (change === 'missing-function') data.functions.pop();
    if (change === 'null-definition') data.functions[0].definition = null;
    if (change === 'wrong-signature')
      data.functions[0].signature = 'public.fake_rpc()';
    if (change === 'reordered') data.functions.reverse();
    if (change === 'missing-migration') data.migrations = [];
    if (change === 'duplicate-migration')
      data.migrations.push(data.migrations[0]);
    if (change === 'extra-key') data.qualified = true;
    assert.throws(() =>
      employeeCatalogReceipt(
        identity(),
        change === 'malformed' ? '{' : JSON.stringify(data),
        migrations
      )
    );
  });
for (const key of Object.keys(identity()))
  test(`all receipts deny mismatched applied identity ${key}`, () => {
    const input = chain();
    input.consumer[key] = 'mismatch';
    assert.equal(employeeComposedChainComplete(input), false);
    input.consumer = consumer();
    input.catalog[key] = 'mismatch';
    assert.equal(employeeComposedChainComplete(input), false);
    input.catalog = catalog();
    input.typeGeneration.appliedIdentity[key] = 'mismatch';
    assert.equal(employeeComposedChainComplete(input), false);
  });
for (const change of [
  'catalog',
  'types',
  'consumer',
  'compile',
  'strict',
  'skip',
  'noEmit',
  'cleanup',
  'lifecycle',
  'packets',
  'generated-hash',
  'catalog-hash',
])
  test(`incomplete real receipt chain cannot qualify: ${change}`, () => {
    const input = chain();
    if (change === 'catalog') input.catalog = null;
    if (change === 'types') input.typeGeneration = null;
    if (change === 'consumer') input.consumer = null;
    if (change === 'compile') input.consumer.exitCode = 1;
    if (change === 'strict') input.consumer.strict = false;
    if (change === 'skip') input.consumer.skipLibCheck = true;
    if (change === 'noEmit') input.consumer.noEmit = false;
    if (change === 'cleanup') input.cleanupSucceeded = false;
    if (change === 'lifecycle') input.lifecycleCode = 1;
    if (change === 'packets') input.packetsValidated = false;
    if (change === 'generated-hash')
      input.consumer.generatedTypesSha256 = 'f'.repeat(64);
    if (change === 'catalog-hash')
      input.consumer.actualCatalogDefinitionHash = 'f'.repeat(64);
    assert.equal(employeeComposedChainComplete(input), false);
  });
test('no fabricated or inherited source identity is accepted', () => {
  for (const value of [
    undefined,
    null,
    '',
    '0'.repeat(40),
    '68a47c83c4ecc40f422749a6dd288b82a75441d6',
    '84ec8e04c4a412c7dd1501f2bb7ce14c0dda01ea',
  ]) {
    assert.throws(() =>
      validateEmployeeAppliedIdentity({ ...identity(), sourceSha: value })
    );
  }
});
test('compiler admission rejects mismatched identity before any compiler command or filesystem staging', async () => {
  let called = false;
  await assert.rejects(
    compileEmployeeComposedConsumers({
      repositoryRoot: sourceRoot,
      receiptDirectory: '/not-created',
      trackedFiles: [],
      identity: identity(),
      typeGeneration: generated(),
      catalog: { ...catalog(), projectId: 'foreign' },
      consumers: consumers(),
      runner: async () => {
        called = true;
      },
    })
  );
  assert.equal(called, false);
});
test('real public entry controls require strict options and generated schema indexes without fake RPCs', () => {
  assert.match(
    employeePublicTypeControl,
    /from '@tuturuuu\/internal-api\/infrastructure'/u
  );
  assert.match(
    employeePublicTypeControl,
    /Database\['private'\]\['Tables'\]\['employee_creation_operations'\]/u
  );
  assert.doesNotMatch(
    employeePublicTypeControl,
    /declare |as unknown|Rpc|Functions\]\[/u
  );
});

test('compiler configuration checks actual public entries and actual declared package subpaths', () => {
  const config = employeeConsumerCompilerConfig({ repositoryRoot: sourceRoot });
  assert.equal(config.compilerOptions.strict, true);
  assert.equal(config.compilerOptions.noEmit, true);
  assert.equal(config.compilerOptions.skipLibCheck, false);
  assert.equal(config.compilerOptions.noUncheckedIndexedAccess, true);
  assert.ok(
    config.files.includes(
      `${sourceRoot}/packages/internal-api/src/infrastructure.ts`
    )
  );
  assert.ok(
    config.files.includes(
      `${sourceRoot}/apps/web/src/lib/infrastructure/employee-creation-operation-store.ts`
    )
  );
  assert.deepEqual(
    config.compilerOptions.paths[
      '@tuturuuu/inventory-core/infrastructure/employee-sql/catalog'
    ],
    [
      `${sourceRoot}/packages/inventory-core/src/lib/infrastructure/employee-sql/employee-sql-catalog-readiness.ts`,
    ]
  );
  assert.equal(
    Object.keys(config.compilerOptions.paths).some((key) =>
      key.includes('employee-creation')
    ),
    false
  );
});

// Compiler commands are injected; these fixture controls never qualify real types.
for (const drift of [
  'none',
  'supplier',
  'journal',
  'generated',
  'auth-patch',
  'auth-control',
  'lock',
])
  test(`compiler reobserves complete closure and lifecycle cleans up: ${drift}`, async () => {
    const controls = qualificationControlPaths.map((file) => ({
      path: file,
      sha256: employeeQualificationHash(file),
    }));
    const input = {
      repositoryRoot: sourceRoot,
      choice: 'composed',
      sourceSha,
      observedSourceSha: sourceSha,
      authoritativeSourceSha: sourceSha,
      gitIdentity: observeEmployeeGitCommit(sourceRoot, sourceSha),
      controlFiles: controls,
      expectedControlFiles: controls,
    };
    const baseline = observeEmployeeQualification(input);
    const directory = mkdtempSync(path.join(os.tmpdir(), 'employee-closure-'));
    const fixture = path.join(directory, 'fixture');
    const receipts = path.join(directory, 'receipts');
    mkdirSync(receipts, { mode: 0o700 });
    const files = [
      ...new Set([
        ...baseline.fullSourceManifest.files.map((row) => row.path),
        'packages/types/src/supabase.ts',
      ]),
    ];
    for (const file of files) {
      const target = path.join(fixture, file);
      mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
      copyFileSync(path.join(sourceRoot, file), target);
    }
    const qualificationInput = { ...input, repositoryRoot: fixture };
    const observation = observeEmployeeQualification(qualificationInput);
    const applied = {
      ...identity(),
      sourceManifestSha256: observation.sourceManifestSha256,
    };
    const actualCatalog = employeeCatalogReceipt(
      applied,
      JSON.stringify(rows()),
      migrations
    );
    const bytes = readFileSync(
      path.join(sourceRoot, 'packages/types/src/supabase.ts')
    );
    const artifact = path.join(receipts, 'generated-types.ts');
    writeFileSync(artifact, bytes, { mode: 0o600 });
    const types = {
      ...generated(),
      ...applied,
      appliedIdentity: applied,
      sha256: employeeQualificationHash(bytes),
      actualCatalogDefinitionHash: actualCatalog.actualCatalogDefinitionHash,
      appliedMigrationLedgerHash: actualCatalog.appliedMigrationLedgerHash,
    };
    const outsideFive = observation.manifest.files.filter(
      (row) =>
        !employeeConsumerFiles.some((consumer) => consumer.path === row.path)
    );
    const supplier = outsideFive.find((row) =>
      row.path.endsWith('/employee-creation-sql.ts')
    );
    const journal = outsideFive.find((row) =>
      row.path.endsWith('/employee-creation-journal.ts')
    );
    assert.ok(supplier);
    assert.ok(journal);
    const controller = readFileSync(
      new URL('./verify-employee-schema-contract.mjs', import.meta.url),
      'utf8'
    );
    const start = controller.indexOf(
      'consumerReceipt = await compileEmployeeComposedConsumers('
    );
    const end = controller.indexOf(
      '          if (\n            JSON.stringify(readAppliedCatalog())',
      start
    );
    assert.ok(start > 0 && end > start);
    const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
    const compileAtControllerBoundary = new AsyncFunction(
      'inputs',
      `
      const { root, receiptDirectory, consumerTrackedFiles, appliedIdentity, typegenReceipt, catalogReceipt, observation, runTypegenCommand, qualificationInput, compileEmployeeComposedConsumers, assertEmployeeQualificationUnchanged } = inputs;
      let consumerReceipt;
      ${controller.slice(start, end)}
      return consumerReceipt;
    `
    );
    const events = [];
    let admitted = false;
    try {
      const code = await runIsolatedLifecycle({
        binaryPath: 'injected-no-runtime',
        metadata: {
          disposableRoot: directory,
          projectId: applied.projectId,
          typegenOutput: artifact,
        },
        registerSignals: () => () => events.push('signals-drained'),
        updateMetadata: async () => {},
        stderr: { write: () => {} },
        runner: async (_binary, args) => {
          events.push(args[2]);
          return { code: 0 };
        },
        removeRoot: async () => events.push('removed'),
        typegen: async () => {
          await compileAtControllerBoundary({
            root: fixture,
            receiptDirectory: receipts,
            consumerTrackedFiles: files,
            appliedIdentity: () => applied,
            typegenReceipt: types,
            catalogReceipt: actualCatalog,
            observation,
            qualificationInput,
            compileEmployeeComposedConsumers,
            assertEmployeeQualificationUnchanged,
            runTypegenCommand: async () => {
              events.push('compile');
              if (drift !== 'none') {
                const target =
                  drift === 'generated'
                    ? artifact
                    : path.join(
                        fixture,
                        drift === 'supplier'
                          ? supplier.path
                          : drift === 'journal'
                            ? journal.path
                            : drift === 'auth-patch'
                              ? 'patches/@supabase%2Fauth-js@2.117.1.patch'
                              : drift === 'auth-control'
                                ? 'packages/supabase/type-tests/auth-webauthn-compat.ts'
                                : 'bun.lock'
                      );
                writeFileSync(target, 'changed disposable bytes');
              }
            },
          });
          admitted = true;
        },
      });
      assert.equal(code, drift === 'none' ? 0 : 1);
      assert.equal(admitted, drift === 'none');
      assert.deepEqual(events, [
        'start',
        'db',
        'test',
        'compile',
        'signals-drained',
        'stop',
        'removed',
      ]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

test('applied identity cannot use prior profiles to admit the auth successor', () => {
  assert.equal(
    validateEmployeeAppliedIdentity(identity()).profile,
    'employee-creation-composed-reviewed-auth-declaration-v1'
  );
  for (const profile of [
    'employee-creation-composed-v1',
    'employee-creation-composed-reviewed-marker-v1',
  ])
    assert.throws(() =>
      validateEmployeeAppliedIdentity({ ...identity(), profile })
    );
  for (const sourceSha of [
    '9224768b9789c525e05b78f9e381949f91267a8f',
    'f'.repeat(40),
  ])
    assert.throws(() =>
      validateEmployeeAppliedIdentity({ ...identity(), sourceSha })
    );
});
