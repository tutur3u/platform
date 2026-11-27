import { basename, dirname, resolve } from 'node:path';
import { getFlag, isDryRun, parseArgs } from '../args';
import { CLI_EXIT, CliError, type CliExitCode } from '../cli-contracts';
import { resolveCliEnv, resolveTuturuuuOrigins } from '../cli-env';
import { readCliConfig } from '../config';
import {
  assertNoCredentialLeak,
  createCredentialStore,
  ENV_VAR_BY_FAMILY,
  rejectSecretFlags,
} from '../credential-store';
import { emitCliError } from '../ui/errors';
import { formatTable } from '../ui/table';
import {
  assertNoUntrustedPathSymlinks,
  assertSafeParsedValue,
  assertSafeResponseText,
  buildTraceHeaders,
} from '../upskii/http';
import {
  forEachAnchoredRegularFile,
  listAnchoredSqlFiles,
  type RetainedDirectoryHandle,
  readAnchoredRegularFile,
  withAnchoredDirectory,
} from './local-fs';
import {
  DB_DEFAULT_LIMIT,
  DB_MAX_LIMIT,
  validateReadOnlySql,
} from './sql-guard';

const MIGRATION_RE = /^(\d{14})_([a-zA-Z0-9_-]+)\.sql$/u;
const DB_READONLY_PATH = '/api/v1/infrastructure/db-readonly';
const MIGRATIONS_DIR = 'apps/database/supabase/migrations';
const TYPES_FILE = 'packages/types/src/supabase.ts';
const MAX_MIGRATION_BYTES = 2 * 1024 * 1024;
const MAX_TYPES_BYTES = 16 * 1024 * 1024;
const FORBIDDEN_WRITES = new Set(
  'apply drop exec execute linkpush migrate push reset sb:linkpush sb:push seed write'.split(
    ' '
  )
);

export interface RunDbCommandDeps {
  credentialStore?: ReturnType<typeof createCredentialStore>;
  cwd?: string;
  envVars?: Record<string, string | undefined>;
  fetch?: typeof globalThis.fetch;
  readConfig?: typeof readCliConfig;
  write?: (chunk: string) => void;
  writeErr?: (chunk: string) => void;
}
export interface MigrationEntry {
  file: string;
  name: string;
  timestamp: string | null;
  validFormat: boolean;
}
export interface RlsFinding {
  file: string;
  missingPolicy: boolean;
  missingRls: boolean;
  table: string;
}
interface Ctx {
  cwd: string;
  deps: RunDbCommandDeps;
  flags: Record<string, boolean | string>;
  json: boolean;
  noColor: boolean;
  write: (chunk: string) => void;
}

const err = (
  code: string,
  message: string,
  exitCode: CliExitCode,
  cause?: unknown
) => new CliError({ cause, code, exitCode, message });
const policy = (code: string, msg: string) => err(code, msg, CLI_EXIT.policy);
const usage = (code: string, msg: string) => err(code, msg, CLI_EXIT.usage);
const dirOf = (ctx: Ctx) =>
  resolve(ctx.cwd, getFlag(ctx.flags, 'dir') ?? MIGRATIONS_DIR);
const emit = (
  ctx: Ctx,
  payload: unknown,
  rows: Record<string, unknown>[],
  emptyMessage?: string
) =>
  ctx.write(
    ctx.json
      ? `${JSON.stringify(payload, null, 2)}\n`
      : formatTable(rows, { emptyMessage, noColor: ctx.noColor })
  );

export function dbHelp(): string {
  return [
    'ttr db - Read-only database inspection CLI (zero local or remote writes)',
    'Usage: ttr db <subcommand> [options]',
    '  migrations list [--dir <path>] [--limit <n>] [--json]',
    '  migrations status [--dir <path>] [--json]',
    '  query --sql "<SELECT ...>" [--env staging|prod|sandbox|local] [--limit 100] [--dry-run] [--json]',
    '  types check [--file <path>] [--json]',
    '  rls-check [--dir <path>] [--strict] [--json]',
    'Safety: DB writes and bun sb:push/sb:linkpush are blocked; prod queries require explicit --env prod.',
  ].join('\n');
}

