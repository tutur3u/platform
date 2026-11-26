import { realpath } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { z } from 'zod';
import { type FlagValue, getFlag } from '../args';
import {
  CLI_EXIT,
  CliError,
  type CliExitCode,
  type MutationDiffEntry,
  type MutationPreview,
} from '../cli-contracts';
import {
  type CliEnv,
  resolveUpskiiOrigins,
  type UpskiiOrigins,
} from '../cli-env';
import {
  assertSafeParsedValue,
  assertVerifiedDirectory,
  ensurePrivateDir,
  readPrivateJsonFile,
  UPSKII_RUN_LABEL_PATTERN,
  type VerifiedDirectory,
  writePrivateFile,
} from './http';
import {
  handleBundleCreate,
  handleBundleTeardown,
  handleSweep,
  parseQaArgs,
  parseQaTtlSeconds,
  type QaBundleHelpers,
  type UpskiiQaLedger,
  type UpskiiQaLedgerUser,
  upskiiQaHelp,
} from './qa-bundle';
import {
  createUpskiiQaClient,
  SAFE_QA_ID_PATTERN,
  UPSKII_QA_PURGE_MODES,
  UPSKII_QA_ROLES,
  type UpskiiQaIdentity,
  type UpskiiQaPurgeMode,
  type UpskiiQaRole,
  upskiiPasswordSignIn,
} from './qa-client';

export {
  parseQaTtlSeconds,
  type UpskiiQaLedger,
  type UpskiiQaLedgerUser,
  upskiiQaHelp,
};

const credentialsFileSchema = z.object({
  email: z.string(),
  env: z.enum(['prod', 'staging', 'sandbox', 'local']),
  password: z.string().min(1),
  role: z.enum(UPSKII_QA_ROLES),
  runLabel: z.string().optional(),
  userId: z.string().min(1),
});

export interface RunUpskiiQaCommandOptions {
  args: string[];
  env: CliEnv;
  explicitEnvFlag: boolean;
  fetch?: typeof globalThis.fetch;
  json: boolean;
  noColor?: boolean;
  resolveQaToken: () => Promise<string>;
  write?: (chunk: string) => void;
}

interface CommandContext {
  env: CliEnv;
  fetch?: typeof globalThis.fetch;
  getActiveSecrets: () => readonly string[];
  getClient: () => Promise<ReturnType<typeof createUpskiiQaClient>>;
  json: boolean;
  origins: UpskiiOrigins;
  write: (chunk: string) => void;
}

function shouldPreview(flags: Record<string, FlagValue>): boolean {
  return flags['dry-run'] === true || flags.yes !== true;
}

function fail(
  code: string,
  message: string,
  exitCode: CliExitCode = CLI_EXIT.usage,
  hint?: string
): never {
  throw new CliError({ code, exitCode, hint, message });
}

function sanitizeIdentity(
  identity: UpskiiQaIdentity
): Omit<UpskiiQaIdentity, 'password'> {
  const { password: _omitted, ...safe } = identity;
  return safe;
}

async function writeCredentialsFile(
  outDir: string,
  filename: string,
  identity: UpskiiQaIdentity,
  runLabel: string,
  env: CliEnv,
  verifiedDir?: VerifiedDirectory
): Promise<string> {
  if (
    !filename ||
    filename.includes('/') ||
    filename.includes('\\') ||
    filename.includes('..') ||
    !SAFE_QA_ID_PATTERN.test(identity.userId)
  ) {
    fail(
      'UNSAFE_OUTPUT_PATH',
      'Refusing unsafe credential filename or userId.',
      CLI_EXIT.policy
    );
  }
  const realOutDir = verifiedDir ? verifiedDir.realDir : await realpath(outDir);
  if (verifiedDir) await assertVerifiedDirectory(verifiedDir);
  const target = resolve(realOutDir, filename);
  if (relative(realOutDir, target) !== filename) {
    fail(
      'UNSAFE_OUTPUT_PATH',
      'Credential path escaped output directory.',
      CLI_EXIT.policy
    );
  }
  const payload = {
    createdAt: identity.createdAt ?? new Date().toISOString(),
    email: identity.email,
    env,
    password: identity.password,
    role: identity.role,
    runLabel,
    userId: identity.userId,
  };
  return writePrivateFile(target, `${JSON.stringify(payload, null, 2)}\n`);
}

