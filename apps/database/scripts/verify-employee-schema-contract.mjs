#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  compileEmployeeComposedConsumers,
  employeeComposedChainComplete,
  readEmployeeAppliedCatalog,
} from './employee-schema-composed-consumers.mjs';
import { startEmployeeLoopbackRelay } from './employee-schema-loopback-relay.mjs';
import {
  assertEmployeeQualificationUnchanged,
  employeeQualificationExecutionReceipt,
  employeeQualificationHash,
  evaluateEmployeeQualificationPackets,
  observedEmployeeFile,
  observeEmployeeGitCommit,
  observeEmployeeQualification,
  qualificationControlPaths,
  selectEmployeeQualificationProfile,
  selectedFailureDiagnostic,
} from './employee-schema-qualification-profile.mjs';
import {
  startEmployeeDbStartEvidence,
  startupAdmissionDiagnostic,
} from './employee-schema-start-evidence.mjs';
import {
  assertPacketTap,
  assertRollbackSource,
  exactSourceSha,
} from './employee-schema-tap.mjs';
import {
  classifyEmployeeStartupFailure,
  employeeStartupConnectionEvidence,
  finishEmployeeControllerWorkers,
  generateEmployeeTypes,
  readEmployeeNetwork,
  runTypegenCommand,
  schemaSnapshotHash,
  startEmployeeNetworkObserver,
} from './employee-schema-typegen.mjs';
import { ensureSupabaseBinary } from './run-supabase.js';
import {
  chooseAvailablePortBlock,
  cleanupInterruptedProject,
  deriveIsolatedIdentity,
  hasProjectCollision,
  readLifecycleMetadata,
  runIsolatedLifecycle,
  stageDisposableProject,
} from './run-supabase-isolated.js';

const root = process.cwd();
const sourceSha = exactSourceSha(process.env.EMPLOYEE_SCHEMA_SOURCE_SHA);
const controlSha = exactSourceSha(process.env.EMPLOYEE_SCHEMA_CONTROL_SHA);
if (process.env.GITHUB_ACTIONS !== 'true' || process.platform !== 'linux') {
  throw new Error('This gate requires a disposable hosted Linux runner');
}
const head = execFileSync('git', ['rev-parse', 'HEAD'], {
  encoding: 'utf8',
  timeout: 10000,
}).trim();
if (head !== sourceSha) throw new Error('Source commit differs');
if (
  execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], {
    encoding: 'utf8',
    timeout: 10000,
  }).trim()
)
  throw new Error('Tracked source differs from the selected commit');
const choice = process.env.EMPLOYEE_SCHEMA_QUALIFICATION;
const selected = selectEmployeeQualificationProfile(
  process.argv[2] === '--cleanup' ? 'foundation' : choice
);
let observation = null;
let qualificationInput = null;
if (process.argv[2] !== '--cleanup') {
  const controlRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../..'
  );
  const controlFiles = qualificationControlPaths.map((file) =>
    observedEmployeeFile(controlRoot, file)
  );
  const expectedControlFiles = qualificationControlPaths.map((file) => ({
    path: file,
    sha256: employeeQualificationHash(
      execFileSync('git', ['show', `${controlSha}:${file}`], {
        cwd: controlRoot,
        timeout: 10000,
        maxBuffer: 1024 * 1024,
      })
    ),
  }));
  qualificationInput = {
    repositoryRoot: root,
    choice,
    sourceSha,
    observedSourceSha: head,
    gitIdentity:
      choice === 'composed' ? observeEmployeeGitCommit(root, head) : undefined,
    authoritativeSourceSha:
      process.env.EMPLOYEE_SCHEMA_AUTHORITATIVE_SOURCE_SHA,
    controlFiles,
    expectedControlFiles,
  };
  observation = observeEmployeeQualification(qualificationInput);
  if (process.argv[2] === '--preflight') process.exit(0);
}
const identity = deriveIsolatedIdentity({
  headSha: head,
  repositoryPath: root,
});
const network = await readEmployeeNetwork(root);
const ownerPath = path.join(
  process.env.RUNNER_TEMP,
  'employee-schema-owned.json'
);
if (process.argv[2] === '--cleanup') {
  if (existsSync(ownerPath)) {
    const owner = JSON.parse(readFileSync(ownerPath, 'utf8'));
    if (owner.headSha !== head || owner.projectId !== identity.projectId) {
      throw new Error('Cleanup owner differs from exact source');
    }
    if (existsSync(owner.disposableRoot)) {
      const metadata = await readLifecycleMetadata(owner.disposableRoot);
      if (
        metadata.headSha !== head ||
        metadata.projectId !== identity.projectId
      ) {
        throw new Error('Cleanup metadata differs');
      }
      const binaryPath = await ensureSupabaseBinary(
        path.join(root, 'apps/database')
      );
      process.exitCode = await cleanupInterruptedProject({
        binaryPath,
        metadata,
        runner: async (command, args, cwd) => {
          await readEmployeeNetwork(root);
          const result = spawnSync(
            command,
            ['--network-id', network.name, ...args],
            {
              cwd,
              timeout: 60000,
              killSignal: 'SIGKILL',
              stdio: 'ignore',
            }
          );
          if (result.error || result.signal || result.status !== 0)
            return { code: 1 };
          const names = spawnSync(
            'docker',
            [
              'ps',
              '-a',
              '--filter',
              `label=com.supabase.cli.project=${metadata.projectId}`,
              '--format',
              '{{.ID}}',
            ],
            {
              encoding: 'utf8',
              timeout: 10000,
              maxBuffer: 1024 * 1024,
              stdio: ['ignore', 'pipe', 'pipe'],
            }
          );
          return {
            code:
              names.error ||
              names.signal ||
              names.status !== 0 ||
              names.stdout.trim().length !== 0
                ? 1
                : 0,
          };
        },
      });
    }
  }
  process.exit(process.exitCode ?? 0);
}
const binaryPath = await ensureSupabaseBinary(path.join(root, 'apps/database'));
if (
  (
    await runTypegenCommand(binaryPath, ['--version'], root, {
      timeoutMs: 10000,
      maxBytes: 1024,
    })
  )
    .toString()
    .trim() !== '2.117.0'
)
  throw new Error('Employee CLI admission failed');
