#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runChatFirstMessageRace } from './chat-first-message-concurrency.mjs';
import { assertStrictTap } from './programming-database-tap.mjs';
import { ensureSupabaseBinary, runCommand } from './run-supabase.js';
import {
  chooseAvailablePortBlock,
  deriveIsolatedIdentity,
  hasProjectCollision,
  removeDisposableRoot,
  runIsolatedLifecycle,
  stageDisposableProject,
} from './run-supabase-isolated.js';

const root = process.cwd();
const headSha = execFileSync('git', ['rev-parse', 'HEAD'], {
  encoding: 'utf8',
}).trim();
const identity = deriveIsolatedIdentity({ headSha, repositoryPath: root });
const names = execFileSync('docker', ['ps', '-a', '--format', '{{.Names}}'], {
  encoding: 'utf8',
})
  .trim()
  .split('\n');
if (hasProjectCollision(identity.projectId, names))
  throw new Error(
    'Owned isolated project already exists; reconcile it before retrying'
  );
const trackedFiles = execFileSync(
  'git',
  [
    'ls-files',
    '--cached',
    '--others',
    '--exclude-standard',
    '-z',
    'apps/database/supabase',
  ],
  { encoding: 'utf8' }
)
  .split('\0')
  .filter(Boolean)
  .sort();
const digest = createHash('sha256');
for (const file of trackedFiles)
  digest.update(file).update('\0').update(readFileSync(file));
console.log(
  `Chat migration snapshot ${digest.digest('hex')}; source ${headSha}`
);
const ports = await chooseAvailablePortBlock(identity);
const metadata = await stageDisposableProject({
  repositoryRoot: root,
  headSha,
  projectId: identity.projectId,
  basePort: ports.basePort,
  trackedFiles,
  testPath: 'supabase/tests/chat-first-message-creation.sql',
});
console.log(
  `Owned local database ${metadata.projectId}; recovery root ${metadata.disposableRoot}`
);
let binary;
try {
  binary = await ensureSupabaseBinary(path.join(root, 'apps/database'));
} catch (error) {
  await removeDisposableRoot(metadata.disposableRoot);
  throw error;
}
const excluded =
  'gotrue,realtime,storage-api,imgproxy,kong,mailpit,postgrest,postgres-meta,studio,edge-runtime,logflare,vector,supavisor';
const migration =
  'supabase/migrations/20261025144554_chat_first_message_creation_receipts.sql';
const stagedMigration = path.join(metadata.disposableRoot, migration);
const heldMigration = path.join(
  metadata.disposableRoot,
  '.approved-first-message-migration.sql'
);
const typeRoot = mkdtempSync(path.join(os.tmpdir(), 'mira-typegen-'));
const gen = () =>
  execFileSync(
    binary,
    [
      '--workdir',
      metadata.disposableRoot,
      'gen',
      'types',
      'typescript',
      '--local',
      '--schema',
      'public,private,storage',
    ],
    { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 120_000 }
  );
const format = (file) =>
  execFileSync(
    path.join(root, 'node_modules/.bin/biome'),
    ['format', '--write', '--config-path', root, file],
    { stdio: 'ignore' }
  );
let beforeTypes;
const runner = async (command, args, cwd) => {
  if (args.includes('reset')) {
    // Apply the complete pre-A chain first, then apply the approved new migration
    // with migration up in this SAME owned local stack. No linked target exists.
    renameSync(stagedMigration, heldMigration);
    try {
      const result = await runCommand(command, args, cwd, { stdio: 'inherit' });
      if (result.code !== 0) return result;
      beforeTypes = gen();
    } finally {
      renameSync(heldMigration, stagedMigration);
    }
    return runCommand(
      binary,
      ['--workdir', metadata.disposableRoot, 'migration', 'up', '--local'],
      cwd,
      { stdio: 'inherit' }
    );
  }
  if (args.includes('test')) {
    for (const test of [
      'chat-initial-ai-settings.sql',
      'chat-first-message-creation.sql',
      'security-definer-search-paths.sql',
      'security-definer-policy-callers.sql',
    ]) {
      const tap = execFileSync(
        'docker',
        [
          'exec',
          '-i',
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
        ],
        {
          encoding: 'utf8',
          input: readFileSync(
            path.join(metadata.disposableRoot, 'supabase/tests', test)
          ),
          timeout: 60_000,
          maxBuffer: 8 * 1024 * 1024,
        }
      );
      console.log(tap);
      assertStrictTap(tap);
    }
    await runChatFirstMessageRace(metadata);
    const base = path.join(typeRoot, 'base.ts'),
      candidate = path.join(typeRoot, 'candidate.ts');
    writeFileSync(base, beforeTypes);
    writeFileSync(candidate, gen());
    format(base);
    format(candidate);
    // Generate and apply ONLY the baseline/candidate schema delta, preserving
    // unrelated pre-existing differences in the checked-in generated snapshot.
    const delta = execFileSync(
      'python3',
      [
        '-c',
        'import difflib,sys; a=open(sys.argv[1]).readlines(); b=open(sys.argv[2]).readlines(); print("".join(difflib.unified_diff(a,b,fromfile="a/packages/types/src/supabase.ts",tofile="b/packages/types/src/supabase.ts")),end="")',
        base,
        candidate,
      ],
      { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }
    );
    if (delta) {
      try {
        execFileSync('git', ['apply', '--check'], {
          cwd: root,
          input: delta,
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        execFileSync('git', ['apply'], {
          cwd: root,
          input: delta,
          stdio: ['pipe', 'pipe', 'pipe'],
        });
      } catch (error) {
        writeFileSync(path.join(typeRoot, 'schema-delta.patch'), delta);
        throw error;
      }
    }
    console.log(
      `Same-database type generation complete; schema delta bytes ${Buffer.byteLength(delta)}`
    );
    return { code: 0 };
  }
  return runCommand(
    command,
    args.includes('start') ? [...args, '--exclude', excluded] : args,
    cwd,
    { stdio: args.includes('start') ? 'ignore' : 'inherit' }
  );
};
try {
  process.exitCode = await runIsolatedLifecycle({
    binaryPath: binary,
    metadata,
    runner,
  });
} finally {
  if (process.exitCode === 0)
    rmSync(typeRoot, { recursive: true, force: true });
}
