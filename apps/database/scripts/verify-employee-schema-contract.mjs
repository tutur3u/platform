#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  assertPacketTap,
  assertRollbackSource,
  exactSourceSha,
  foundationPackets,
  schemaFailureDiagnostic,
  schemaReceipt,
} from './employee-schema-tap.mjs';
import {
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
const fixtureHashes = foundationPackets.map(([file]) => {
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
const packets = [];
let schemaExecutionSucceeded = false;
let typegenReceipt = null;
let cleanupSucceeded = false;
let currentPhase = 'full-schema-snapshot';
let packetOrdinal = 0;
let failureDiagnostic = null;
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
    failureDiagnostic ??= schemaFailureDiagnostic(
      currentPhase,
      packetOrdinal,
      result
    );
    throw new Error('Bounded employee schema command failed');
  }
  return result.stdout;
};
const excluded =
  'gotrue,realtime,storage-api,imgproxy,kong,mailpit,postgrest,postgres-meta,studio,edge-runtime,logflare,vector,supavisor';
const runner = async (command, args, cwd) => {
  try {
    await readEmployeeNetwork(root);
    if (!args.includes('stop')) await networkObserver.assertHealthy();
    if (args.includes('test')) {
      const container = `supabase_db_${metadata.projectId}`;
      for (const [position, [file, count]] of foundationPackets.entries()) {
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
          packets.push({ file, assertions: assertPacketTap(tap, count) });
        } catch {
          failureDiagnostic ??= schemaFailureDiagnostic(
            currentPhase,
            packetOrdinal,
            { stdout: tap }
          );
          throw new Error('Employee packet TAP contract failed');
        }
      }
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
    failureDiagnostic ??= schemaFailureDiagnostic(currentPhase, packetOrdinal);
    return { code: 1 };
  }
};
let lifecycleCode = 1;
try {
  await networkObserver.ready();
  await networkObserver.assertHealthy();
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
        await readEmployeeNetwork(root);
        typegenReceipt = await generateEmployeeTypes({
          binaryPath,
          metadata,
          receiptDirectory,
          sourceSha,
          controlSha,
          snapshotSha256,
          network,
        });
      } catch {
        failureDiagnostic ??= {
          phase: 'type-generation',
          packetOrdinal: 0,
          redacted: true,
        };
        throw new Error('Bounded employee type generation failed');
      }
    },
  });
} catch {
  // No raw exception text can expose SQL values or private CLI output.
  failureDiagnostic ??= schemaFailureDiagnostic(currentPhase, packetOrdinal);
  lifecycleCode = 1;
}
const networkProof = await networkObserver.finish();
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
  networkQualified: networkProof.qualified,
  networkProof,
  networkCleanupSucceeded: false,
  combinedLifecycleCode: lifecycleCode,
  typesQualified:
    typegenReceipt !== null && lifecycleCode === 0 && cleanupSucceeded,
  consumerQualified: false,
  ...(typegenReceipt ? { typeGeneration: typegenReceipt } : {}),
  fixtureHashes,
  ...(failureDiagnostic ? { failureDiagnostic } : {}),
};
receipt.controllerQualified =
  receipt.schemaQualified && receipt.typesQualified && receipt.networkQualified;
receipt.combinedQualified = false;
writeFileSync(
  path.join(receiptDirectory, 'qualification.json'),
  `${JSON.stringify(receipt, null, 2)}\n`,
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