const names = execFileSync('docker', ['ps', '-a', '--format', '{{.Names}}'], {
  encoding: 'utf8',
  timeout: 10000,
})
  .trim()
  .split('\n');
if (hasProjectCollision(identity.projectId, names))
  throw new Error('Owned project collision');
const trackedFiles = execFileSync(
  'git',
  ['ls-files', '-z', 'apps/database/supabase'],
  {
    encoding: 'utf8',
    timeout: 10000,
  }
)
  .split('\0')
  .filter(Boolean);
const fixtureHashes = selected.packets.map(({ file }) => {
  const relative = `apps/database/supabase/tests/${file}`;
  if (!trackedFiles.includes(relative))
    throw new Error('Required employee packet absent');
  const bytes = readFileSync(path.join(root, relative));
  assertRollbackSource(bytes.toString('utf8'));
  return { file, sha256: createHash('sha256').update(bytes).digest('hex') };
});
const ports = await chooseAvailablePortBlock(identity);
const metadata = await stageDisposableProject({
  repositoryRoot: root,
  headSha: head,
  projectId: identity.projectId,
  basePort: ports.basePort,
  trackedFiles,
  testPath: 'supabase/tests/employee-signup-guards.sql',
  typegenOutput: 'packages/types/src/supabase.ts',
});
writeFileSync(
  ownerPath,
  JSON.stringify({
    headSha: head,
    projectId: metadata.projectId,
    disposableRoot: metadata.disposableRoot,
  }),
  { flag: 'wx', mode: 0o600 }
);
const receiptDirectory = path.join(
  process.env.RUNNER_TEMP,
  'employee-schema-receipts'
);
mkdirSync(receiptDirectory, { recursive: true, mode: 0o700 });
const snapshotSha256 = schemaSnapshotHash(root, trackedFiles);
const networkObserver = startEmployeeNetworkObserver(
  metadata.projectId,
  network.id
);
const startupObserver = startEmployeeDbStartEvidence({
  sourceSha,
  controlSha,
  projectId: metadata.projectId,
  network,
  dbPort: ports.ports['db.port'],
  imageRef: 'ghcr.io/supabase/postgres:17.6.1.167',
});
const relay = startEmployeeLoopbackRelay({
  sourceSha,
  controlSha,
  projectId: metadata.projectId,
  network,
  dbPort: ports.ports['db.port'],
  imageRef: 'ghcr.io/supabase/postgres:17.6.1.167',
});
// The reviewed native CLI reads this supported shell override before project dotenv.
process.env.SUPABASE_SERVICES_HOSTNAME = '127.0.0.1';
process.env.DOCKER_HOST = 'unix:///var/run/docker.sock';
const packets = [];
let schemaExecutionSucceeded = false;
let typegenReceipt = null;
let catalogReceipt = null;
let consumerReceipt = null;
let cleanupSucceeded = false;
let currentPhase = 'full-schema-snapshot';
let packetOrdinal = 0;
let failureDiagnostic = null;
const appliedIdentity = () => ({
  profile: selected.name,
  sourceSha,
  controlSha,
  projectId: metadata.projectId,
  snapshotSha256,
  networkId: network.id,
  sourceManifestSha256: observation.sourceManifestSha256,
  consumerManifestSha256: observation.consumers.consumerManifestSha256,
  controlManifestSha256: observation.controlManifestSha256,
});
const bounded = (command, args, cwd, timeout) => {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    timeout,
    killSignal: 'SIGKILL',
    maxBuffer: 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  // Never print SQL diagnostics, fixture identities, CLI tokens or credentials.
  if (result.error || result.signal || result.status !== 0) {
    failureDiagnostic ??= {
      ...selectedFailureDiagnostic(currentPhase, packetOrdinal, result),
      ...(currentPhase === 'start'
        ? {
            startup: classifyEmployeeStartupFailure(result),
            startupConnection: employeeStartupConnectionEvidence(
              result,
              ports.ports['db.port']
            ),
          }
        : {}),
    };
    throw new Error('Bounded employee schema command failed');
  }
  return result.stdout;
};
const readAppliedCatalog = () => {
  currentPhase = 'catalog';
  return readEmployeeAppliedCatalog({
    identity: appliedIdentity(),
    migrations: selected.migrations,
    metadata,
    runner: bounded,
  });
};
const excluded =
  'gotrue,realtime,storage-api,imgproxy,kong,mailpit,postgrest,postgres-meta,studio,edge-runtime,logflare,vector,supavisor';
