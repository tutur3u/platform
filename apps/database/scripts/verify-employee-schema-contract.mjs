#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  assertQualifiedHttp,
  httpQualificationReceipt,
  selectHttpRuntime,
  selectRestoreRuntime,
} from './employee-http-receipt.mjs';
import {
  assertPacketTap,
  assertRollbackSource,
  exactSourceSha,
  schemaFailureDiagnostic as foundationFailureDiagnostic,
  schemaReceipt,
  selectAddressMigration,
  selectFeedback,
  selectSchemaPackets,
} from './employee-schema-tap.mjs';
import { runOwnedSessionProcess } from './employee-web-session-process.mjs';
import {
  assertQualifiedWebSession,
  selectWebSessionRuntime,
  webSessionReceipt,
} from './employee-web-session-receipt.mjs';
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
const journal = process.env.EMPLOYEE_SCHEMA_INCLUDE_JOURNAL === 'true';
const personalJournal =
  process.env.EMPLOYEE_SCHEMA_INCLUDE_PERSONAL_JOURNAL === 'true';
if (
  !['true', 'false', undefined].includes(
    process.env.EMPLOYEE_SCHEMA_INCLUDE_PERSONAL_JOURNAL
  )
)
  throw new Error('Invalid personal journal qualification selection');
const httpRuntime = selectHttpRuntime(
  process.env.EMPLOYEE_SCHEMA_INCLUDE_HTTP,
  journal
);
const webSessionRuntime = selectWebSessionRuntime(
  process.env.EMPLOYEE_SCHEMA_INCLUDE_WEB_SESSION,
  httpRuntime
);
const restoreRuntime = selectRestoreRuntime(
  process.env.EMPLOYEE_SCHEMA_INCLUDE_RESTORE,
  httpRuntime
);
if (
  !['true', 'false', undefined].includes(
    process.env.EMPLOYEE_SCHEMA_INCLUDE_JOURNAL
  )
)
  throw new Error('Invalid employee journal qualification selection');
const addressMigration = selectAddressMigration(
  process.env.EMPLOYEE_SCHEMA_INCLUDE_ADDRESS_MIGRATION
);
const feedback = selectFeedback(process.env.EMPLOYEE_SCHEMA_INCLUDE_FEEDBACK);
const selectedPackets = selectSchemaPackets(
  journal,
  personalJournal,
  addressMigration,
  feedback
);
const schemaFailureDiagnostic = (phase, ordinal, result = {}) =>
  foundationFailureDiagnostic(
    phase,
    ordinal,
    result,
    journal,
    personalJournal,
    addressMigration,
    feedback
  );
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
  trackedFiles,
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
let cleanupSucceeded = false;
let currentPhase = 'full-schema-snapshot';
let packetOrdinal = 0;
let failureDiagnostic = null;
let generatedTypesSha256 = null;
let httpQualification = null;
let webSessionQualification = null;
const bounded = (command, args, cwd, timeout, input, allowFailure = false) => {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    timeout,
    killSignal: 'SIGKILL',
    maxBuffer: currentPhase === 'typegen' ? 16 * 1024 * 1024 : 1024 * 1024,
    stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
    input,
  });
  // Never print SQL diagnostics, fixture identities, CLI tokens or credentials.
  if (result.error || result.signal || (result.status !== 0 && !allowFailure)) {
    failureDiagnostic ??= schemaFailureDiagnostic(
      currentPhase,
      packetOrdinal,
      result
    );
    throw new Error('Bounded employee schema command failed');
  }
  return allowFailure
    ? { stdout: result.stdout, status: result.status }
    : result.stdout;
};
const excluded =
  (httpRuntime ? '' : 'gotrue,kong,postgrest,') +
  'realtime,storage-api,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor';
