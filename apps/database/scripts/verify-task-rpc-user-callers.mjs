#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureSupabaseBinary, workspaceDir } from './run-supabase.js';
import { assertDisposableRoot } from './run-supabase-isolated.js';

const [flag, root, ...extra] = process.argv.slice(2);
if (flag !== '--root' || !root || extra.length > 0) {
  throw new Error(
    'Usage: verify-task-rpc-user-callers.mjs --root <disposable-root>'
  );
}
const disposableRoot = assertDisposableRoot(root);
const binary = await ensureSupabaseBinary(workspaceDir);
const status = spawnSync(
  binary,
  ['--workdir', disposableRoot, 'status', '--output', 'json'],
  {
    encoding: 'utf8',
    timeout: 30_000,
  }
);
if (status.status !== 0) throw new Error('Disposable Supabase status failed');
const local = JSON.parse(status.stdout);
if (
  typeof local.API_URL !== 'string' ||
  !['127.0.0.1', 'localhost'].includes(new URL(local.API_URL).hostname) ||
  typeof local.ANON_KEY !== 'string' ||
  typeof local.SERVICE_ROLE_KEY !== 'string'
)
  throw new Error('Disposable loopback Supabase credentials are required');

// Test credentials exist only in the child environment. Never log or persist them.
const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url));
const result = spawnSync(
  'bun',
  [
    'x',
    '--no-install',
    'vitest',
    'run',
    'task-rpc-admission.integration.test.ts',
  ],
  {
    cwd: path.join(repositoryRoot, 'apps/tasks'),
    env: {
      ...process.env,
      TEST_SUPABASE_URL: local.API_URL,
      TEST_SUPABASE_ANON_KEY: local.ANON_KEY,
      TEST_SUPABASE_SERVICE_ROLE_KEY: local.SERVICE_ROLE_KEY,
    },
    stdio: 'inherit',
    timeout: 120_000,
  }
);
process.exitCode = result.status ?? 1;
