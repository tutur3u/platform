#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileAtomically } from './atomic-file.js';
import {
  boundedCommand,
  commandFailure,
  createProducerTracker,
  requireCommand,
  safeFailure,
} from './employee-validation-command.mjs';
import {
  regularOwnedFile,
  sha256,
  verifyAdmission,
  verifySources,
  verifyStaged,
} from './employee-validation-core.mjs';
import { verifyDependencies } from './employee-validation-dependencies.mjs';
import {
  createAttemptContext,
  getAttemptRecovery,
  parseReviewedAdmission,
  executePackets,
} from './employee-validation-supervisor.mjs';
import { checkStartup } from './employee-validation-host.mjs';
import {
  capOwnedDatabase,
  ownedTypegen,
  proveCleanup,
} from './employee-validation-resources.mjs';
import {
  getBundledSupabaseBinaryPath,
  getSupabaseWrapperPath,
} from './run-supabase.js';
import {
  chooseAvailablePortBlock,
  deriveIsolatedIdentity,
  removeDisposableRoot,
  runIsolatedLifecycle,
  stageDisposableProject,
} from './run-supabase-isolated.js';

export { checkStartup } from './employee-validation-host.mjs';

const excluded =
  'gotrue,realtime,storage-api,imgproxy,kong,mailpit,postgrest,postgres-meta,studio,edge-runtime,logflare,vector,supavisor';
const trackedArgs = ['ls-files', '-z', '--', 'apps/database/supabase'];
function git(root, args) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    timeout: 10000,
  });
}
export function parseAdmission(argv) {
  assert.equal(
    argv.length,
    8,
    'Requires manifest/admission paths and their exact reviewed SHA256'
  );
  const result = {};
  for (let i = 0; i < argv.length; i += 2) {
    assert(
      [
        '--manifest',
        '--manifest-sha256',
        '--admission',
        '--admission-sha256',
      ].includes(argv[i])
    );
    assert(!Object.hasOwn(result, argv[i]), 'Duplicate admission flag');
    result[argv[i]] = argv[i + 1];
  }
  for (const flag of ['--manifest-sha256', '--admission-sha256'])
    assert.match(result[flag], /^[a-f0-9]{64}$/u);
  return result;
}
export function loadReviewedJson(file, digest) {
  const bytes = readFileSync(file);
  assert.equal(sha256(bytes), digest, 'Reviewed packet changed');
  return parseReviewedAdmission(bytes);
}

export { executePackets } from './employee-validation-supervisor.mjs';

async function prepareTypes(root, options, generated) {
  const io = (operation) =>
    options.context
      ? options.context.step('type-files', operation)
      : operation();
  const typeRoot = path.join(options.metadata.disposableRoot, 'actual-types');
  const target = path.join(typeRoot, 'packages/types/src/supabase.ts');
  await io(() => mkdir(path.dirname(target), { recursive: true }));
  await io(() =>
    writeFile(target, generated.contents, { flag: 'wx', mode: 0o600 })
  );
  console.log(`Actual generated types SHA256 ${sha256(generated.contents)}`);
  const fixture = 'apps/database/scripts/employee-validation-types.ts';
  await io(() =>
    mkdir(path.join(typeRoot, 'apps/database/scripts'), {
      recursive: true,
    })
  );
  await io(() =>
    writeFile(path.join(typeRoot, fixture), regularOwnedFile(root, fixture), {
      flag: 'wx',
    })
  );
  await io(() =>
    symlink(
      path.join(root, 'node_modules'),
      path.join(typeRoot, 'node_modules'),
      'dir'
    )
  );
  return { typeRoot, fixture };
}