function requireFlag(flags: Record<string, FlagValue>, name: string): string {
  const value = getFlag(flags, name)?.trim();
  if (!value)
    fail('MISSING_REQUIRED_FLAG', `Missing required flag "--${name}".`);
  return value;
}

function requireRunLabel(flags: Record<string, FlagValue>): string {
  const runLabel = requireFlag(flags, 'run');
  if (!UPSKII_RUN_LABEL_PATTERN.test(runLabel)) {
    fail(
      'INVALID_RUN_LABEL',
      `Invalid --run "${runLabel}". Expected /^[a-z0-9][a-z0-9-]{3,30}$/.`
    );
  }
  return runLabel;
}

function parseRoleFlag(value: string): UpskiiQaRole {
  if (!(UPSKII_QA_ROLES as readonly string[]).includes(value)) {
    fail(
      'INVALID_QA_ROLE',
      `Invalid --role "${value}". Expected teacher, student, or outsider.`
    );
  }
  return value as UpskiiQaRole;
}

function parsePurgeMode(
  value: string | undefined,
  fallback: UpskiiQaPurgeMode
): UpskiiQaPurgeMode {
  const mode = value?.trim() || fallback;
  if (!(UPSKII_QA_PURGE_MODES as readonly string[]).includes(mode)) {
    fail(
      'INVALID_PURGE_MODE',
      `Invalid --mode "${mode}". Expected dry-run, apply, or verify.`
    );
  }
  return mode as UpskiiQaPurgeMode;
}

function parseCountFlag(
  flags: Record<string, FlagValue>,
  name: string,
  fallback: number
): number {
  const raw = getFlag(flags, name);
  if (raw === undefined) return fallback;
  if (!/^\d+$/u.test(raw.trim()))
    fail('INVALID_COUNT', `Flag "--${name}" must be a non-negative integer.`);
  return Number.parseInt(raw.trim(), 10);
}

function requireConfirm(
  flags: Record<string, FlagValue>,
  expected: string,
  action: string
): void {
  if (getFlag(flags, 'confirm')?.trim() !== expected) {
    fail(
      'CONFIRMATION_REQUIRED',
      `${action} requires --confirm ${expected}.`,
      CLI_EXIT.policy,
      `Re-run with --yes --confirm ${expected}`
    );
  }
}

function emitOutput(
  ctx: CommandContext,
  payload: unknown,
  lines: string[]
): void {
  ctx.write(
    ctx.json ? `${JSON.stringify(payload, null, 2)}\n` : `${lines.join('\n')}\n`
  );
}

function emitPreview(
  ctx: CommandContext,
  title: string,
  target: string,
  tier: 1 | 2,
  applyHint: string,
  changes: MutationDiffEntry[],
  confirmToken?: string
): void {
  const preview: MutationPreview = {
    applyHint,
    changes,
    ...(confirmToken ? { confirmToken } : {}),
    env: ctx.env,
    origin: ctx.origins.admin,
    target,
    tier,
    title,
  };
  emitOutput(ctx, { mode: 'preview', preview }, [
    `[PREVIEW] ${preview.title}`,
    `Env: ${preview.env} (${preview.origin})`,
    `Target: ${preview.target}`,
    ...preview.changes.map(
      (entry) => `  ${entry.field}: ${JSON.stringify(entry.after)}`
    ),
    `Apply: ${preview.applyHint}`,
  ]);
}