function parseIntFlag(raw: string | undefined, flag: string, max?: number) {
  if (raw === undefined) return undefined;
  const s = raw.trim();
  if (!/^\d+$/u.test(s))
    throw usage('INVALID_FLAG', `--${flag} must be a positive integer.`);
  const v = Number.parseInt(s, 10);
  if (v < 1) throw usage('INVALID_FLAG', `--${flag} must be >= 1.`);
  if (max !== undefined && v > max)
    throw policy('DB_SQL_LIMIT_EXCEEDED', `--${flag} ${v} exceeds max ${max}.`);
  return v;
}

function toMigrationEntries(sqlFiles: string[]): MigrationEntry[] {
  return sqlFiles.map((file) => {
    const m = MIGRATION_RE.exec(file);
    return m?.[1] && m[2]
      ? { file, name: m[2], timestamp: m[1], validFormat: true }
      : {
          file,
          name: file.slice(0, -4),
          timestamp: null,
          validFormat: false,
        };
  });
}

async function readMigrationsInAnchor(
  anchor: RetainedDirectoryHandle
): Promise<MigrationEntry[]> {
  return toMigrationEntries(await listAnchoredSqlFiles(anchor));
}

const stripComments = (sql: string) =>
  sql.replace(/'(?:''|[^'])*'|(--[^\n]*|\/\*[\s\S]*?\*\/)/gu, (m, c) =>
    c ? ' ' : m
  );

const toPublicTable = (sc: string | undefined, tbl: string) => {
  const s = sc?.replace(/^"|"$/gu, '').toLowerCase();
  const t = tbl.replace(/^"|"$/gu, '').toLowerCase();
  return !t || (s && s !== 'public') ? null : `public.${t}`;
};

async function runMigrations(action: string | undefined, ctx: Ctx) {
  if (!action || action === 'help') return ctx.write(`${dbHelp()}\n`);
  if (FORBIDDEN_WRITES.has(action.toLowerCase()))
    throw policy(
      'DB_WRITE_FORBIDDEN',
      `Refusing \`ttr db migrations ${action}\`: read-only.`
    );
  const dir = dirOf(ctx);
  const all = await withAnchoredDirectory(
    dir,
    'MIGRATIONS_DIR_NOT_FOUND',
    readMigrationsInAnchor
  );
  if (action === 'list' || action === 'ls') {
    const limit = parseIntFlag(getFlag(ctx.flags, 'limit'), 'limit');
    const migrations = limit !== undefined ? all.slice(-limit) : all;
    const rows = migrations.map((m) => ({
      File: m.file,
      Name: m.name,
      Timestamp: m.timestamp ?? '(invalid)',
    }));
    return emit(
      ctx,
      { dir, migrations, shown: migrations.length, total: all.length },
      rows,
      'No migrations found.'
    );
  }
  if (action !== 'status')
    throw usage('UNKNOWN_DB_ACTION', `Unknown migrations action "${action}".`);

  const invalidFiles: string[] = [];
  const duplicateTimestamps: string[] = [];
  const seen = new Set<string>();
  let monotonic = true;
  let prev: string | null = null;
  for (const e of all) {
    if (!e.validFormat || !e.timestamp) {
      invalidFiles.push(e.file);
      monotonic = false;
      continue;
    }
    if (seen.has(e.timestamp)) {
      duplicateTimestamps.push(e.timestamp);
      monotonic = false;
    } else seen.add(e.timestamp);
    if (prev !== null && e.timestamp <= prev) monotonic = false;
    prev = e.timestamp;
  }
  const latest = [...all].reverse().find((e) => e.timestamp !== null);
  const ok = monotonic && !invalidFiles.length && !duplicateTimestamps.length;
  emit(
    ctx,
    {
      count: all.length,
      dir,
      duplicateTimestamps,
      invalidFiles,
      latestFile: latest?.file ?? null,
      latestTimestamp: latest?.timestamp ?? null,
      monotonic,
      ok,
    },
    [
      {
        Count: all.length,
        Duplicates: duplicateTimestamps.length,
        Invalid: invalidFiles.length,
        Latest: latest?.timestamp ?? '(none)',
        Monotonic: monotonic ? 'yes' : 'no',
      },
    ]
  );
}

