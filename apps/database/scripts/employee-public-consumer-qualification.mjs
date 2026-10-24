import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  closeSync,
  constants,
  cpSync,
  existsSync,
  fstatSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { runOwnedSessionProcess } from './employee-web-session-process.mjs';

const fixture = 'apps/database/scripts/fixtures/employee-public-consumer.ts';
const helper =
  'apps/database/scripts/employee-public-consumer-qualification.mjs';
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const digest = (value) => sha256(JSON.stringify(value));
const hash = (value) =>
  typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const sha = (value) =>
  typeof value === 'string' &&
  /^[a-f0-9]{40}$/.test(value) &&
  value !== '0'.repeat(40);
export const employeeFunctions = Object.freeze([
  'begin_employee_restore',
  'confirm_employee_restore',
  'employee_creation_operation_advance',
  'employee_creation_operation_claim',
  'employee_creation_preflight',
  'finalize_employee_creation',
  'mark_employee_restore_attempt',
  'reconcile_employee_restore',
]);
export const employeeTables = Object.freeze([
  'employee_creation_intents',
  'employee_creation_operations',
  'employee_restore_operations',
  'infrastructure_employees',
]);
export const employeeCatalogSQL = `select json_build_object(
  'database', current_database(),
  'functions', (select json_agg(x order by x.name) from (
    select p.proname as name, pg_get_function_identity_arguments(p.oid) as identity,
      encode(sha256(convert_to(pg_get_functiondef(p.oid), 'UTF8')), 'hex') as sha256
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='private' and p.proname in (
      ${employeeFunctions.map((name) => `'${name}'`).join(',')})
  ) x),
  'tables', (select json_agg(x order by x.name) from (
    select c.relname as name, encode(sha256(convert_to(json_build_object(
      'rls', c.relrowsecurity, 'forceRls', c.relforcerowsecurity,
      'columns', (select json_agg(json_build_array(a.attname,
        format_type(a.atttypid,a.atttypmod), a.attnotnull) order by a.attnum)
        from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped)
    )::text, 'UTF8')), 'hex') as sha256
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='private' and c.relkind='r' and c.relname in (
      ${employeeTables.map((name) => `'${name}'`).join(',')})
  ) x),
  'migrations', (select json_agg(x order by x.version) from (
    select version, encode(sha256(convert_to(array_to_string(statements, E'\\n'), 'UTF8')), 'hex') as sha256
    from supabase_migrations.schema_migrations
  ) x));`;

export function selectEmployeePublicConsumer(value, options = {}) {
  if (![undefined, 'false', 'true'].includes(value))
    throw new Error('Invalid employee public consumer selection');
  if (
    value === 'true' &&
    (options.chatInitialSettings || options.structuredProvenance)
  )
    throw new Error(
      'Employee public consumer excludes chat and diagnostic profiles'
    );
  return value === 'true';
}

const git = (root, args) =>
  execFileSync('git', ['-C', root, ...args], {
    encoding: 'utf8',
    timeout: 10000,
    maxBuffer: 4 * 1024 * 1024,
  }).trim();