async function handleUsersSubcommand(
  ctx: CommandContext,
  subArgs: string[],
  flags: Record<string, FlagValue>
): Promise<void> {
  const [action, userId] = subArgs;
  if (action === 'create') {
    const runLabel = requireRunLabel(flags);
    const role = parseRoleFlag(requireFlag(flags, 'role'));
    const ttlSeconds = parseQaTtlSeconds(getFlag(flags, 'ttl'));
    const outDirFlag = getFlag(flags, 'out-dir')?.trim();
    if (shouldPreview(flags)) {
      const changes: MutationDiffEntry[] = [
        { after: runLabel, field: 'runLabel' },
        { after: role, field: 'role' },
        { after: ttlSeconds, field: 'ttlSeconds' },
        ...(outDirFlag
          ? [{ after: resolve(outDirFlag), field: 'outDir' }]
          : []),
      ];
      emitPreview(
        ctx,
        `Create Upskii QA ${role} identity`,
        '/api/admin/qa/users',
        1,
        `ttr external upskii qa users create --run ${runLabel} --role ${role} --ttl ${ttlSeconds}s${outDirFlag ? ` --out-dir ${outDirFlag}` : ''} --yes`,
        changes
      );
      return;
    }
    const created = await (
      await ctx.getClient()
    ).create({ role, runLabel, ttlSeconds });
    const credentialsFile = outDirFlag
      ? await writeCredentialsFile(
          await ensurePrivateDir(outDirFlag),
          `${created.role}-${created.userId}.credentials.json`,
          created,
          runLabel,
          ctx.env
        )
      : null;
    const safeUser = sanitizeIdentity(created);
    const createPayload = {
      credentialsFile,
      env: ctx.env,
      origin: ctx.origins.admin,
      ttlSeconds,
      user: safeUser,
    };
    const createSecrets = [...ctx.getActiveSecrets(), created.password];
    assertSafeParsedValue(createPayload, createSecrets);
    emitOutput(ctx, createPayload, [
      `Created Upskii QA ${safeUser.role}: ${safeUser.userId} (${safeUser.email})`,
      credentialsFile
        ? `Credentials written (0600): ${credentialsFile}`
        : 'Credentials not written to disk (pass --out-dir to store 0600 credentials file).',
    ]);
    return;
  }

  if (action === 'list') {
    const runLabel = getFlag(flags, 'run')?.trim();
    const stateRaw = getFlag(flags, 'state')?.trim();
    if (stateRaw && stateRaw !== 'active' && stateRaw !== 'expired') {
      fail(
        'INVALID_STATE_FILTER',
        `Invalid --state "${stateRaw}". Expected active or expired.`
      );
    }
    const page = await (
      await ctx.getClient()
    ).list({ runLabel, state: stateRaw as 'active' | 'expired' | undefined });
    const safeUsers = page.users.map(sanitizeIdentity);
    emitOutput(
      ctx,
      {
        env: ctx.env,
        more: page.more,
        origin: ctx.origins.admin,
        users: safeUsers,
      },
      safeUsers.length === 0
        ? [`No Upskii QA users found (${ctx.env}).`]
        : [
            `Upskii QA users (${ctx.env}): ${safeUsers.length}${page.more ? ' (more available)' : ''}`,
            ...safeUsers.map(
              (u) =>
                `  ${u.userId}  ${u.role}  ${u.email}${u.state ? `  [${u.state}]` : ''}`
            ),
          ]
    );
    return;
  }

  if (action === 'get') {
    if (!userId) fail('MISSING_USER_ID', 'Usage: users get <userId>');
    const user = sanitizeIdentity(await (await ctx.getClient()).get(userId));
    emitOutput(ctx, { env: ctx.env, user }, [
      `User: ${user.userId}`,
      `Email: ${user.email}`,
      `Role: ${user.role}`,
    ]);
    return;
  }

  if (action === 'disable') {
    if (!userId)
      fail(
        'MISSING_USER_ID',
        'Usage: users disable <userId> --yes --confirm <userId>'
      );
    if (shouldPreview(flags)) {
      emitPreview(
        ctx,
        `Disable Upskii QA user ${userId}`,
        `/api/admin/qa/users/${userId}`,
        2,
        `ttr external upskii qa users disable ${userId} --yes --confirm ${userId}`,
        [{ after: 'disabled', field: 'state' }],
        userId
      );
      return;
    }
    requireConfirm(flags, userId, 'users disable');
    const client = await ctx.getClient();
    const authoritative = await client.get(userId);
    if (authoritative.userId !== userId) {
      fail(
        'QA_IDENTITY_MISMATCH',
        `Server returned userId "${authoritative.userId}", not "${userId}".`,
        CLI_EXIT.policy
      );
    }
    const result = await client.disable(userId);
    emitOutput(ctx, { env: ctx.env, ...result }, [
      `Disabled Upskii QA user ${result.userId} (${result.outcome}).`,
    ]);
    return;
  }

  if (action === 'purge') {
    if (!userId)
      fail(
        'MISSING_USER_ID',
        'Usage: users purge <userId> [--mode dry-run|apply|verify] [--yes --confirm <userId>]'
      );
    const mode = parsePurgeMode(getFlag(flags, 'mode'), 'dry-run');
    if (shouldPreview(flags)) {
      emitPreview(
        ctx,
        `Purge Upskii QA user ${userId} (mode=${mode})`,
        `/api/admin/qa/users/${userId}/purge`,
        mode === 'apply' ? 2 : 1,
        mode === 'apply'
          ? `ttr external upskii qa users purge ${userId} --mode apply --yes --confirm ${userId}`
          : `ttr external upskii qa users purge ${userId} --mode ${mode} --yes`,
        [{ after: mode, field: 'mode' }],
        mode === 'apply' ? userId : undefined
      );
      return;
    }
    const client = await ctx.getClient();
    if (mode === 'apply') {
      requireConfirm(flags, userId, 'users purge --mode apply');
      const authoritative = await client.get(userId);
      if (authoritative.userId !== userId) {
        fail(
          'QA_IDENTITY_MISMATCH',
          `Server returned userId "${authoritative.userId}", not "${userId}".`,
          CLI_EXIT.policy
        );
      }
    }
    const result = await client.purge(userId, mode);
    emitOutput(ctx, { env: ctx.env, mode, result, userId }, [
      `Purge (${mode}) for ${userId}: ${JSON.stringify(result.counts)}`,
    ]);
    return;
  }

  fail(
    'UNKNOWN_SUBCOMMAND',
    `Unknown users subcommand "${action ?? ''}". Expected create, list, get, disable, or purge.`
  );
}