async function runTypes(action: string | undefined, ctx: Ctx) {
  if (action !== 'check')
    throw usage(
      'UNKNOWN_DB_ACTION',
      `Unsupported types action "${action ?? ''}".`
    );
  const file = resolve(ctx.cwd, getFlag(ctx.flags, 'file') ?? TYPES_FILE);
  await assertNoUntrustedPathSymlinks(file);
  const { content, mtime, size } = await withAnchoredDirectory(
    dirname(file),
    'DB_TYPES_NOT_FOUND',
    (anchor) =>
      readAnchoredRegularFile(
        anchor,
        basename(file),
        MAX_TYPES_BYTES,
        'DB_TYPES_NOT_FOUND'
      )
  );
  const hasDatabaseType = /\bexport\s+(?:type|interface)\s+Database\b/u.test(
    content
  );
  const lineCount = content ? content.split('\n').length : 0;
  emit(
    ctx,
    {
      exists: true,
      file,
      hasDatabaseType,
      lineCount,
      modifiedAt: mtime.toISOString(),
      ok: size > 0 && hasDatabaseType,
      sizeBytes: size,
    },
    [
      {
        DatabaseExport: hasDatabaseType ? 'yes' : 'no',
        File: file,
        Lines: lineCount,
        SizeBytes: size,
      },
    ]
  );
}

async function runRlsCheck(ctx: Ctx): Promise<number> {
  const dir = dirOf(ctx);
  const strict = ctx.flags.strict === true;
  const created = new Map<string, string>();
  const rlsOn = new Set<string>();
  const policyOn = new Set<string>();
  const id =
    '(?:((?:"[^"]+"|[a-zA-Z_]\\w*))\\s*\\.\\s*)?("[^"]+"|[a-zA-Z_]\\w*)';
  const mkRe = (pat: string) => new RegExp(pat, 'giu');
  const createRe = mkRe(
    `\\bCREATE\\s+(?:UNLOGGED\\s+)?TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?${id}`
  );
  const dropRe = mkRe(`\\bDROP\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?${id}`);
  const rlsRe = mkRe(
    `\\bALTER\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?(?:ONLY\\s+)?${id}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY\\b`
  );
  const polRe = mkRe(
    `\\bCREATE\\s+POLICY\\s+(?:"[^"]+"|[a-zA-Z_]\\w*)\\s+ON\\s+${id}`
  );

  const entries = await withAnchoredDirectory(
    dir,
    'MIGRATIONS_DIR_NOT_FOUND',
    async (anchor) => {
      const list = await readMigrationsInAnchor(anchor);
      await forEachAnchoredRegularFile(
        anchor,
        list.map((entry) => entry.file),
        MAX_MIGRATION_BYTES,
        'MIGRATIONS_READ_FAILED',
        (file) => {
          const clean = stripComments(file.content);
          for (const m of clean.matchAll(createRe)) {
            const pre = clean.slice(
              Math.max(0, (m.index ?? 0) - 20),
              m.index ?? 0
            );
            const tbl = /\b(?:TEMP|TEMPORARY)\s*$/iu.test(pre)
              ? null
              : toPublicTable(m[1], m[2] ?? '');
            if (tbl) created.set(tbl, file.file);
          }
          for (const m of clean.matchAll(dropRe)) {
            const tbl = toPublicTable(m[1], m[2] ?? '');
            if (tbl) [created, rlsOn, policyOn].forEach((c) => c.delete(tbl));
          }
          for (const [re, set] of [
            [rlsRe, rlsOn],
            [polRe, policyOn],
          ] as const) {
            for (const m of clean.matchAll(re)) {
              const tbl = toPublicTable(m[1], m[2] ?? '');
              if (tbl) set.add(tbl);
            }
          }
        }
      );
      return list;
    }
  );

  const findings: RlsFinding[] = [...created.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([table, file]) =>
      !rlsOn.has(table) || !policyOn.has(table)
        ? [
            {
              file,
              missingPolicy: !policyOn.has(table),
              missingRls: !rlsOn.has(table),
              table,
            },
          ]
        : []
    );
  const payload = {
    dir,
    filesScanned: entries.length,
    findings,
    ok: !findings.length,
    strict,
    tablesChecked: created.size,
  };
  const rows = findings.map((f) => ({
    File: f.file,
    MissingPolicy: f.missingPolicy ? 'yes' : 'no',
    MissingRls: f.missingRls ? 'yes' : 'no',
    Table: f.table,
  }));
  if (ctx.json || findings.length) emit(ctx, payload, rows);
  else
    ctx.write(
      `RLS check passed: ${created.size} public tables audited across ${entries.length} files.\n`
    );
  return strict && findings.length > 0 ? CLI_EXIT.conflict : CLI_EXIT.ok;
}

