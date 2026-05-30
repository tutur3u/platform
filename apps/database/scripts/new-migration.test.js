import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import {
  DEFAULT_MIGRATION_NAME,
  main,
  resolveMigrationName,
} from './new-migration.js';

test('resolveMigrationName defaults to new_migration', () => {
  assert.deepEqual(resolveMigrationName([]), {
    migrationName: DEFAULT_MIGRATION_NAME,
    ok: true,
  });
});

test('resolveMigrationName accepts one custom migration name', () => {
  assert.deepEqual(resolveMigrationName(['add_custom_function']), {
    migrationName: 'add_custom_function',
    ok: true,
  });
});

test('resolveMigrationName trims accidental surrounding whitespace', () => {
  assert.deepEqual(resolveMigrationName([' add_custom_function ']), {
    migrationName: 'add_custom_function',
    ok: true,
  });
});

test('resolveMigrationName rejects an empty migration name', () => {
  assert.deepEqual(resolveMigrationName(['']), {
    message:
      'Migration name must not be empty.\nUsage: bun sb:new [migration_name]',
    ok: false,
  });
});

test('resolveMigrationName rejects multiple migration names', () => {
  assert.deepEqual(resolveMigrationName(['add_one', 'add_two']), {
    message:
      'Expected at most one migration name.\nUsage: bun sb:new [migration_name]',
    ok: false,
  });
});

test('main delegates to the Supabase runner with the resolved migration name', async () => {
  const calls = [];
  const exitCode = await main(['add_custom_function'], {
    runner: async (command, args, cwd) => {
      calls.push({ args, command, cwd });
      return { code: 0, signal: null };
    },
  });

  assert.equal(exitCode, 0);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, process.execPath);
  assert.equal(path.basename(calls[0].args[0]), 'run-supabase.js');
  assert.deepEqual(calls[0].args.slice(1), [
    'migration',
    'new',
    'add_custom_function',
  ]);
  assert.equal(path.basename(calls[0].cwd), 'database');
});

test('main prints usage and skips the runner for invalid input', async () => {
  const stderr = [];
  let runnerCalled = false;
  const exitCode = await main(['add_one', 'add_two'], {
    runner: async () => {
      runnerCalled = true;
      return { code: 0, signal: null };
    },
    stderr: {
      write: (message) => stderr.push(message),
    },
  });

  assert.equal(exitCode, 1);
  assert.equal(runnerCalled, false);
  assert.deepEqual(stderr, [
    'Expected at most one migration name.\nUsage: bun sb:new [migration_name]\n',
  ]);
});