export async function actualTypegen(root, options) {
  assert(
    options.admission.version !== 2 || options.context,
    'Dedicated context required'
  );
  const {
    tracker = createProducerTracker(),
    run: suppliedRun = requireCommand,
    generate = ownedTypegen,
    prepare = prepareTypes,
    verifyInstalled = verifyDependencies,
  } = options;
  const run = options.context ? options.context.run : suppliedRun;
  options.context?.budget();
  verifyInstalled(root, options.admission.dependencyIdentity);
  options.context?.budget();
  const generated = await generate({
    root,
    metadata: options.metadata,
    context: options.context,
    tracker,
    image: options.admission.images.find((image) => image.role === 'pgmeta').id,
    run: (command, args, cwd, settings) =>
      tracker.attempt(settings.phase, () => run(command, args, cwd, settings)),
  });
  options.recordTypegen(generated.cleanup);
  const { typeRoot, fixture } = options.context
    ? await options.context.step('prepare-types', () =>
        prepare(root, options, generated)
      )
    : await prepare(root, options, generated);
  await tracker.attempt('typegen-compiler', () =>
    run(
      options.context ? 'reviewed-node' : process.execPath,
      [
        path.join(root, 'node_modules/typescript/bin/tsc'),
        '--ignoreConfig',
        '--noEmit',
        '--strict',
        '--skipLibCheck',
        '--target',
        'esnext',
        '--module',
        'nodenext',
        '--moduleResolution',
        'nodenext',
        fixture,
      ],
      typeRoot,
      { phase: 'typegen-compiler' }
    )
  );
  options.context?.budget();
  verifyInstalled(root, options.admission.dependencyIdentity);
  options.context?.budget();
  console.log(
    'Actual generated private RPC inference and negative controls: PASS'
  );
}

export function createEmployeeRunner({
  root,
  metadata,
  admission,
  checkSources,
  checkBeforeStart,
  recordFailure,
  recordCleanup,
  getTypegenReceipt,
  tracker = createProducerTracker(),
  run = boundedCommand,
  cap = capOwnedDatabase,
  recordCaps = () => {},
  cleanup = proveCleanup,
  sql = executePackets,
  context = null,
}) {
  if (context) run = context.run;
  const nestedRun = context ? context.run : requireCommand;
  assert(admission.version !== 2 || context, 'Dedicated context required');
  let startLaunched = false,
    cleanupProof = null;
  const secondaryFailures = [];
  const attemptCleanup = async () => {
    cleanupProof = await cleanup(
      root,
      metadata,
      context ? context.run : undefined,
      context
    );
    recordCleanup(cleanupProof);
  };
  return async (command, commandArgs, cwd) => {
    try {
      if (commandArgs.includes('start')) {
        await checkBeforeStart();
      }
      if (commandArgs.includes('test')) {
        await tracker.attempt('sql', async () => {
          await sql({
            root,
            metadata,
            admission,
            checkSources,
            context,
            tracker,
            run: (cmd, args, cwd, settings) =>
              tracker.attempt(settings.phase, () =>
                nestedRun(cmd, args, cwd, settings)
              ),
          });
          return { clientClosed: true };
        });
        return { code: 0 };
      }
      const phase = commandArgs.includes('start')
        ? 'start'
        : commandArgs.includes('stop')
          ? 'stop'
          : 'reset';
      if (phase === 'stop' && context) {
        await attemptCleanup();
        assert(
          getTypegenReceipt() === null ||
            getTypegenReceipt().createAcknowledged === true,
          'Typegen acknowledgement missing'
        );
        assert(
          tracker.receipts().every((r) => r.clientClosed === true),
          'Producer closure unproved'
        );
        return { code: 0, clientClosed: true };
      }
      if (phase === 'stop' && !startLaunched) {
        await attemptCleanup();
        return {
          code: 0,
          clientClosed: true,
          reason: 'native-start-never-launched',
        };
      }
      if (phase === 'start') startLaunched = true;
      let result,
        nativeFailure = null;
      try {
        result = await tracker.attempt(phase, () =>
          run(
            context ? 'reviewed-cli' : command,
            commandArgs.includes('start')
              ? [...commandArgs, '--exclude', excluded]
              : commandArgs,
            cwd,
            { timeoutMs: phase === 'stop' ? 60000 : 300000, phase }
          )
        );
      } catch (error) {
        nativeFailure = error;
      }
      if (phase === 'stop') {
        try {
          await attemptCleanup();
        } catch (error) {
          secondaryFailures.push({
            source: 'resource-absence',
            ...safeFailure(error, 'cleanup'),
          });
          nativeFailure ??= error;
        }
      }
      if (nativeFailure) throw nativeFailure;
      if (result.code !== 0 || !result.clientClosed)
        throw commandFailure(result);
      if (phase === 'start' || phase === 'reset')
        recordCaps({
          phase,
          ...(await cap(
            root,
            metadata,
            admission.images.find((image) => image.role === 'postgres').id,
            (cmd, args, cwd, settings) =>
              tracker.attempt(settings.phase, () =>
                nestedRun(cmd, args, cwd, settings)
              ),
            context
          )),
        });
      if (phase === 'stop') {
        const typegenReceipt = getTypegenReceipt();
        assert(
          typegenReceipt === null ||
            (typegenReceipt.absent &&
              typegenReceipt.clientClosed &&
              typegenReceipt.createAcknowledged === true &&
              !typegenReceipt.failure),
          'Typegen closure unproved; retain recovery metadata'
        );
        assert(
          tracker.receipts().every((receipt) => receipt.clientClosed === true),
          'Producer closure unproved; retain recovery metadata'
        );
      }
      return result;
    } catch (error) {
      recordFailure(
        error,
        commandArgs.includes('stop')
          ? 'cleanup'
          : commandArgs.includes('test')
            ? 'sql'
            : commandArgs.includes('start')
              ? 'start'
              : 'reset'
      );
      if (commandArgs.includes('stop'))
        recordCleanup({
          ...cleanupProof,
          failed: true,
          failure: safeFailure(error, 'cleanup'),
          producerReceipts: tracker.receipts(),
          secondaryFailures: [
            ...tracker.secondaryFailures(),
            ...secondaryFailures,
          ],
          typegenReceipt: getTypegenReceipt(),
        });
      return { code: 1 };
    }
  };
}