export function createEmployeeBinding(
  root,
  controlRoot,
  metadata,
  env = process.env,
  readGit = git
) {
  const sourceSha = readGit(root, ['rev-parse', 'HEAD']);
  const controlSha = readGit(controlRoot, ['rev-parse', 'HEAD']);
  if (
    !sha(sourceSha) ||
    !sha(controlSha) ||
    sourceSha !== env.EMPLOYEE_SCHEMA_SOURCE_SHA ||
    controlSha !== env.EMPLOYEE_SCHEMA_CONTROL_SHA ||
    metadata.headSha !== sourceSha ||
    !/^[a-z0-9_-]+$/.test(metadata.projectId ?? '') ||
    !/^[1-9][0-9]{0,19}$/.test(env.GITHUB_RUN_ID ?? '') ||
    !/^[1-9][0-9]{0,9}$/.test(env.GITHUB_RUN_ATTEMPT ?? '') ||
    !/^[\w.-]+\/[\w.-]+$/.test(env.GITHUB_REPOSITORY ?? '') ||
    readGit(root, ['status', '--porcelain', '--untracked-files=no']) ||
    readGit(controlRoot, ['status', '--porcelain', '--untracked-files=no'])
  )
    throw new Error('Employee source/control/project/run binding differs');
  const sourceFiles = readGit(root, [
    'ls-files',
    '-z',
    'packages',
    'bun.lock',
    'apps/database/supabase',
  ])
    .split('\0')
    .filter(Boolean)
    .sort();
  const controlFiles = [
    '.github/workflows/employee-schema-contract.yaml',
    helper,
    fixture,
    'apps/database/scripts/verify-employee-schema-contract.mjs',
    'apps/database/scripts/employee-web-session-process.mjs',
    'apps/database/scripts/employee-web-session-build-diagnostic.mjs',
    'apps/database/scripts/chat-initial-settings-qualification.mjs',
  ];
  const inventory = (base, files) =>
    files.map((file) => [file, sha256(readFileSync(path.join(base, file)))]);
  return {
    sourceSha,
    controlSha,
    projectId: metadata.projectId,
    repository: env.GITHUB_REPOSITORY,
    runId: env.GITHUB_RUN_ID,
    runAttempt: env.GITHUB_RUN_ATTEMPT,
    sourceInventorySha256: digest(inventory(root, sourceFiles)),
    controlInventorySha256: digest(inventory(controlRoot, controlFiles)),
    migrations: sourceFiles
      .filter((file) =>
        /^apps\/database\/supabase\/migrations\/\d+_[^/]+\.sql$/.test(file)
      )
      .map((file) => ({
        version: path.basename(file).split('_')[0],
        sha256: sha256(readFileSync(path.join(root, file))),
      })),
  };
}

export function assertEmployeeCatalog(raw, binding) {
  const catalog = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (
    catalog?.database !== 'postgres' ||
    !Array.isArray(catalog.functions) ||
    !Array.isArray(catalog.migrations) ||
    !Array.isArray(catalog.tables) ||
    !isDeepStrictEqual(
      catalog.tables.map((entry) => entry.name),
      employeeTables
    ) ||
    !catalog.tables.every((entry) => hash(entry.sha256)) ||
    !isDeepStrictEqual(
      catalog.functions.map((entry) => entry.name),
      employeeFunctions
    ) ||
    !catalog.functions.every(
      (entry) =>
        typeof entry.identity === 'string' &&
        entry.identity.length > 0 &&
        hash(entry.sha256)
    ) ||
    !isDeepStrictEqual(
      catalog.migrations.map((entry) => entry.version),
      binding.migrations.map((entry) => entry.version)
    ) ||
    !catalog.migrations.every((entry) => hash(entry.sha256))
  )
    throw new Error('Applied employee catalog/migration identity differs');
  return catalog;
}

export function assertEmployeeArtifact(file, expectedSha256) {
  if (!hash(expectedSha256))
    throw new Error('Same-run generated employee artifact differs');
  const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    if (!fstatSync(fd).isFile() || sha256(readFileSync(fd)) !== expectedSha256)
      throw new Error('Same-run generated employee artifact differs');
  } finally {
    closeSync(fd);
  }
}

