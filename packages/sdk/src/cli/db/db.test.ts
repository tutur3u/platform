import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CLI_EXIT, CliError } from '../cli-contracts';
import { dbHelp, runDbCommand } from './index';
import {
  DB_FORBIDDEN_SCHEMAS,
  DB_READONLY_ALLOWLISTED_TABLES,
  validateReadOnlySql,
} from './sql-guard';

const SECRET_TOKEN = 'ttr_db_ro_secret_token_9876543210';
const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'ttr-db-cli-test-'));
  tempDirs.push(dir);
  return dir;
}

async function invokeDb(
  argv: string[],
  deps: Parameters<typeof runDbCommand>[1] = {}
): Promise<{ exitCode: number; stderr: string; stdout: string }> {
  let stdout = '';
  let stderr = '';
  process.exitCode = 0;
  await runDbCommand(argv, {
    ...deps,
    write: (chunk) => {
      stdout += chunk;
    },
    writeErr: (chunk) => {
      stderr += chunk;
    },
  });
  const exitCode = Number(process.exitCode ?? 0);
  process.exitCode = 0;
  return { exitCode, stderr, stdout };
}

beforeEach(() => {
  process.exitCode = 0;
});

afterEach(async () => {
  process.exitCode = 0;
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) await rm(dir, { force: true, recursive: true });
  }
});

