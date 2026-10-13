import { createHash } from 'node:crypto';
import {
  lstatSync,
  mkdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

const denied = () => new Error('Employee composed consumer closure denied');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const employeeConsumerFiles = Object.freeze(
  [
    [
      'apps/web/src/lib/infrastructure/employee-creation-boundary.ts',
      'd4075c887cfbd70af48327cfce4c4ff0a34bbbe1bd84fd41bed71986cec7df0c',
    ],
    [
      'apps/web/src/lib/infrastructure/employee-creation-boundary.test.ts',
      '91675f0a6579436fe7099b33c35afb75fa484442ee23f4ca91f63cc0c4ff29ff',
    ],
    [
      'packages/internal-api/src/infrastructure/employee-creation.ts',
      '30fcf98d42145b7964b96e0a6ed7ea0d2867442d0296a0a39abd106ce5199f37',
    ],
    [
      'packages/internal-api/src/infrastructure/employee-creation.test.ts',
      '973bb6af0024b0b80fd56ea1b1cfdbd4b6a8a597d5154871ce5098823f0107ba',
    ],
    [
      'packages/internal-api/src/infrastructure.ts',
      '46d03caa09f0640f171d79177436fa214544daf00184f5029c091083d40fbd95',
    ],
  ].map(([file, sha256]) => Object.freeze({ path: file, sha256 }))
);
export function validateEmployeeConsumerFiles(files) {
  if (
    !Array.isArray(files) ||
    files.length !== employeeConsumerFiles.length ||
    files.some(
      (row, i) =>
        !row ||
        Object.keys(row).sort().join(',') !== 'path,sha256' ||
        row.path !== employeeConsumerFiles[i].path ||
        row.sha256 !== employeeConsumerFiles[i].sha256
    )
  )
    throw denied();
  return hash(JSON.stringify(files));
}
export function observeEmployeeConsumerFiles(root) {
  const files = employeeConsumerFiles.map(({ path: file }) => {
    let current = root;
    for (const part of file.split('/')) {
      current = path.join(current, part);
      if (lstatSync(current).isSymbolicLink()) throw denied();
    }
    if (!lstatSync(current).isFile()) throw denied();
    return { path: file, sha256: hash(readFileSync(current)) };
  });
  return {
    files,
    consumerManifestSha256: validateEmployeeConsumerFiles(files),
    consumerCommit: '68a47c83c4ecc40f422749a6dd288b82a75441d6',
  };
}
const identityKeys = [
  'profile',
  'sourceSha',
  'controlSha',
  'projectId',
  'snapshotSha256',
  'networkId',
  'sourceManifestSha256',
  'consumerManifestSha256',
  'controlManifestSha256',
];
export function validateEmployeeAppliedIdentity(value) {
  if (
    !value ||
    Object.keys(value).sort().join(',') !==
      [...identityKeys].sort().join(',') ||
    ![
      'employee-creation-composed-v1',
      'employee-creation-composed-reviewed-marker-v1',
    ].includes(value.profile) ||
    (value.profile === 'employee-creation-composed-reviewed-marker-v1' &&
      value.sourceSha !== '9224768b9789c525e05b78f9e381949f91267a8f') ||
    (value.profile === 'employee-creation-composed-v1' &&
      value.sourceSha === '9224768b9789c525e05b78f9e381949f91267a8f') ||
    !['sourceSha', 'controlSha'].every(
      (key) =>
        /^[a-f0-9]{40}$/.test(value[key] ?? '') &&
        value[key] !== '0'.repeat(40) &&
        value[key] !== '84ec8e04c4a412c7dd1501f2bb7ce14c0dda01ea' &&
        (key !== 'sourceSha' ||
          value[key] !== '68a47c83c4ecc40f422749a6dd288b82a75441d6')
    ) ||
    !/^tt-[a-z0-9-]+-[a-f0-9]{8}-[a-f0-9]{10}$/.test(value.projectId ?? '') ||
    !identityKeys
      .filter((key) => key.endsWith('Sha256') || key === 'networkId')
      .every((key) => /^[a-f0-9]{64}$/.test(value[key] ?? ''))
  )
    throw denied();
  return { ...value };
}
export const employeeCatalogSignatures = Object.freeze([
  'private.employee_creation_preflight(uuid,uuid,text,text)',
  'private.finalize_employee_creation(uuid,uuid,text,text)',
  'private.confirm_employee_activation(uuid,uuid,text)',
  'private.employee_creation_operation_snapshot(private.employee_creation_operations)',
  'private.employee_creation_operation_ready(uuid)',
  'private.employee_creation_operation_claim(uuid,uuid,text,text)',
  'private.employee_creation_operation_advance(uuid,uuid,uuid,integer,uuid,text,jsonb)',
  'private.employee_creation_operation_revoke(uuid,uuid)',
]);
export const employeeCatalogQuery = `SELECT json_build_object(
  'functions', (SELECT json_agg(json_build_object('signature', signature, 'definition', pg_get_functiondef(to_regprocedure(signature))) ORDER BY ordinal)
    FROM unnest(ARRAY[${employeeCatalogSignatures.map((s) => `'${s}'`).join(',')}]) WITH ORDINALITY AS required(signature, ordinal)),
  'migrations', (SELECT json_agg(version ORDER BY version) FROM supabase_migrations.schema_migrations)
)::text;`;
export function readEmployeeAppliedCatalog({
  identity,
  migrations,
  metadata,
  runner,
}) {
  const output = runner(
    'docker',
    [
      'exec',
      '--env',
      'PGOPTIONS=-c statement_timeout=45000 -c lock_timeout=3000',
      `supabase_db_${metadata.projectId}`,
      'psql',
      '-X',
      '-A',
      '-t',
      '-v',
      'ON_ERROR_STOP=1',
      '-U',
      'supabase_admin',
      '--dbname',
      'postgres',
      '-c',
      employeeCatalogQuery,
    ],
    metadata.disposableRoot,
    60000
  );
  return employeeCatalogReceipt(identity, output, migrations);
}
export function employeeCatalogReceipt(identity, output, migrations) {
  validateEmployeeAppliedIdentity(identity);
  if (typeof output !== 'string' || Buffer.byteLength(output) > 1024 * 1024)
    throw denied();
  const data = JSON.parse(output);
  if (
    !data ||
    Object.keys(data).sort().join(',') !== 'functions,migrations' ||
    !Array.isArray(data.functions) ||
    data.functions.length !== employeeCatalogSignatures.length ||
    !Array.isArray(data.migrations) ||
    data.migrations.some((s) => typeof s !== 'string') ||
    new Set(data.migrations).size !== data.migrations.length ||
    !migrations.every(({ path: file }) =>
      data.migrations.includes(path.basename(file).split('_')[0])
    )
  )
    throw denied();
  const functions = data.functions.map((row, i) => {
    if (
      !row ||
      Object.keys(row).sort().join(',') !== 'definition,signature' ||
      row.signature !== employeeCatalogSignatures[i] ||
      typeof row.definition !== 'string' ||
      !row.definition.trim()
    )
      throw denied();
    return { signature: row.signature, definitionHash: hash(row.definition) };
  });
  return {
    ...identity,
    kind: 'applied-employee-catalog-v1',
    functions,
    actualCatalogDefinitionHash: hash(JSON.stringify(functions)),
    appliedMigrationLedgerHash: hash(JSON.stringify(data.migrations)),
  };
}
// Real public imports and schema indexes. No RPC declarations or private-module aliases.
export const employeePublicTypeControl = `import { createInternalEmployee, createJournaledInternalEmployee, type EmployeeCreationOptions, type CreateJournaledInternalEmployeeResponse } from '@tuturuuu/internal-api/infrastructure';
import type { Database } from '@tuturuuu/types/supabase';
type Assert<T extends true> = T;
type LegacyOptional = Assert<undefined extends Parameters<typeof createInternalEmployee>[1] ? true : false>;
type StrictRequired = Assert<undefined extends Parameters<typeof createJournaledInternalEmployee>[1] ? false : true>;
const options: EmployeeCreationOptions = { operationId: '0da9bb8d-fd22-433b-97a0-d54a0cecf5b3' };
const payload = { email: 'staff@tuturuuu.com', displayName: 'Staff', temporaryPassword: 'temporary-pass-123' };
function compileOnly() {
  createInternalEmployee(payload);
  createJournaledInternalEmployee(payload, options);
  // @ts-expect-error The strict public entry requires operation options.
  createJournaledInternalEmployee(payload);
  // @ts-expect-error Operation identity cannot be omitted.
  createJournaledInternalEmployee(payload, {});
  const pending: CreateJournaledInternalEmployeeResponse = { status: 'pending', operationId: options.operationId, code: 'employee_provisioning_pending', nextAction: 'inspect' };
  return pending;
}
type Operations = Database['private']['Tables']['employee_creation_operations']['Row'];
type Intents = Database['private']['Tables']['employee_creation_intents']['Row'];
type Employees = Database['private']['Tables']['infrastructure_employees']['Row'];
`;
/** A disposable filesystem view uses actual source symlinks and the single real generated
 * canonical Supabase artifact. It never copies declarations or edits the selected source. */
export async function compileEmployeeComposedConsumers({
  repositoryRoot,
  receiptDirectory,
  trackedFiles,
  identity,
  typeGeneration,
  catalog,
  consumers,
  runner,
}) {
  validateEmployeeAppliedIdentity(identity);
  if (
    validateEmployeeConsumerFiles(consumers.files) !==
      identity.consumerManifestSha256 ||
    !identityKeys.every((key) => catalog?.[key] === identity[key]) ||
    ![
      'sourceSha',
      'controlSha',
      'projectId',
      'snapshotSha256',
      'networkId',
    ].every((key) => typeGeneration?.[key] === identity[key]) ||
    !identityKeys.every(
      (key) => typeGeneration?.appliedIdentity?.[key] === identity[key]
    ) ||
    typeGeneration?.actualCatalogDefinitionHash !==
      catalog?.actualCatalogDefinitionHash ||
    typeGeneration?.appliedMigrationLedgerHash !==
      catalog?.appliedMigrationLedgerHash ||
    typeGeneration?.generated !== true ||
    typeGeneration.artifact !== 'generated-types.ts' ||
    typeof runner !== 'function'
  )
    throw denied();
  const artifact = path.join(receiptDirectory, 'generated-types.ts');
  if (
    lstatSync(artifact).isSymbolicLink() ||
    hash(readFileSync(artifact)) !== typeGeneration.sha256
  )
    throw denied();
  if (
    observeEmployeeConsumerFiles(repositoryRoot).consumerManifestSha256 !==
    identity.consumerManifestSha256
  )
    throw denied();
  const view = path.join(receiptDirectory, 'consumer-source');
  mkdirSync(view, { mode: 0o700 });
  if (
    !Array.isArray(trackedFiles) ||
    new Set(trackedFiles).size !== trackedFiles.length ||
    !trackedFiles.includes('packages/types/src/supabase.ts')
  )
    throw denied();
  for (const file of trackedFiles) {
    if (
      path.isAbsolute(file) ||
      file.split('/').some((p) => !p || p === '..') ||
      file.startsWith('node_modules/')
    )
      throw denied();
    const target = path.join(view, file);
    mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
    symlinkSync(
      file === 'packages/types/src/supabase.ts'
        ? artifact
        : path.join(repositoryRoot, file),
      target
    );
  }
  symlinkSync(
    path.join(repositoryRoot, 'node_modules'),
    path.join(view, 'node_modules')
  );
  const control = path.join(view, 'employee-public-control.ts');
  writeFileSync(control, employeePublicTypeControl, {
    flag: 'wx',
    mode: 0o600,
  });
  const config = path.join(view, 'employee-consumer-tsconfig.json');
  writeFileSync(
    config,
    JSON.stringify(
      employeeConsumerCompilerConfig({ repositoryRoot, view, control })
    ),
    { flag: 'wx', mode: 0o600 }
  );
  await runner(
    path.join(repositoryRoot, 'node_modules/.bin/tsgo'),
    ['--project', config, '--pretty', 'false'],
    view,
    { timeoutMs: 60000, maxBytes: 1024 * 1024 }
  );
  if (
    hash(readFileSync(artifact)) !== typeGeneration.sha256 ||
    observeEmployeeConsumerFiles(repositoryRoot).consumerManifestSha256 !==
      identity.consumerManifestSha256
  )
    throw denied();
  return {
    ...identity,
    kind: 'strict-public-employee-consumer-v1',
    generatedTypesSha256: typeGeneration.sha256,
    actualCatalogDefinitionHash: catalog.actualCatalogDefinitionHash,
    compiler: 'tsgo',
    strict: true,
    noEmit: true,
    skipLibCheck: false,
    noUncheckedIndexedAccess: true,
    exitCode: 0,
    files: consumers.files,
    publicEntry: 'packages/internal-api/src/infrastructure.ts',
  };
}
export function employeeComposedChainComplete({
  identity,
  catalog,
  typeGeneration,
  consumer,
  lifecycleCode,
  cleanupSucceeded,
  packetsValidated,
}) {
  validateEmployeeAppliedIdentity(identity);
  return (
    lifecycleCode === 0 &&
    cleanupSucceeded === true &&
    packetsValidated === true &&
    catalog?.kind === 'applied-employee-catalog-v1' &&
    consumer?.kind === 'strict-public-employee-consumer-v1' &&
    [catalog, consumer].every((receipt) =>
      identityKeys.every((key) => receipt[key] === identity[key])
    ) &&
    [
      'sourceSha',
      'controlSha',
      'projectId',
      'snapshotSha256',
      'networkId',
    ].every((key) => typeGeneration?.[key] === identity[key]) &&
    typeGeneration?.generated === true &&
    /^[a-f0-9]{64}$/.test(typeGeneration.sha256 ?? '') &&
    identityKeys.every(
      (key) => typeGeneration.appliedIdentity?.[key] === identity[key]
    ) &&
    typeGeneration.actualCatalogDefinitionHash ===
      catalog.actualCatalogDefinitionHash &&
    typeGeneration.appliedMigrationLedgerHash ===
      catalog.appliedMigrationLedgerHash &&
    consumer.generatedTypesSha256 === typeGeneration.sha256 &&
    consumer.actualCatalogDefinitionHash ===
      catalog.actualCatalogDefinitionHash &&
    /^[a-f0-9]{64}$/.test(catalog.actualCatalogDefinitionHash ?? '') &&
    consumer.exitCode === 0 &&
    consumer.strict === true &&
    consumer.noEmit === true &&
    consumer.skipLibCheck === false &&
    consumer.noUncheckedIndexedAccess === true &&
    validateEmployeeConsumerFiles(consumer.files) ===
      identity.consumerManifestSha256
  );
}

export function employeeConsumerCompilerConfig({
  repositoryRoot,
  view = repositoryRoot,
  control,
}) {
  const entries = [
    ...employeeConsumerFiles.map((row) => row.path),
    'apps/web/src/lib/infrastructure/employee-creation-journal.ts',
    'apps/web/src/lib/infrastructure/employee-creation-operation-store.ts',
    'apps/web/src/lib/infrastructure/employee-creation-phase-adapter.ts',
    'apps/web/src/lib/infrastructure/employee-creation-supplier.ts',
    'packages/inventory-core/src/lib/infrastructure/employee-sql/employee-fixed-sql-process.ts',
    'packages/inventory-core/src/lib/infrastructure/employee-sql/employee-sql-catalog-readiness.ts',
    'apps/infrastructure/src/lib/internal-accounts/employee-creation-sql.ts',
  ];
  const paths = Object.fromEntries(
    ['internal-api', 'types', 'supabase', 'utils'].flatMap((name) => [
      [`@tuturuuu/${name}`, [path.join(view, `packages/${name}/src/index.ts`)]],
      [`@tuturuuu/${name}/*`, [path.join(view, `packages/${name}/src/*`)]],
    ])
  );
  const inventory = JSON.parse(
    readFileSync(
      path.join(repositoryRoot, 'packages/inventory-core/package.json'),
      'utf8'
    )
  );
  for (const name of ['process', 'catalog', 'database-readiness']) {
    const entry = inventory.exports?.[`./infrastructure/employee-sql/${name}`];
    if (
      typeof entry !== 'string' ||
      !entry.startsWith('./src/lib/infrastructure/employee-sql/') ||
      entry.includes('..')
    )
      throw denied();
    paths[`@tuturuuu/inventory-core/infrastructure/employee-sql/${name}`] = [
      path.join(view, 'packages/inventory-core', entry),
    ];
  }
  return {
    compilerOptions: {
      strict: true,
      noEmit: true,
      skipLibCheck: false,
      noUncheckedIndexedAccess: true,
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'Bundler',
      esModuleInterop: true,
      resolveJsonModule: true,
      preserveSymlinks: true,
      lib: ['ES2022', 'DOM', 'DOM.Iterable'],
      types: ['node'],
      typeRoots: [path.join(repositoryRoot, 'node_modules/@types')],
      paths,
    },
    files: [
      ...entries.map((file) => path.join(view, file)),
      ...(control ? [control] : []),
    ],
  };
}