// Public export targets determine source resolution; directory indexes are never guessed.
export function employeeCompilerConfig(root, overlay, fixturePath) {
  const paths = {};
  for (const directory of ['internal-api', 'types', 'supabase', 'realtime']) {
    const packageRoot = path.join(root, 'packages', directory);
    const manifestPath = path.join(packageRoot, 'package.json');
    if (!existsSync(manifestPath)) continue;
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    for (const [key, target] of Object.entries(manifest.exports ?? {})) {
      const declaration =
        typeof target === 'object' ? target?.types : undefined;
      if (!declaration?.startsWith('./dist/') || !declaration.endsWith('.d.ts'))
        continue;
      const source = declaration
        .replace('./dist/', 'src/')
        .replace(/\.d\.ts$/, '.ts');
      const sourceRoot =
        manifest.name === '@tuturuuu/types' ? overlay : packageRoot;
      const candidates = [source, source.replace(/\.ts$/, '.tsx')];
      const selected = source.includes('*')
        ? candidates
        : candidates.filter((file) => existsSync(path.join(packageRoot, file)));
      if (
        selected.length === 0 ||
        (!source.includes('*') && selected.length !== 1)
      )
        throw new Error(
          'Public export has no unique corresponding source entry'
        );
      paths[manifest.name + (key === '.' ? '' : key.slice(1))] = selected.map(
        (file) => path.join(sourceRoot, file)
      );
    }
  }
  if (
    paths['@tuturuuu/internal-api/infrastructure']?.[0] !==
      path.join(root, 'packages/internal-api/src/infrastructure.ts') ||
    paths['@tuturuuu/types/supabase']?.[0] !==
      path.join(overlay, 'src/supabase.ts')
  )
    throw new Error('Actual employee public export binding differs');
  return {
    extends: path.join(root, 'packages/typescript-config/react-library.json'),
    compilerOptions: {
      noEmit: true,
      noCheck: false,
      incremental: false,
      composite: false,
      declaration: false,
      declarationMap: false,
      module: 'ESNext',
      moduleResolution: 'Bundler',
      types: ['node'],
      typeRoots: [path.join(root, 'node_modules/@types')],
      paths,
    },
    files: [fixturePath],
    include: [],
    exclude: [],
  };
}

export function assertEmployeeCompiler(result) {
  if (
    !result ||
    result.error ||
    result.signal ||
    result.status !== 0 ||
    typeof result.stdout !== 'string' ||
    typeof result.stderr !== 'string'
  )
    throw new Error('Employee source compiler did not complete successfully');
}

export function resolveEmployeeCompiler(root) {
  const require = createRequire(
    path.join(root, 'packages/internal-api/package.json')
  );
  const manifestPath = require.resolve('typescript/package.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (
    manifest.name !== 'typescript' ||
    typeof manifest.version !== 'string' ||
    typeof manifest.bin?.tsc !== 'string'
  )
    throw new Error('Owning TypeScript compiler identity absent');
  return {
    version: manifest.version,
    executable: path.resolve(path.dirname(manifestPath), manifest.bin.tsc),
  };
}

export async function compileEmployeeConsumer({
  root,
  controlRoot,
  artifactPath,
  generatedTypesSha256,
  temporaryRoot,
  execute = runOwnedSessionProcess,
  resolveCompiler = resolveEmployeeCompiler,
  remove = rmSync,
}) {
  assertEmployeeArtifact(artifactPath, generatedTypesSha256);
  const scratch = mkdtempSync(path.join(temporaryRoot, 'employee-consumer-'));
  let result;
  let completion;
  let failure;
  try {
    const overlay = path.join(scratch, 'types');
    cpSync(path.join(root, 'packages/types/src'), path.join(overlay, 'src'), {
      recursive: true,
    });
    writeFileSync(
      path.join(overlay, 'src/supabase.ts'),
      readFileSync(artifactPath)
    );
    symlinkSync(
      path.join(root, 'packages/types/node_modules'),
      path.join(overlay, 'node_modules'),
      'dir'
    );
    const fixturePath = path.join(scratch, 'employee-public-consumer.ts');
    writeFileSync(fixturePath, readFileSync(path.join(controlRoot, fixture)));
    const configPath = path.join(scratch, 'tsconfig.json');
    const configBytes = JSON.stringify(
      employeeCompilerConfig(root, overlay, fixturePath)
    );
    const fixtureBytes = readFileSync(fixturePath);
    writeFileSync(configPath, configBytes);
    const compiler = resolveCompiler(root);
    const executable = compiler.executable;
    result = await execute(
      process.execPath,
      [executable, '--project', configPath, '--noEmit'],
      {
        cwd: root,
        timeoutMs: 120000,
        buildOutput: true,
      }
    );
    if (
      result?.status !== 0 ||
      result.signal !== null ||
      result.timedOut !== false ||
      result.processGroupStopped !== true ||
      result.buildDiagnostic?.processOutput?.truncated !== false
    )
      throw new Error('Employee source compiler did not complete successfully');
    assertEmployeeArtifact(artifactPath, generatedTypesSha256);
    assertEmployeeArtifact(
      path.join(overlay, 'src/supabase.ts'),
      generatedTypesSha256
    );
    if (
      !readFileSync(fixturePath).equals(fixtureBytes) ||
      readFileSync(configPath, 'utf8') !== configBytes
    )
      throw new Error('Employee compiler fixture/config changed');
    completion = {
      sourceCompilerQualified: true,
      compilerVersion: compiler.version,
      compilerSha256: sha256(readFileSync(executable)),
      fixtureSha256: sha256(readFileSync(fixturePath)),
      configSha256: sha256(readFileSync(configPath)),
      processOutput: result.buildDiagnostic.processOutput,
      status: result.status,
      signal: result.signal,
      timedOut: result.timedOut,
      processGroupStopped: result.processGroupStopped,
    };
  } catch (error) {
    failure = error;
  }
  try {
    remove(scratch, { recursive: true });
    if (existsSync(scratch))
      throw new Error('Employee compiler scratch cleanup failed');
  } catch (error) {
    if (failure)
      throw new AggregateError(
        [failure, error],
        'Employee compiler and scratch cleanup failed'
      );
    throw error;
  }
  if (failure) throw failure;
  return completion;
}