function toBundleHelpers(ctx: CommandContext): QaBundleHelpers {
  return {
    emitOutput: (payload, lines) => emitOutput(ctx, payload, lines),
    emitPreview: (title, target, tier, applyHint, changes, confirmToken) =>
      emitPreview(ctx, title, target, tier, applyHint, changes, confirmToken),
    env: ctx.env,
    fetch: ctx.fetch,
    getActiveSecrets: ctx.getActiveSecrets,
    getClient: ctx.getClient,
    origins: ctx.origins,
    parseCountFlag,
    parsePurgeMode,
    parseQaTtlSeconds,
    requireConfirm,
    requireFlag,
    requireRunLabel,
    sanitizeIdentity,
    writeCredentialsFile,
  };
}

export async function runUpskiiQaCommand(
  options: RunUpskiiQaCommandOptions
): Promise<void> {
  const write =
    options.write ??
    ((chunk: string) => {
      process.stdout.write(chunk);
    });
  const { flags, positionals } = parseQaArgs(options.args);

  if (
    flags.help === true ||
    positionals.length === 0 ||
    positionals[0] === 'help'
  ) {
    write(`${upskiiQaHelp()}\n`);
    return;
  }
  if (options.env === 'prod' && !options.explicitEnvFlag) {
    fail(
      'PROD_ENV_EXPLICIT_REQUIRED',
      'Refusing to target prod without explicit --env prod (external upskii qa defaults to staging).',
      CLI_EXIT.policy,
      'Pass --env prod explicitly to target production Upskii QA endpoints.'
    );
  }

  const origins = resolveUpskiiOrigins(options.env);
  const activeSecrets: string[] = [];
  let cachedClient: ReturnType<typeof createUpskiiQaClient> | undefined;
  const ctx: CommandContext = {
    env: options.env,
    fetch: options.fetch,
    getActiveSecrets: () => activeSecrets,
    getClient: async () => {
      if (!cachedClient) {
        const token = await options.resolveQaToken();
        activeSecrets.push(token);
        cachedClient = createUpskiiQaClient({
          env: options.env,
          fetch: options.fetch,
          origins,
          token,
        });
      }
      return cachedClient;
    },
    json: options.json,
    origins,
    write,
  };

  const [group, ...rest] = positionals;
  if (group === 'users') return handleUsersSubcommand(ctx, rest, flags);
  if (group === 'seed-class') {
    const teacherUserId = rest[0];
    if (!teacherUserId)
      fail('MISSING_USER_ID', 'Usage: seed-class <teacherUserId> [--yes]');
    if (shouldPreview(flags)) {
      emitPreview(
        ctx,
        `Seed QA class for teacher ${teacherUserId}`,
        `/api/admin/qa/users/${teacherUserId}`,
        1,
        `ttr external upskii qa seed-class ${teacherUserId} --yes`,
        [{ after: teacherUserId, field: 'teacherUserId' }]
      );
      return;
    }
    const seeded = await (await ctx.getClient()).seedClass(teacherUserId);
    emitOutput(ctx, { env: options.env, ...seeded }, [
      `Seeded class ${seeded.classId} for ${seeded.userId} (${seeded.outcome}).`,
    ]);
    return;
  }
  if (group === 'session') {
    const userId = rest[0];
    if (!userId || !SAFE_QA_ID_PATTERN.test(userId))
      fail(
        'MISSING_USER_ID',
        'Usage: session <userId> --credentials <file> [--format storage-state|cookie] --out <file> --yes'
      );
    const credentialsPath = requireFlag(flags, 'credentials');
    const outPath = requireFlag(flags, 'out');
    const format = (getFlag(flags, 'format')?.trim() || 'storage-state') as
      | 'storage-state'
      | 'cookie';
    if (format !== 'storage-state' && format !== 'cookie')
      fail(
        'INVALID_SESSION_FORMAT',
        `Invalid --format "${format}". Expected storage-state or cookie.`
      );
    const parsedCreds = credentialsFileSchema.safeParse(
      await readPrivateJsonFile(credentialsPath, 'credentials')
    );
    if (!parsedCreds.success)
      fail(
        'INVALID_CREDENTIALS_FILE',
        `Invalid credentials file schema: ${credentialsPath}`
      );
    if (parsedCreds.data.userId !== userId)
      fail(
        'CREDENTIAL_USER_MISMATCH',
        `Credentials file belongs to "${parsedCreds.data.userId}", not "${userId}".`,
        CLI_EXIT.policy
      );
    if (parsedCreds.data.env !== options.env)
      fail(
        'CREDENTIAL_ENV_MISMATCH',
        `Credentials file targets "${parsedCreds.data.env}", not "${options.env}".`,
        CLI_EXIT.policy,
        `Re-run with --env ${parsedCreds.data.env}`
      );
    if (shouldPreview(flags)) {
      emitPreview(
        ctx,
        `Sign in Upskii QA user ${userId} and write ${format} file`,
        '/api/auth/password',
        1,
        `ttr external upskii qa session ${userId} --env ${options.env} --credentials ${credentialsPath} --format ${format} --out ${outPath} --yes`,
        [
          { after: format, field: 'format' },
          { after: resolve(outPath), field: 'outFile' },
        ]
      );
      return;
    }
    const signedIn = await upskiiPasswordSignIn({
      email: parsedCreds.data.email,
      fetch: options.fetch,
      origins,
      password: parsedCreds.data.password,
      role: parsedCreds.data.role,
    });
    const content =
      format === 'storage-state'
        ? `${JSON.stringify(signedIn.storageState, null, 2)}\n`
        : `${signedIn.cookiePair}\n`;
    const writtenOut = await writePrivateFile(outPath, content);
    const cookieName = signedIn.cookiePair.split('=', 1)[0] ?? '';
    emitOutput(
      ctx,
      {
        cookieName,
        email: parsedCreds.data.email,
        env: options.env,
        format,
        outFile: writtenOut,
        role: parsedCreds.data.role,
        userId,
      },
      [
        `Wrote ${format} session for ${userId} to ${writtenOut} (0600, cookie=${cookieName}).`,
      ]
    );
    return;
  }
  if (group === 'bundle') {
    if (rest[0] === 'create')
      return handleBundleCreate(toBundleHelpers(ctx), flags);
    if (rest[0] === 'teardown')
      return handleBundleTeardown(toBundleHelpers(ctx), flags);
    fail(
      'UNKNOWN_SUBCOMMAND',
      `Unknown bundle subcommand "${rest[0] ?? ''}". Expected create or teardown.`
    );
  }
  if (group === 'sweep') return handleSweep(toBundleHelpers(ctx), flags);
  fail(
    'UNKNOWN_SUBCOMMAND',
    `Unknown upskii qa subcommand "${group ?? ''}". Run with --help for usage.`
  );
}