async function runQuery(ctx: Ctx) {
  const sql = getFlag(ctx.flags, 'sql');
  if (!sql?.trim()) throw usage('MISSING_SQL', 'Missing required --sql flag.');
  const reqLimit = parseIntFlag(
    getFlag(ctx.flags, 'limit'),
    'limit',
    DB_MAX_LIMIT
  );
  const v = validateReadOnlySql(sql, {
    defaultLimit: reqLimit ?? DB_DEFAULT_LIMIT,
    maxLimit: reqLimit ?? DB_MAX_LIMIT,
  });

  const explicitEnv = getFlag(ctx.flags, 'env');
  const config = await (ctx.deps.readConfig ?? readCliConfig)().catch(
    () => undefined
  );
  const env = resolveCliEnv({
    configuredEnv: config?.defaultEnv,
    defaultEnv: 'staging',
    env: ctx.deps.envVars,
    explicitFlag: explicitEnv,
  });
  if (env === 'prod' && !explicitEnv?.trim())
    throw policy(
      'PROD_ENV_EXPLICIT_FLAG_REQUIRED',
      'Refusing implicit prod DB query without explicit --env prod.'
    );

  const base = new URL(resolveTuturuuuOrigins(env, ctx.deps.envVars).web);
  const target = new URL(DB_READONLY_PATH, base.origin);
  if (target.origin !== base.origin)
    throw policy('CROSS_ORIGIN_ESCAPE', 'Path escaped origin.');
  const endpoint = target.toString();

  const envMap = ctx.deps.envVars ?? process.env;
  const baseSecrets = [
    config?.session?.accessToken,
    ...Object.values(ENV_VAR_BY_FAMILY)
      .flat()
      .flatMap((k) => [envMap[k], envMap[`${k}_${env.toUpperCase()}`]]),
  ];

  if (isDryRun(ctx.flags)) {
    const plan = {
      dryRun: true,
      endpoint,
      env,
      limit: v.limit,
      normalizedSql: v.redactedSql,
      readOnly: true,
      tables: v.tables,
    };
    const out = ctx.json
      ? `${JSON.stringify(plan, null, 2)}\n`
      : `${formatTable(
          [
            {
              Endpoint: endpoint,
              Env: env,
              Limit: v.limit,
              Tables: v.tables.join(', '),
            },
          ],
          { noColor: ctx.noColor }
        )}Normalized SQL: ${v.redactedSql}\n`;
    assertNoCredentialLeak(out, baseSecrets);
    ctx.write(out);
    return;
  }

  const store =
    ctx.deps.credentialStore ??
    createCredentialStore({ env: ctx.deps.envVars });
  const profile = getFlag(ctx.flags, 'profile') ?? 'default';
  let token =
    (await store.get({ env, family: 'db', profile }))?.secret ??
    (await store.get({ env, family: 'tuturuuu', profile }))?.secret;
  if (!token && config?.session?.accessToken && config.baseUrl) {
    try {
      if (new URL(config.baseUrl).origin === base.origin)
        token = config.session.accessToken;
    } catch {
      /* ignore */
    }
  }
  if (!token)
    throw err('DB_AUTH_REQUIRED', `No credential for "${env}".`, CLI_EXIT.auth);

  const secrets = [token, ...baseSecrets];
  const headers = {
    accept: 'application/json',
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
    ...buildTraceHeaders('db.query', env),
  };
  let res: Response;
  try {
    res = await (ctx.deps.fetch ?? globalThis.fetch)(endpoint, {
      body: JSON.stringify({ env, limit: v.limit, sql: v.normalizedSql }),
      cache: 'no-store',
      headers,
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    if (e instanceof CliError) throw e;
    throw err(
      'DB_QUERY_NETWORK_ERROR',
      'DB query failed.',
      CLI_EXIT.unavailable,
      e
    );
  }

  const rawText = await res.text();
  assertSafeResponseText(rawText, secrets);
  let parsed: unknown = null;
  if (rawText.trim()) {
    try {
      parsed = JSON.parse(rawText);
    } catch (e) {
      throw err(
        'DB_QUERY_INVALID_JSON',
        'Invalid JSON response.',
        CLI_EXIT.unavailable,
        e
      );
    }
    assertSafeParsedValue(parsed, secrets);
  }
  const rec =
    parsed && typeof parsed === 'object'
      ? (parsed as Record<string, unknown>)
      : {};
  if (!res.ok) {
    const detail = String(rec.error ?? rec.code ?? `HTTP ${res.status}`);
    assertNoCredentialLeak(detail, secrets);
    const code =
      res.status === 401 || res.status === 403
        ? CLI_EXIT.auth
        : res.status >= 500 || res.status === 429
          ? CLI_EXIT.unavailable
          : CLI_EXIT.usage;
    throw err(
      `DB_QUERY_HTTP_${res.status}`,
      `DB query rejected (${res.status}): ${detail}`,
      code
    );
  }
  const rows = Array.isArray(rec.rows)
    ? (rec.rows as Record<string, unknown>[])
    : [];
  const out = ctx.json
    ? `${JSON.stringify(parsed, null, 2)}\n`
    : formatTable(rows, {
        emptyMessage: 'Query returned 0 rows.',
        noColor: ctx.noColor,
      });
  assertNoCredentialLeak(out, secrets);
  ctx.write(out);
}

export async function runDbCommand(
  argv: string[],
  deps: RunDbCommandDeps = {}
): Promise<void> {
  const write = deps.write ?? ((chunk: string) => process.stdout.write(chunk));
  const { flags, positionals } = parseArgs(argv);
  const json = flags.json === true;
  const noColor = flags['no-color'] === true;
  const [sub, action] = positionals;
  if (!sub || sub === 'help') {
    write(`${dbHelp()}\n`);
    return;
  }
  try {
    rejectSecretFlags(flags);
    if (FORBIDDEN_WRITES.has(sub.toLowerCase()))
      throw policy(
        'DB_WRITE_FORBIDDEN',
        `Refusing \`ttr db ${sub}\`: read-only.`
      );
    const ctx: Ctx = {
      cwd: deps.cwd ?? process.cwd(),
      deps,
      flags,
      json,
      noColor,
      write,
    };
    if (sub === 'migrations') return await runMigrations(action, ctx);
    if (sub === 'query') return await runQuery(ctx);
    if (sub === 'types') return await runTypes(action, ctx);
    if (sub === 'rls-check') {
      const code = await runRlsCheck(ctx);
      if (code !== CLI_EXIT.ok) process.exitCode = code;
      return;
    }
    throw usage('UNKNOWN_DB_SUBCOMMAND', `Unknown db subcommand "${sub}".`);
  } catch (error) {
    process.exitCode = emitCliError(error, {
      json,
      noColor,
      writeErr: deps.writeErr,
    });
  }
}