function compilerQualified(compiler) {
  return (
    compiler?.sourceCompilerQualified === true &&
    compiler.status === 0 &&
    compiler.signal === null &&
    compiler.timedOut === false &&
    compiler.processGroupStopped === true &&
    hash(compiler.compilerSha256) &&
    hash(compiler.fixtureSha256) &&
    hash(compiler.configSha256)
  );
}

export function generateEmployeeTypes({
  binaryPath,
  metadata,
  receiptDirectory,
  bounded,
}) {
  const types = bounded(
    binaryPath,
    [
      'gen',
      'types',
      'typescript',
      '--local',
      '--schema',
      'public,private,storage',
    ],
    metadata.disposableRoot,
    120000
  );
  if (!types.includes('export type Database ='))
    throw new Error('Generated database types absent');
  const generatedTypesSha256 = sha256(types);
  writeFileSync(path.join(receiptDirectory, 'generated-types.ts'), types, {
    mode: 0o600,
  });
  return generatedTypesSha256;
}

export async function runEmployeePublicConsumer({
  root,
  metadata,
  receiptDirectory,
  generate,
  runSQL,
  env = process.env,
  compile = compileEmployeeConsumer,
  bind = createEmployeeBinding,
}) {
  const controlRoot = fileURLToPath(new URL('../../../', import.meta.url));
  const binding = bind(root, controlRoot, metadata, env);
  const artifactPath = path.join(receiptDirectory, 'generated-types.ts');
  const observe = () => {
    const result = runSQL(employeeCatalogSQL, 10000);
    assertEmployeeCompiler(result);
    return assertEmployeeCatalog(result.stdout, binding);
  };
  const catalog = observe();
  const generatedTypesSha256 = generate();
  assertEmployeeArtifact(artifactPath, generatedTypesSha256);
  if (!isDeepStrictEqual(catalog, observe()))
    throw new Error('Employee applied catalog changed during generation');
  const compiler = await compile({
    root,
    controlRoot,
    artifactPath,
    generatedTypesSha256,
    temporaryRoot: env.RUNNER_TEMP,
  });
  if (!compilerQualified(compiler))
    throw new Error('Employee compiler qualification absent');
  assertEmployeeArtifact(artifactPath, generatedTypesSha256);
  if (
    !isDeepStrictEqual(binding, bind(root, controlRoot, metadata, env)) ||
    !isDeepStrictEqual(catalog, observe())
  )
    throw new Error(
      'Employee source/control/applied catalog changed during compilation'
    );
  return {
    binding,
    generatedTypesSha256,
    catalog,
    catalogSha256: digest(catalog),
    compiler,
  };
}

export function assertEmployeeSchemaSnapshot(root, metadata, trackedFiles) {
  for (const file of trackedFiles.filter(
    (file) => !file.endsWith('/supabase/config.toml')
  )) {
    const copied = path.join(
      metadata.disposableRoot,
      file.replace('apps/database/', '')
    );
    if (!readFileSync(path.join(root, file)).equals(readFileSync(copied)))
      throw new Error('Full schema snapshot differs');
  }
}