export async function runEmployeeGate(argv, injected = {}) {
  const args = parseAdmission(argv);
  const manifest = loadReviewedJson(
    args['--manifest'],
    args['--manifest-sha256']
  );
  const admission = loadReviewedJson(
    args['--admission'],
    args['--admission-sha256']
  );
  verifyAdmission(
    admission,
    args['--manifest-sha256'],
    injected.now?.() ?? Date.now()
  );
  const root = injected.root ?? process.cwd();
  const context =
    admission.version === 2
      ? await createAttemptContext({
          admission,
          admissionSha256: args['--admission-sha256'],
          supervisor: injected.supervisor,
          clock: injected.clock,
        })
      : null;
  if (!context)
    assert.equal(
      process.platform,
      'linux',
      'Requires authorized shared Linux host'
    );
  const checkSources = () =>
    verifySources(
      root,
      manifest,
      git(root, trackedArgs).split('\0').filter(Boolean),
      git(root, [
        'ls-files',
        '--others',
        '--exclude-standard',
        '-z',
        '--',
        'apps/database/supabase',
      ])
        .split('\0')
        .filter(Boolean),
      git(root, ['rev-parse', 'HEAD']).trim()
    );
  let files, binaryPath, startupReceipt, metadata;
  try {
    context?.budget();
    files = checkSources();
    context?.budget();
    binaryPath = getBundledSupabaseBinaryPath(
      getSupabaseWrapperPath(path.join(root, 'apps/database'))
    );
    assert(
      binaryPath,
      'Installed native CLI missing; no installer/download fallback'
    );
    assert.equal(sha256(readFileSync(binaryPath)), admission.cliBinarySha256);
    verifyDependencies(root, admission.dependencyIdentity);
    // Entire host budget and installed image selection are admitted BEFORE staging/start.
    startupReceipt = await checkStartup(root, admission, undefined, context);
    const identity = deriveIsolatedIdentity({
      headSha: manifest.headSha,
      repositoryPath: root,
    });
    const ports = context
      ? { basePort: admission.supervisor.basePort }
      : await chooseAvailablePortBlock(identity);
    const stageOptions = {
      repositoryRoot: root,
      headSha: manifest.headSha,
      projectId: identity.projectId,
      basePort: ports.basePort,
      trackedFiles: files,
      testPath: 'supabase/tests/employee-signup-guards.sql',
      typegenOutput: 'packages/types/src/supabase.ts',
      ...(context
        ? {
            temporaryRoot: admission.supervisor.temporaryRoot,
            diagnostic: () => {},
            removeStagedRoot: (root) =>
              context.persist('partial-root-retained', { root }, 'close'),
          }
        : {}),
    };

    metadata = context
      ? await context.step('stage', () =>
          (injected.stage ?? stageDisposableProject)(stageOptions)
        )
      : await stageDisposableProject(stageOptions);
    if (context) {
      await context.persist('staged-root', { root: metadata.disposableRoot });
      await context.step('seal-config', async () => {
        await (injected.writeConfig ?? writeFile)(
          path.join(metadata.disposableRoot, 'supabase/config.toml'),
          admission.supervisor.configBytes
        );
        verifyStaged(root, metadata, files, context);
      });
      await context.attest();
    }
  } catch (primary) {
    if (context) await context.fail(primary, 'prestage-failed-retain');
    throw primary;
  }
  console.log(
    JSON.stringify({
      projectId: metadata.projectId,
      disposableRoot: metadata.disposableRoot,
      manifestSha256: args['--manifest-sha256'],
      phase: admission.phase,
    })
  );
  let primary = null,
    cleanupReceipt = null,
    typegenReceipt = null;
  const dbCapsReceipts = [];
  const workerLedger = (receipts) => writeFileAtomically(
    path.join(metadata.disposableRoot, 'employee-producers.json'),
    `${JSON.stringify(receipts, null, 2)}\n`,
    { writeOptions: { flag: 'wx', mode: 0o600 } }
  );
  const tracker = createProducerTracker({
    persist: async (receipts) => {
      if (!context) return workerLedger(receipts);
      await context.persist('producer-ledger', receipts);
      return context.step('worker-producer-ledger', () => workerLedger(receipts));
    },
  });
  const runner = createEmployeeRunner({
    root,
    metadata,
    admission,
    context,
    checkSources,
    checkBeforeStart: async () => {
      context?.budget();
      verifyAdmission(admission, args['--manifest-sha256']);
      checkSources();
      verifyStaged(root, metadata, files, context);
      startupReceipt = await checkStartup(root, admission, undefined, context);
    },
    recordFailure: (error, phase) => {
      error.receipt ??= safeFailure(error, phase);
      primary ??= error;
    },
    recordCaps: (receipt) => dbCapsReceipts.push(receipt),
    recordCleanup: (receipt) => {
      cleanupReceipt = receipt;
    },
    getTypegenReceipt: () => typegenReceipt,
    tracker,
  });
  let code;
  try {
    code = await runIsolatedLifecycle({
      binaryPath,
      metadata,
      runner,
      ...(context
        ? {
            updateMetadata: (ownedRoot, value) =>
              context.persist('lifecycle-metadata', { ownedRoot, value }),
          }
        : {}),
      stderr: { write: () => {} },
      removeRoot: async (ownedRoot) => {
        let rootRemoved = false;
        try {
          if (context)
            await context.removeRoot(ownedRoot, async (root, options) => {
              await (injected.removeRoot ?? removeDisposableRoot)(root, options);
              assert.equal(existsSync(root), false, 'Disposable root remains');
              rootRemoved = true;
            });
          else {
            await removeDisposableRoot(ownedRoot);
            assert.equal(existsSync(ownedRoot), false, 'Disposable root remains');
            rootRemoved = true;
          }
          cleanupReceipt = { ...cleanupReceipt, rootRemoved, finalPersistenceAcknowledged: context ? true : null };
        } catch (error) {
          cleanupReceipt = {
            ...cleanupReceipt,
            rootRemoved,
            finalPersistenceAcknowledged: context ? false : null,
            failed: true,
            failure: safeFailure(error, 'root-removal'),
          };
          throw error;
        }
      },
      typegen: async (options) => {
        try {
          checkSources();
          verifyStaged(root, metadata, files, context);
          await actualTypegen(root, {
            ...options,
            admission,
            tracker,
            context,
            ...(context ? { run: context.run } : {}),
            recordTypegen: (receipt) => {
              typegenReceipt = receipt;
            },
          });
        } catch (error) {
          primary ??= error;
          typegenReceipt ??= error.cleanup ?? {
            absent: false,
            clientClosed: false,
          };
          throw error;
        }
      },
    });
  } catch (error) {
    primary ??= error;
    code = 1;
  }
  // Shared lifecycle owns stop --project-id --no-backup and retains failed-cleanup metadata.
  console.log(
    JSON.stringify({
      code,
      runtimeAdmission: null,
      dedicatedNativeBackend: 'DENIED-unimplemented',
      primary: primary ? safeFailure(primary) : null,
      startupReceipt,
      dbCapsReceipts,
      dependencyIdentitySha256: admission.dependencyIdentitySha256,
      cleanupReceipt,
      typegenReceipt,
      producerReceipts: tracker.receipts(),
      providerRuntimeExecuted: false,
    })
  );
  return code;
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  runEmployeeGate(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(
        JSON.stringify({ ...safeFailure(error, 'admission-or-execution'), recovery: getAttemptRecovery(error) })
      );
      process.exitCode = 1;
    });
}