describe('validateReadOnlySql', () => {
  it('exposes frozen allowlisted public tables and rejects private/non-public relations', () => {
    expect(Object.isFrozen(DB_READONLY_ALLOWLISTED_TABLES)).toBe(true);
    expect(DB_READONLY_ALLOWLISTED_TABLES.has('workspaces')).toBe(true);
    expect(DB_READONLY_ALLOWLISTED_TABLES.has('workspace_boards')).toBe(true);
    expect(DB_READONLY_ALLOWLISTED_TABLES.has('task_lists')).toBe(true);
    expect(DB_READONLY_ALLOWLISTED_TABLES.has('tasks')).toBe(true);
    expect(DB_READONLY_ALLOWLISTED_TABLES.has('devbox_runners')).toBe(false);
    expect(DB_READONLY_ALLOWLISTED_TABLES.has('devbox_runs')).toBe(false);
    expect(DB_READONLY_ALLOWLISTED_TABLES.has('users')).toBe(false);
    expect(DB_FORBIDDEN_SCHEMAS.has('auth')).toBe(true);
    expect(DB_FORBIDDEN_SCHEMAS.has('private')).toBe(true);
    expect(DB_FORBIDDEN_SCHEMAS.has('vault')).toBe(true);
  });

  it('allows single-table allowlisted SELECT with WHERE, ORDER BY, and bounded LIMIT', () => {
    const basic = validateReadOnlySql('SELECT id, name FROM workspaces;');
    expect(basic.normalizedSql).toBe(
      'SELECT id, name FROM public.workspaces LIMIT 100'
    );
    expect(basic.limit).toBe(100);
    expect(basic.table).toBe('workspaces');
    expect(basic.tables).toEqual(['workspaces']);

    const filtered = validateReadOnlySql(
      "SELECT id, name FROM public.workspaces WHERE name = 'Main' AND deleted_at IS NULL ORDER BY id DESC LIMIT 25"
    );
    expect(filtered.limit).toBe(25);
    expect(filtered.filters).toEqual([
      { column: 'name', op: 'eq', value: 'Main' },
      { column: 'deleted_at', op: 'is_null', value: null },
    ]);
    expect(filtered.orderBy).toEqual([{ ascending: false, column: 'id' }]);
    expect(filtered.normalizedSql).toBe(
      "SELECT id, name FROM public.workspaces WHERE name = 'Main' AND deleted_at IS NULL ORDER BY id DESC LIMIT 25"
    );
  });

  it('blocks SQLi bypasses: ALL comments, semicolons, dollar quotes, arithmetic LIMIT, joins, CTEs, EXPLAIN, and DML', () => {
    const blockedCases = [
      'SELECT id FROM workspaces -- well-formed comment',
      'SELECT /* well-formed comment */ id FROM workspaces',
      'SELECT id FROM workspaces LIMIT 1+999',
      'SELECT id FROM workspaces; DELETE FROM workspaces',
      'SELECT id FROM workspaces /* unterminated comment',
      'SELECT $$payload$$ FROM workspaces',
      'SELECT $tag$payload$tag$ FROM workspaces',
      'EXPLAIN SELECT id FROM workspaces',
      'EXPLAIN ANALYZE SELECT id FROM workspaces',
      'SHOW transaction_read_only',
      'WITH d AS (DELETE FROM tasks RETURNING *) SELECT * FROM d',
      'WITH active_ws AS (SELECT id FROM workspaces) SELECT id FROM active_ws LIMIT 5',
      'SELECT w.id FROM workspaces w JOIN tasks t ON t.ws_id = w.id LIMIT 10',
      "INSERT INTO workspaces (name) VALUES ('x')",
      'TRUNCATE workspaces',
      'SELECT * INTO leaked FROM workspaces',
      'SELECT id FROM workspaces FOR UPDATE',
      'DO $$ BEGIN PERFORM 1; END $$',
      'SET role postgres',
      'COPY workspaces TO STDOUT',
    ];

    for (const sql of blockedCases) {
      expect(() => validateReadOnlySql(sql), sql).toThrow(CliError);
    }
  });

  it('blocks forbidden schemas, dangerous functions, unlisted tables, comma joins, and excessive LIMIT', () => {
    const blockedCases = [
      'SELECT * FROM auth.users',
      'SELECT * FROM "auth"."users"',
      'SELECT * FROM vault.secrets',
      'SELECT * FROM private.internal_keys',
      'SELECT * FROM storage.objects',
      'SELECT * FROM realtime.messages',
      'SELECT * FROM supabase_functions.hooks',
      'SELECT * FROM extensions.pg_stat_statements',
      "SELECT pg_read_file('/etc/passwd')",
      "SELECT pg_ls_dir('.')",
      "SELECT * FROM dblink('dbname=postgres', 'SELECT 1') AS t(a int)",
      "SELECT lo_import('/etc/passwd')",
      'SELECT * FROM users LIMIT 10',
      'SELECT * FROM workspace_members LIMIT 10',
      'SELECT * FROM workspaces, users LIMIT 10',
      'SELECT id FROM workspaces LIMIT 9999',
      'SELECT id FROM workspaces LIMIT 501',
      'SELECT id FROM workspaces LIMIT 0',
      'SELECT id FROM workspaces LIMIT ALL',
      'SHOW ALL',
    ];

    for (const sql of blockedCases) {
      expect(() => validateReadOnlySql(sql), sql).toThrow(CliError);
    }
  });

  it('preserves semicolons and keywords inside string literals safely', () => {
    const res = validateReadOnlySql(
      "SELECT id FROM workspaces WHERE name = 'a; DELETE FROM tasks'"
    );
    expect(res.limit).toBe(100);
    expect(res.tables).toEqual(['workspaces']);
  });
});

