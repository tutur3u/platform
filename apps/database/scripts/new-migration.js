#!/usr/bin/env node

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_MIGRATION_NAME = 'new_migration';
export const USAGE = 'Usage: bun sb:new [migration_name]';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const databaseDir = path.resolve(__dirname, '..');
const supabaseRunnerPath = path.join(__dirname, 'run-supabase.js');

export function resolveMigrationName(argv) {
  if (argv.length === 0) {
    return {
      migrationName: DEFAULT_MIGRATION_NAME,
      ok: true,
    };
  }

  if (argv.length > 1) {
    return {
      message: `Expected at most one migration name.\n${USAGE}`,
      ok: false,
    };
  }

  const migrationName = argv[0]?.trim();

  if (!migrationName) {
    return {
      message: `Migration name must not be empty.\n${USAGE}`,
      ok: false,
    };
  }

  return {
    migrationName,
    ok: true,
  };
}

export function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: 'inherit',
    });

    child.on('error', reject);
    child.on('close', (code, signal) => {
      resolve({
        code: code ?? 1,
        signal: signal ?? null,
      });
    });
  });
}

export async function main(
  argv = process.argv.slice(2),
  { runner = run, stderr = process.stderr } = {}
) {
  const migrationNameResult = resolveMigrationName(argv);

  if (!migrationNameResult.ok) {
    stderr.write(`${migrationNameResult.message}\n`);
    return 1;
  }

  const result = await runner(
    process.execPath,
    [supabaseRunnerPath, 'migration', 'new', migrationNameResult.migrationName],
    databaseDir
  );

  return result.code;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  process.exitCode = await main();
}