const runner = async (command, args, cwd) => {
  try {
    if (args.includes('start')) await relay.phase('start');
    else if (args.includes('reset')) await relay.phase('reset');
    else if (args.includes('stop')) {
      // A relay failure must not prevent exact owned database cleanup.
      try {
        await relay.phase('cleanup');
      } catch {
        /* Final receipt retains denial. */
      }
    }
    await readEmployeeNetwork(root);
    if (!args.includes('stop')) await networkObserver.assertHealthy();
    if (args.includes('test')) {
      const container = `supabase_db_${metadata.projectId}`;
      for (const [
        position,
        { file, assertions: count },
      ] of selected.packets.entries()) {
        packetOrdinal = position + 1;
        currentPhase = 'fixture-hash';
        const fixture = path.join(
          metadata.disposableRoot,
          'supabase/tests',
          file
        );
        const actual = createHash('sha256')
          .update(readFileSync(fixture))
          .digest('hex');
        if (
          actual !== fixtureHashes.find((entry) => entry.file === file).sha256
        ) {
          throw new Error('Isolated fixture differs');
        }
        const target = '/tmp/employee-schema-contract.sql';
        currentPhase = 'packet-copy';
        bounded(
          'docker',
          ['cp', fixture, `${container}:${target}`],
          cwd,
          10000
        );
        currentPhase = 'packet-execution';
        const tap = bounded(
          'docker',
          [
            'exec',
            '--env',
            'PGOPTIONS=-c statement_timeout=45000 -c lock_timeout=3000',
            container,
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
            '-f',
            target,
          ],
          cwd,
          60000
        );
        currentPhase = 'packet-tap';
        try {
          packets.push({
            file,
            assertions: assertPacketTap(tap, count),
            sourceSha,
            sha256: actual,
            exitCode: 0,
            tap,
          });
        } catch {
          failureDiagnostic ??= selectedFailureDiagnostic(
            currentPhase,
            packetOrdinal,
            { stdout: tap }
          );
          throw new Error('Employee packet TAP contract failed');
        }
      }
      evaluateEmployeeQualificationPackets(observation, packets, 0, false);
      schemaExecutionSucceeded = true;
    } else {
      packetOrdinal = 0;
      currentPhase = args.includes('stop')
        ? 'cleanup'
        : args.includes('start')
          ? 'start'
          : 'reset';
      bounded(
        command,
        [
          '--network-id',
          network.name,
          ...(args.includes('start') ? [...args, '--exclude', excluded] : args),
        ],
        cwd,
        args.includes('stop') ? 60000 : 600000
      );
      if (args.includes('stop')) {
        currentPhase = 'cleanup-proof';
        const names = bounded(
          'docker',
          [
            'ps',
            '-a',
            '--filter',
            `label=com.supabase.cli.project=${metadata.projectId}`,
            '--format',
            '{{.ID}}',
          ],
          cwd,
          10000
        );
        if (names.trim().length !== 0) {
          throw new Error('Owned database remains after stop');
        }
        cleanupSucceeded = true;
      }
    }
    if (!args.includes('stop')) await networkObserver.assertHealthy();
    return { code: 0 };
  } catch {
    failureDiagnostic ??= selectedFailureDiagnostic(
      currentPhase,
      packetOrdinal
    );
    return { code: 1 };
  }
};
let lifecycleCode = 1;
let startupAdmission = 'worker-initialize';
try {
  await startupObserver.started();
  startupAdmission = 'relay-initialize';
  await relay.started();
  startupAdmission = 'primary-network-ready';
  const verifiedReadyMarker = await networkObserver.ready();
  startupAdmission = 'worker-network-ready';
  await startupObserver.ready(verifiedReadyMarker);
  startupAdmission = 'relay-network-ready';
  await relay.ready(verifiedReadyMarker);
  startupAdmission = 'observer-health';
  await networkObserver.assertHealthy();
  startupAdmission = 'admitted';
  // Verify complete tracked database snapshot, including every migration, not only fixtures.
  for (const file of trackedFiles.filter(
    (file) => !file.endsWith('/supabase/config.toml')
  )) {
    if (
      !readFileSync(path.join(root, file)).equals(
        readFileSync(
          path.join(metadata.disposableRoot, file.replace('apps/database/', ''))
        )
      )
    )
      throw new Error('Full schema snapshot differs');
  }
  lifecycleCode = await runIsolatedLifecycle({
    binaryPath,
    metadata,
    runner,
    typegen: async () => {
      currentPhase = 'type-generation';
      packetOrdinal = 0;
      try {
        await relay.phase('typegen');
        await readEmployeeNetwork(root);
        if (choice === 'composed') catalogReceipt = readAppliedCatalog();
        currentPhase = 'type-generation';
        typegenReceipt = await generateEmployeeTypes({
          binaryPath,
          metadata,
          receiptDirectory,
          sourceSha,
          controlSha,
          snapshotSha256,
          network,
          ...(choice === 'composed'
            ? { appliedIdentity: appliedIdentity(), catalog: catalogReceipt }
            : {}),
        });
        if (choice === 'composed') {
          if (
            JSON.stringify(readAppliedCatalog()) !==
            JSON.stringify(catalogReceipt)
          )
            throw new Error('Applied catalog changed during type generation');
          assertEmployeeQualificationUnchanged(qualificationInput, observation);
          currentPhase = 'consumer-compile';
          const consumerTrackedFiles = execFileSync('git', ['ls-files', '-z'], {
            cwd: root,
            encoding: 'utf8',
            timeout: 10000,
            maxBuffer: 16 * 1024 * 1024,
          })
            .split('\0')
            .filter(Boolean);
          consumerReceipt = await compileEmployeeComposedConsumers({
            repositoryRoot: root,
            receiptDirectory,
            trackedFiles: consumerTrackedFiles,
            identity: appliedIdentity(),
            typeGeneration: typegenReceipt,
            catalog: catalogReceipt,
            consumers: observation.consumers,
            runner: runTypegenCommand,
          });
          assertEmployeeQualificationUnchanged(qualificationInput, observation);
          if (
            JSON.stringify(readAppliedCatalog()) !==
            JSON.stringify(catalogReceipt)
          )
            throw new Error(
              'Applied catalog changed during consumer compilation'
            );
        }
      } catch {
        failureDiagnostic ??= {
          phase: currentPhase,
          packetOrdinal: 0,
          redacted: true,
        };
        throw new Error('Bounded employee type generation failed');
      }
    },
  });
} catch {
  // No raw exception text can expose SQL values or private CLI output.
  failureDiagnostic ??= selectedFailureDiagnostic(currentPhase, packetOrdinal);
  if (startupAdmission !== 'admitted') {
    failureDiagnostic.startupAdmission =
      startupAdmissionDiagnostic(startupAdmission);
    if (startupAdmission === 'worker-initialize') {
      failureDiagnostic.startupInitialization =
        startupObserver.initializationFailure();
    }
  }
  lifecycleCode = 1;
}
const packetReceipt = employeeQualificationExecutionReceipt(
  observation,
  packets,
  schemaExecutionSucceeded ? 0 : lifecycleCode,
  cleanupSucceeded
);
const chainComplete =
  choice === 'composed' &&
  employeeComposedChainComplete({
    identity: appliedIdentity(),
    catalog: catalogReceipt,
    typeGeneration: typegenReceipt,
    consumer: consumerReceipt,
    lifecycleCode,
    cleanupSucceeded,
    packetsValidated: packetReceipt.packetTranscriptValidated,
  });