describe('ttr db CLI subcommands', () => {
  it('prints help without emojis and blocks write/push subcommands and secret flags', async () => {
    const help = dbHelp();
    expect(help).toContain('ttr db');
    expect(help).toContain('migrations list');

    const pushRes = await invokeDb(['sb:push', '--json']);
    expect(pushRes.exitCode).toBe(CLI_EXIT.policy);
    expect(JSON.parse(pushRes.stderr).error.code).toBe('DB_WRITE_FORBIDDEN');

    const writeRes = await invokeDb(['write', '--json']);
    expect(writeRes.exitCode).toBe(CLI_EXIT.policy);

    const secretFlagRes = await invokeDb([
      'query',
      '--sql',
      'SELECT id FROM workspaces',
      '--token',
      SECRET_TOKEN,
      '--json',
    ]);
    expect(secretFlagRes.exitCode).toBe(CLI_EXIT.policy);
    expect(JSON.parse(secretFlagRes.stderr).error.code).toBe(
      'SECRET_IN_CLI_FLAG'
    );
  });

  it('lists local migrations, ignores symlinks, and refuses symlinked directories', async () => {
    const dir = await makeTempDir();
    const targetSql = join(dir, 'outside.txt');
    await writeFile(targetSql, 'CREATE TABLE public.sneaky (id int);\n');
    await writeFile(join(dir, '20261125080000_init_workspaces.sql'), '-- ok\n');
    await writeFile(join(dir, '20261126090000_add_flags.sql'), '-- ok\n');
    await symlink(targetSql, join(dir, '20261127010000_link_migration.sql'));

    const listRes = await invokeDb([
      'migrations',
      'list',
      '--dir',
      dir,
      '--limit',
      '1',
      '--json',
    ]);
    expect(listRes.exitCode).toBe(0);
    const listData = JSON.parse(listRes.stdout);
    expect(listData.total).toBe(2);
    expect(listData.shown).toBe(1);
    expect(listData.migrations[0].timestamp).toBe('20261126090000');

    const linkDir = join(await makeTempDir(), 'linked-migrations');
    await symlink(dir, linkDir);
    const linkDirRes = await invokeDb([
      'migrations',
      'list',
      '--dir',
      linkDir,
      '--json',
    ]);
    expect(linkDirRes.exitCode).toBe(CLI_EXIT.policy);

    const statusRes = await invokeDb([
      'migrations',
      'status',
      '--dir',
      dir,
      '--json',
    ]);
    expect(statusRes.exitCode).toBe(0);
    const statusData = JSON.parse(statusRes.stdout);
    expect(statusData.ok).toBe(true);
    expect(statusData.monotonic).toBe(true);
    expect(statusData.count).toBe(2);
    expect(statusData.latestTimestamp).toBe('20261126090000');

    await writeFile(join(dir, '20261126090000_duplicate_ts.sql'), '-- dup\n');
    const dupRes = await invokeDb([
      'migrations',
      'status',
      '--dir',
      dir,
      '--json',
    ]);
    expect(dupRes.exitCode).toBe(0);
    const dupData = JSON.parse(dupRes.stdout);
    expect(dupData.monotonic).toBe(false);
    expect(dupData.duplicateTimestamps).toEqual(['20261126090000']);
  });

  it('audits SQL migrations in rls-check and fails only with --strict', async () => {
    const dir = await makeTempDir();
    await writeFile(
      join(dir, '20261125080000_tables.sql'),
      [
        'CREATE TABLE public.safe_items (id uuid primary key);',
        'ALTER TABLE public.safe_items ENABLE ROW LEVEL SECURITY;',
        'CREATE POLICY "safe_read" ON public.safe_items FOR SELECT USING (true);',
        'CREATE TABLE public.unprotected_items (id uuid primary key);',
        'CREATE TABLE private.internal_only (id uuid primary key);',
      ].join('\n')
    );

    const nonStrict = await invokeDb(['rls-check', '--dir', dir, '--json']);
    expect(nonStrict.exitCode).toBe(0);
    const report = JSON.parse(nonStrict.stdout);
    expect(report.tablesChecked).toBe(2);
    expect(report.findings).toEqual([
      {
        file: '20261125080000_tables.sql',
        missingPolicy: true,
        missingRls: true,
        table: 'public.unprotected_items',
      },
    ]);

    const strictRes = await invokeDb([
      'rls-check',
      '--dir',
      dir,
      '--strict',
      '--json',
    ]);
    expect(strictRes.exitCode).toBe(CLI_EXIT.conflict);
  });

  it('checks generated DB types file without following symlinks or running codegen', async () => {
    const dir = await makeTempDir();
    const typesFile = join(dir, 'supabase.ts');
    await writeFile(typesFile, 'export type Database = { public: {} };\n');

    const okRes = await invokeDb([
      'types',
      'check',
      '--file',
      typesFile,
      '--json',
    ]);
    expect(okRes.exitCode).toBe(0);
    expect(JSON.parse(okRes.stdout).hasDatabaseType).toBe(true);

    const symlinkTypes = join(dir, 'linked-supabase.ts');
    await symlink(typesFile, symlinkTypes);
    const symlinkRes = await invokeDb([
      'types',
      'check',
      '--file',
      symlinkTypes,
      '--json',
    ]);
    expect(symlinkRes.exitCode).toBe(CLI_EXIT.policy);

    const missingRes = await invokeDb([
      'types',
      'check',
      '--file',
      join(dir, 'missing.ts'),
      '--json',
    ]);
    expect(missingRes.exitCode).toBe(CLI_EXIT.notFound);
  });

  it('supports query --dry-run on staging (*.tutur3u.com) and requires explicit --env prod', async () => {
    const fetchSpy = vi.fn();
    const dryRes = await invokeDb(
      ['query', '--sql', 'SELECT id FROM workspaces', '--dry-run', '--json'],
      {
        envVars: {},
        fetch: fetchSpy as unknown as typeof fetch,
        readConfig: async () => ({ baseUrl: 'https://web.tutur3u.com' }),
      }
    );
    expect(dryRes.exitCode).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
    const plan = JSON.parse(dryRes.stdout);
    expect(plan.dryRun).toBe(true);
    expect(plan.endpoint).toBe(
      'https://web.tutur3u.com/api/v1/infrastructure/db-readonly'
    );
    expect(plan.normalizedSql).toBe(
      'SELECT id FROM public.workspaces LIMIT 100'
    );

    const dryWhere = await invokeDb(
      [
        'query',
        '--sql',
        "SELECT id FROM workspaces WHERE name = 'sensitive-filter-literal-777'",
        '--dry-run',
        '--json',
      ],
      {
        envVars: {},
        fetch: fetchSpy as unknown as typeof fetch,
        readConfig: async () => ({ baseUrl: 'https://web.tutur3u.com' }),
      }
    );
    expect(dryWhere.exitCode).toBe(0);
    expect(dryWhere.stdout).not.toContain('sensitive-filter-literal-777');
    expect(JSON.parse(dryWhere.stdout).normalizedSql).toBe(
      "SELECT id FROM public.workspaces WHERE name = '[redacted]' LIMIT 100"
    );

    const implicitProd = await invokeDb(
      ['query', '--sql', 'SELECT id FROM workspaces', '--dry-run', '--json'],
      {
        envVars: { TTR_ENV: 'prod' },
        fetch: fetchSpy as unknown as typeof fetch,
        readConfig: async () => ({ baseUrl: 'https://tuturuuu.com' }),
      }
    );
    expect(implicitProd.exitCode).toBe(CLI_EXIT.policy);
    expect(JSON.parse(implicitProd.stderr).error.code).toBe(
      'PROD_ENV_EXPLICIT_FLAG_REQUIRED'
    );

    const explicitProd = await invokeDb(
      [
        'query',
        '--sql',
        'SELECT id FROM workspaces LIMIT 5',
        '--env',
        'prod',
        '--dry-run',
        '--json',
      ],
      {
        envVars: {},
        fetch: fetchSpy as unknown as typeof fetch,
        readConfig: async () => ({ baseUrl: 'https://tuturuuu.com' }),
      }
    );
    expect(explicitProd.exitCode).toBe(0);
    expect(JSON.parse(explicitProd.stdout).endpoint).toBe(
      'https://tuturuuu.com/api/v1/infrastructure/db-readonly'
    );
  });

  it('blocks decoded JSON responses that leak active credentials', async () => {
    const escapedSecret = SECRET_TOKEN.replace('t', '\\u0074');
    const fetchLeak = vi.fn(async () => {
      return new Response(
        `{"rows":[{"note":"leaked ${escapedSecret}"}],"rowCount":1}`,
        {
          headers: { 'content-type': 'application/json' },
          status: 200,
        }
      );
    });

    const leakDir = await makeTempDir();
    await mkdir(leakDir, { recursive: true });

    const res = await invokeDb(
      ['query', '--sql', 'SELECT id FROM workspaces LIMIT 5', '--json'],
      {
        envVars: { TTR_DB_RO_TOKEN_STAGING: SECRET_TOKEN },
        fetch: fetchLeak as unknown as typeof fetch,
        readConfig: async () => ({ baseUrl: 'https://web.tutur3u.com' }),
      }
    );
    expect(res.exitCode).toBe(CLI_EXIT.policy);
    expect(res.stdout).toBe('');
    expect(res.stderr).not.toContain(SECRET_TOKEN);
    expect(JSON.parse(res.stderr).error.code).toBe('CREDENTIAL_LEAK_BLOCKED');
  });
});