export function assertEmployeePublicConsumerState({
  state,
  root,
  metadata,
  receiptDirectory,
  runSQL,
  env = process.env,
  bind = createEmployeeBinding,
}) {
  if (!state || !compilerQualified(state.compiler))
    throw new Error('Employee compiler qualification absent');
  assertEmployeeArtifact(
    path.join(receiptDirectory, 'generated-types.ts'),
    state.generatedTypesSha256
  );
  const controlRoot = fileURLToPath(new URL('../../../', import.meta.url));
  if (!isDeepStrictEqual(state.binding, bind(root, controlRoot, metadata, env)))
    throw new Error(
      'Employee source/control binding changed after compilation'
    );
  if (runSQL) {
    const result = runSQL(employeeCatalogSQL, 10000);
    assertEmployeeCompiler(result);
    const catalog = assertEmployeeCatalog(result.stdout, state.binding);
    if (
      !isDeepStrictEqual(state.catalog, catalog) ||
      state.catalogSha256 !== digest(catalog)
    )
      throw new Error('Employee applied catalog changed after compilation');
  }
}

export async function runEmployeePublicConsumerLifecycle({
  selected,
  state,
  root,
  metadata,
  receiptDirectory,
  runSQL,
  runner,
  runLifecycle,
  env = process.env,
  bind = createEmployeeBinding,
}) {
  if (!selected)
    return {
      lifecycleCode: await runLifecycle(runner),
      finalization: null,
      failure: null,
    };
  const failures = [];
  let beforeDatabaseStop = false;
  let afterCleanup = false;
  const check = (live) =>
    assertEmployeePublicConsumerState({
      state: state(),
      root,
      metadata,
      receiptDirectory,
      env,
      bind,
      runSQL: live ? runSQL : undefined,
    });
  const guardedRunner = async (command, args, cwd) => {
    if (!args.includes('stop')) return runner(command, args, cwd);
    try {
      check(true);
      beforeDatabaseStop = true;
    } catch (error) {
      failures.push(error);
    }
    try {
      const result = await runner(command, args, cwd);
      if (result.code !== 0)
        failures.push(new Error('Owned employee cleanup failed'));
      return result;
    } catch (error) {
      failures.push(error);
      return { code: 1 };
    }
  };
  let lifecycleCode = 1;
  try {
    lifecycleCode = await runLifecycle(guardedRunner);
  } catch (error) {
    failures.push(error);
  }
  try {
    check(false);
    afterCleanup = true;
  } catch (error) {
    failures.push(error);
  }
  const qualified =
    lifecycleCode === 0 &&
    beforeDatabaseStop &&
    afterCleanup &&
    failures.length === 0;
  return {
    lifecycleCode: qualified ? 0 : lifecycleCode || 1,
    finalization: {
      beforeDatabaseStop,
      afterCleanup,
      qualified,
      failureCount: failures.length,
    },
    failure:
      failures.length > 1
        ? new AggregateError(
            failures,
            'Employee finalization and cleanup failed'
          )
        : (failures[0] ?? null),
  };
}

export function employeePublicConsumerReceipt({
  state,
  selected,
  schemaQualified,
  generatedTypesSha256,
  lifecycleCode,
  cleanupSucceeded,
  finalization,
}) {
  const sourceCompilerQualified =
    selected === true &&
    schemaQualified === true &&
    lifecycleCode === 0 &&
    cleanupSucceeded === true &&
    finalization?.qualified === true &&
    finalization.beforeDatabaseStop === true &&
    finalization.afterCleanup === true &&
    hash(generatedTypesSha256) &&
    state?.generatedTypesSha256 === generatedTypesSha256 &&
    compilerQualified(state?.compiler);
  return {
    selected,
    sourceCompilerQualified,
    emittedPublicPackageQualified: false,
    databaseCleanup: cleanupSucceeded,
    finalization: finalization ?? null,
    lifecycleCode,
    evidence: state ?? null,
  };
}