const runner = async (command, args, cwd) => {
  try {
    if (args.includes('test')) {
      const container = `supabase_db_${metadata.projectId}`;
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
      if (journal || personalJournal || feedback) {
        packetOrdinal = 0;
        currentPhase = 'typegen';
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
        generatedTypesSha256 = createHash('sha256').update(types).digest('hex');
        writeFileSync(
          path.join(receiptDirectory, 'generated-types.ts'),
          types,
          { mode: 0o600 }
        );
      }
      if (httpRuntime) {
        packetOrdinal = 0;
        currentPhase = 'http-runtime';
        const status = JSON.parse(
          bounded(
            binaryPath,
            ['status', '-o', 'json'],
            metadata.disposableRoot,
            10000
          )
        );
        const output = bounded(
          'bun',
          [
            '--conditions=react-server',
            'apps/web/e2e/fixtures/employee-http-runtime.ts',
          ],
          root,
          180000,
          JSON.stringify({
            url: status.API_URL,
            key: status.SERVICE_ROLE_KEY,
            anonKey: status.ANON_KEY,
            projectId: metadata.projectId,
            basePort: metadata.basePort,
            includeRestore: restoreRuntime,
          }),
          true
        );
        httpQualification = httpQualificationReceipt(output.stdout.trim());
        assertQualifiedHttp(httpQualification, output.status, restoreRuntime);
        if (webSessionRuntime) {
          // Keep the existing diagnostic phase; the child has its own bounded phases.
          const sessionOutput = await runOwnedSessionProcess(
            'bun',
            [
              '--conditions=react-server',
              'apps/web/e2e/fixtures/employee-web-session-runtime.ts',
            ],
            {
              cwd: root,
              timeoutMs: 1500000,
              input: JSON.stringify({
                url: status.API_URL,
                key: status.SERVICE_ROLE_KEY,
                anonKey: status.ANON_KEY,
                projectId: metadata.projectId,
                basePort: metadata.basePort,
                sourceSha,
              }),
            }
          );
          if (!sessionOutput.processGroupStopped)
            throw new Error('Owned Web session process group remains');
          webSessionQualification = webSessionReceipt(
            sessionOutput.stdout.trim()
          );
          webSessionQualification.processGroupStopped =
            sessionOutput.processGroupStopped;
          assertQualifiedWebSession(
            webSessionQualification,
            sessionOutput.status,
            sourceSha,
            sessionOutput.processGroupStopped
          );
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
  lifecycleCode = await runIsolatedLifecycle({ binaryPath, metadata, runner });
} catch {
  // No raw exception text can expose SQL values or private CLI output.
  failureDiagnostic ??= schemaFailureDiagnostic(currentPhase, packetOrdinal);
  lifecycleCode = 1;
}
const receipt = {
  ...schemaReceipt({
    sourceSha,
    packets,
    lifecycleCode,
    cleanupSucceeded,
    journal,
    personalJournal,
    addressMigration,
    feedback,
  }),
  fixtureHashes,
  generatedTypesSha256,
  httpTransportQualified:
    httpRuntime &&
    lifecycleCode === 0 &&
    cleanupSucceeded &&
    httpQualification?.qualified === true,
  restoreTransportQualified:
    restoreRuntime &&
    lifecycleCode === 0 &&
    cleanupSucceeded &&
    httpQualification?.restoreQualification?.qualified === true,
  httpQualification,
  webSessionQualified:
    webSessionRuntime &&
    lifecycleCode === 0 &&
    cleanupSucceeded &&
    webSessionQualification?.qualified === true,
  webSessionQualification,
  ...(failureDiagnostic ? { failureDiagnostic } : {}),
};
writeFileSync(
  path.join(receiptDirectory, 'qualification.json'),
  `${JSON.stringify(receipt, null, 2)}\n`,
  { mode: 0o600 }
);
console.log(
  JSON.stringify({
    schemaQualified: receipt.schemaQualified,
    assertions: receipt.assertions,
  })
);
process.exitCode = receipt.schemaQualified ? 0 : 1;
