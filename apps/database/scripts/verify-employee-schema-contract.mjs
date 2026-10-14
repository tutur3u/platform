#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  mailboxCatalogSQL,
  normalizationMigration,
  normalizationPacket,
  normalizationReceipt,
  normalizationSQLFailure,
  verifyMailboxCatalog,
  verifyNormalizationInputs,
} from './employee-normalization-qualification.mjs';
import {
  assertPacketTap,
  assertRollbackSource,
  exactSourceSha,
  foundationPackets,
  schemaFailureDiagnostic,
  schemaReceipt,
} from './employee-schema-tap.mjs';
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
const normalizationOnly = process.env.EMPLOYEE_NORMALIZATION_ONLY === 'true';
if (normalizationOnly && process.env.EMPLOYEE_STRUCTURED_PROVENANCE === 'true')
  throw new Error('Normalization cannot use diagnostic mode');
const selectedPackets = normalizationOnly
  ? [normalizationPacket]
  : foundationPackets;
const sourceSha = exactSourceSha(process.env.EMPLOYEE_SCHEMA_SOURCE_SHA);
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
          const result = spawnSync(command, args, {
            cwd,
            timeout: 60000,
            killSignal: 'SIGKILL',
            stdio: 'ignore',
          });
          if (result.error || result.signal || result.status !== 0)
            return { code: 1 };
          const names = spawnSync(
            'docker',
            ['ps', '-a', '--format', '{{.Names}}'],
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
              names.stdout
                .trim()
                .split('\n')
                .includes(`supabase_db_${metadata.projectId}`)
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
let expectedBody;
if (normalizationOnly) {
  expectedBody = verifyNormalizationInputs(
    readFileSync(path.join(root, normalizationMigration)),
    readFileSync(
      path.join(root, `apps/database/supabase/tests/${normalizationPacket[0]}`)
    )
  );
}
const stagedFiles = normalizationOnly
  ? trackedFiles.filter((file) => file !== normalizationMigration)
  : trackedFiles;
const fixtureHashes = selectedPackets.map(([file]) => {
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
  trackedFiles: stagedFiles,
  testPath: 'supabase/tests/employee-signup-guards.sql',
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
const packets = [];
const catalog = {};
let catalogVerified = false;
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
    if (normalizationOnly)
      Object.assign(failureDiagnostic, normalizationSQLFailure(result.stderr));
    throw new Error('Bounded employee schema command failed');
  }
  return result.stdout;
};
const excluded =
  'gotrue,realtime,storage-api,imgproxy,kong,mailpit,postgrest,postgres-meta,studio,edge-runtime,logflare,vector,supavisor';
const runner = async (command, args, cwd) => {
  try {
    if (args.includes('test')) {
      const container = `supabase_db_${metadata.projectId}`;
      if (normalizationOnly) {
        packetOrdinal = 1;
        currentPhase = 'packet-execution';
        const sqlArgs = [
          'exec',
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
        ];
        catalog.before = JSON.parse(
          bounded('docker', [...sqlArgs, '-c', mailboxCatalogSQL], cwd, 10000)
        );
        const migration = path.join(root, normalizationMigration);
        // Recheck the exact reviewed source bytes immediately before applying.
        verifyNormalizationInputs(
          readFileSync(migration),
          readFileSync(
            path.join(
              root,
              `apps/database/supabase/tests/${normalizationPacket[0]}`
            )
          )
        );
        bounded(
          'docker',
          ['cp', migration, `${container}:/tmp/employee-normalization.sql`],
          cwd,
          10000
        );
        bounded(
          'docker',
          [...sqlArgs, '-f', '/tmp/employee-normalization.sql'],
          cwd,
          60000
        );
        catalog.after = JSON.parse(
          bounded('docker', [...sqlArgs, '-c', mailboxCatalogSQL], cwd, 10000)
        );
        catalogVerified = verifyMailboxCatalog(
          catalog.before,
          catalog.after,
          expectedBody
        );
      }
      for (const [position, [file, count]] of selectedPackets.entries()) {
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
            ...(normalizationOnly ? ['-v', 'VERBOSITY=sqlstate'] : []),
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
    } else {
      packetOrdinal = 0;
      currentPhase = args.includes('stop')
        ? 'cleanup'
        : args.includes('start')
          ? 'start'
          : 'reset';
      bounded(
        command,
        args.includes('start') ? [...args, '--exclude', excluded] : args,
        cwd,
        args.includes('stop') ? 60000 : 600000
      );
      if (args.includes('stop')) {
        currentPhase = 'cleanup-proof';
        const names = bounded(
          'docker',
          ['ps', '-a', '--format', '{{.Names}}'],
          cwd,
          10000
        );
        if (
          names.trim().split('\n').includes(`supabase_db_${metadata.projectId}`)
        ) {
          throw new Error('Owned database remains after stop');
        }
        cleanupSucceeded = true;
      }
    }
    return { code: 0 };
  } catch {
    failureDiagnostic ??= schemaFailureDiagnostic(currentPhase, packetOrdinal);
    return { code: 1 };
  }
};
let lifecycleCode = 1;
try {
  // Verify complete tracked database snapshot, including every migration, not only fixtures.
  for (const file of stagedFiles.filter(
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
  lifecycleCode = await runIsolatedLifecycle({ binaryPath, metadata, runner });
} catch {
  // No raw exception text can expose SQL values or private CLI output.
  failureDiagnostic ??= schemaFailureDiagnostic(currentPhase, packetOrdinal);
  lifecycleCode = 1;
}
const receipt = normalizationOnly
  ? normalizationReceipt({
      sourceSha,
      controlSha: process.env.EMPLOYEE_SCHEMA_CONTROL_SHA,
      packets,
      lifecycleCode,
      cleanupSucceeded,
      catalogVerified,
      catalog,
      fixtureHashes,
    })
  : {
      ...schemaReceipt({ sourceSha, packets, lifecycleCode, cleanupSucceeded }),
      fixtureHashes,
    };
if (failureDiagnostic) receipt.failureDiagnostic = failureDiagnostic;

writeFileSync(
  path.join(receiptDirectory, 'qualification.json'),
  `${JSON.stringify(receipt, null, 2)}\n`,
  { mode: 0o600 }
);
console.log(
  JSON.stringify({
    schemaQualified: receipt.schemaQualified,
    normalizationQualified: receipt.normalizationQualified ?? false,
    assertions: receipt.assertions,
  })
);
process.exitCode = (
  normalizationOnly
    ? receipt.normalizationQualified
    : receipt.schemaQualified
)
  ? 0
  : 1;