const schemaReceipt = () => ({
  ...packetReceipt,
  version: 1,
  profile: selected.name,
  catalogQualified: false,
  ...(catalogReceipt ? { catalog: catalogReceipt } : {}),
  ...(consumerReceipt ? { consumer: consumerReceipt } : {}),
  sourceManifestSha256: observation.sourceManifestSha256 ?? null,
  consumerManifestSha256: observation.consumers?.consumerManifestSha256 ?? null,
  controlManifestSha256: observation.controlManifestSha256,
});
const finalization = await finishEmployeeControllerWorkers({
  network: networkObserver,
  relay,
  startup: startupObserver,
});
const { networkProof, relayEvidence, startupEvidence } = finalization;
writeFileSync(
  path.join(receiptDirectory, 'start-evidence.json'),
  `${JSON.stringify({ version: 1, sourceSha, controlSha, evidence: startupEvidence }, null, 2)}\n`,
  { flag: 'wx', mode: 0o600 }
);
const receipt = {
  ...schemaReceipt({
    sourceSha,
    packets,
    lifecycleCode: schemaExecutionSucceeded ? 0 : lifecycleCode,
    cleanupSucceeded,
  }),
  controlSha,
  snapshotSha256,
  networkId: network.id,
  networkNonce: network.labels['ttr.employee.nonce'],
  runId: network.labels['ttr.employee.run'],
  runAttempt: network.labels['ttr.employee.attempt'],
  workerDrainRecordedAt: Date.now(),
  networkObserverDrained: networkProof.observerDrained === true,
  workerFinishFailures: finalization.failures,
  networkQualified: networkProof.qualified,
  networkProof,
  networkCleanupSucceeded: false,
  startupEvidenceDrained: startupEvidence.observerDrained === true,
  relayEvidence,
  relayQualified:
    relayEvidence.listenerReady &&
    relayEvidence.markerReady &&
    relayEvidence.targetVerified &&
    relayEvidence.connected &&
    relayEvidence.drained &&
    !relayEvidence.denied,
  combinedLifecycleCode: lifecycleCode,
  typesQualified: typegenReceipt?.appliedIdentity
    ? false
    : typegenReceipt !== null && lifecycleCode === 0 && cleanupSucceeded,
  consumerQualified: false,
  ...(typegenReceipt ? { typeGeneration: typegenReceipt } : {}),
  fixtureHashes,
  ...(failureDiagnostic ? { failureDiagnostic } : {}),
};
if (typegenReceipt?.appliedIdentity) {
  const qualified =
    chainComplete &&
    networkProof.qualified === true &&
    networkProof.observerDrained === true &&
    startupEvidence.observerDrained === true &&
    finalization.failures.length === 0 &&
    receipt.relayQualified === true;
  receipt.schemaQualified = qualified;
  receipt.typesQualified = qualified;
  receipt.consumerQualified = qualified;
  receipt.catalogQualified = qualified;
}
receipt.controllerQualified =
  receipt.schemaQualified &&
  receipt.typesQualified &&
  receipt.networkQualified &&
  receipt.networkObserverDrained &&
  receipt.relayQualified &&
  receipt.startupEvidenceDrained;
receipt.combinedQualified = false;
const serializedReceipt = `${JSON.stringify(receipt, null, 2)}\n`;
if (Buffer.byteLength(serializedReceipt) > 65536)
  throw new Error('Employee qualification receipt exceeds bound');
writeFileSync(
  path.join(receiptDirectory, 'qualification.json'),
  serializedReceipt,
  { mode: 0o600 }
);
console.log(
  JSON.stringify({
    schemaQualified: receipt.schemaQualified,
    assertions: receipt.assertions,
    typesQualified: receipt.typesQualified,
    combinedQualified: receipt.combinedQualified,
  })
);
process.exitCode = receipt.controllerQualified ? 0 : 1;
