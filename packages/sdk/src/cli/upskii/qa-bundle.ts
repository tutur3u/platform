import { lstat, realpath, rm } from 'node:fs/promises';
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from 'node:path';
import { z } from 'zod';
import { type FlagValue, getFlag } from '../args';
import {
  CLI_EXIT,
  CliError,
  type CliExitCode,
  type MutationDiffEntry,
} from '../cli-contracts';
import type { CliEnv, UpskiiOrigins } from '../cli-env';
import {
  assertNoUntrustedPathSymlinks,
  assertSafeResponseText,
  assertVerifiedDirectory,
  captureVerifiedDirectory,
  ensurePrivateDir,
  isUpskiiQaEmail,
  readPrivateJsonFile,
  UPSKII_RUN_LABEL_PATTERN,
  type VerifiedDirectory,
  writePrivateFile,
} from './http';
import {
  type createUpskiiQaClient,
  SAFE_QA_ID_PATTERN,
  UPSKII_QA_ROLES,
  type UpskiiQaIdentity,
  type UpskiiQaPurgeMode,
  type UpskiiQaPurgeResult,
  type UpskiiQaRole,
  upskiiPasswordSignIn,
} from './qa-client';

const MAX_SWEEP_PAGES = 20;
const MAX_BUNDLE_USERS = 10;
const SWEEP_CONFIRM_TOKEN = 'SWEEP_UPSKII_QA';
const SAFE_BUNDLE_ARTIFACT_NAME =
  /^(?:teacher|student|outsider)-\d+\.(?:credentials|storage-state)\.json$/u;
const FORBIDDEN_SECRET_FLAGS = new Set([
  'token',
  'password',
  'qa-token',
  'provisioner-token',
]);
const BOOLEAN_FLAGS = new Set([
  'yes',
  'dry-run',
  'expired',
  'seed-class',
  'help',
  'json',
  'jsonl',
  'no-color',
]);

export function parseQaArgs(args: string[]): {
  flags: Record<string, FlagValue>;
  positionals: string[];
} {
  const flags: Record<string, FlagValue> = {};
  const positionals: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]!;
    if (arg === '-h') {
      flags.help = true;
      continue;
    }
    if (!arg.startsWith('--')) {
      positionals.push(arg);
      continue;
    }
    const [rawKey, inlineValue] = arg.slice(2).split(/=(.*)/su, 2);
    const key = rawKey ?? '';
    if (!key) continue;
    if (FORBIDDEN_SECRET_FLAGS.has(key.toLowerCase())) {
      fail(
        'SECRET_IN_CLI_FLAG',
        `Refused sensitive CLI flag "--${key}".`,
        CLI_EXIT.policy,
        'Store credentials in keychain or env, never CLI flags.'
      );
    }
    if (BOOLEAN_FLAGS.has(key)) {
      if (inlineValue === undefined || inlineValue === 'true')
        flags[key] = true;
      else if (inlineValue === 'false') flags[key] = false;
      else
        fail(
          'INVALID_FLAG_VALUE',
          `Flag "--${key}" does not accept value "${inlineValue}".`
        );
      continue;
    }
    if (inlineValue !== undefined) {
      flags[key] = inlineValue;
      continue;
    }
    const next = args[i + 1];
    if (next && !next.startsWith('--')) {
      flags[key] = next;
      i += 1;
    } else {
      flags[key] = true;
    }
  }
  return { flags, positionals };
}

export const ledgerSchema = z.object({
  createdAt: z.string(),
  env: z.enum(['prod', 'staging', 'sandbox', 'local']),
  origins: z.object({ admin: z.string(), app: z.string(), auth: z.string() }),
  runLabel: z.string(),
  seedClassId: z.string().regex(SAFE_QA_ID_PATTERN).nullable(),
  storageStatePaths: z.record(z.string(), z.string()),
  ttlSeconds: z.number().int(),
  users: z.array(
    z.object({
      credentialsPath: z.string(),
      email: z.string(),
      role: z.enum(UPSKII_QA_ROLES),
      storageStatePath: z.string().optional(),
      userId: z.string().regex(SAFE_QA_ID_PATTERN),
    })
  ),
  version: z.literal(1),
});

export type UpskiiQaLedger = z.infer<typeof ledgerSchema>;
export type UpskiiQaLedgerUser = UpskiiQaLedger['users'][number];

export interface QaBundleHelpers {
  emitOutput: (payload: unknown, lines: string[]) => void;
  emitPreview: (
    title: string,
    target: string,
    tier: 1 | 2,
    applyHint: string,
    changes: MutationDiffEntry[],
    confirmToken?: string
  ) => void;
  env: CliEnv;
  fetch?: typeof globalThis.fetch;
  getActiveSecrets: () => readonly string[];
  getClient: () => Promise<ReturnType<typeof createUpskiiQaClient>>;
  origins: UpskiiOrigins;
  parseCountFlag: (
    flags: Record<string, FlagValue>,
    name: string,
    fallback: number
  ) => number;
  parsePurgeMode: (
    value: string | undefined,
    fallback: UpskiiQaPurgeMode
  ) => UpskiiQaPurgeMode;
  parseQaTtlSeconds: (value?: string) => number;
  requireConfirm: (
    flags: Record<string, FlagValue>,
    expected: string,
    action: string
  ) => void;
  requireFlag: (flags: Record<string, FlagValue>, name: string) => string;
  requireRunLabel: (flags: Record<string, FlagValue>) => string;
  sanitizeIdentity: (
    identity: UpskiiQaIdentity
  ) => Omit<UpskiiQaIdentity, 'password'>;
  writeCredentialsFile: (
    outDir: string,
    filename: string,
    identity: UpskiiQaIdentity,
    runLabel: string,
    env: CliEnv,
    verifiedDir?: VerifiedDirectory
  ) => Promise<string>;
}

function fail(
  code: string,
  message: string,
  exitCode: CliExitCode = CLI_EXIT.usage,
  hint?: string
): never {
  throw new CliError({ code, exitCode, hint, message });
}

export function upskiiQaHelp(): string {
  return [
    'Usage: ttr external upskii qa <subcommand> [options]',
    '',
    'Defaults to --env staging. Targeting prod requires explicit --env prod.',
    'Secrets are never accepted as CLI flags (--token / --password are refused).',
    '',
    'Subcommands:',
    '  users create --run <label> --role <teacher|student|outsider> [--ttl 2h] [--out-dir <dir>] [--yes]',
    '  users list [--run <label>] [--state active|expired]',
    '  users get <userId>',
    '  users disable <userId> --yes --confirm <userId>',
    '  users purge <userId> [--mode dry-run|apply|verify] [--yes --confirm <userId>]',
    '  seed-class <teacherUserId> [--yes]',
    '  session <userId> --credentials <file> [--format storage-state|cookie] --out <file> [--yes]',
    '  bundle create --run <label> [--teachers 1] [--students 1] [--outsiders 0] [--seed-class] [--ttl 2h] --out-dir <dir> [--yes]',
    '  bundle teardown --ledger <file> [--mode dry-run|apply|verify] [--yes --confirm <runLabel>]',
    '  sweep [--run <label>] [--expired] [--dry-run|--yes --confirm SWEEP_UPSKII_QA]',
  ].join('\n');
}

export function parseQaTtlSeconds(value?: string): number {
  if (value === undefined || value.trim() === '') return 7200;
  const match = /^(\d+)(s|m|h)?$/u.exec(value.trim().toLowerCase());
  if (!match?.[1])
    fail(
      'INVALID_TTL',
      `Invalid --ttl "${value}". Use 60s..7200s (e.g. 15m, 2h, 300s).`
    );
  const unit = match[2] ?? 's';
  const seconds =
    Number.parseInt(match[1], 10) *
    (unit === 'h' ? 3600 : unit === 'm' ? 60 : 1);
  if (!Number.isInteger(seconds) || seconds < 60 || seconds > 7200) {
    fail(
      'INVALID_TTL',
      `Invalid --ttl "${value}". Must be between 60s and 7200s.`
    );
  }
  return seconds;
}

export async function handleBundleCreate(
  ctx: QaBundleHelpers,
  flags: Record<string, FlagValue>
): Promise<void> {
  const runLabel = ctx.requireRunLabel(flags);
  const outDirFlag = ctx.requireFlag(flags, 'out-dir');
  const teachers = ctx.parseCountFlag(flags, 'teachers', 1);
  const students = ctx.parseCountFlag(flags, 'students', 1);
  const outsiders = ctx.parseCountFlag(flags, 'outsiders', 0);
  const total = teachers + students + outsiders;
  if (total < 1 || total > MAX_BUNDLE_USERS)
    fail(
      'INVALID_BUNDLE_SIZE',
      `Bundle must provision between 1 and ${MAX_BUNDLE_USERS} users (requested ${total}).`
    );
  const seedClass = flags['seed-class'] === true;
  if (seedClass && teachers < 1)
    fail(
      'SEED_CLASS_REQUIRES_TEACHER',
      '--seed-class requires at least one teacher (--teachers >= 1).'
    );
  const ttlSeconds = ctx.parseQaTtlSeconds(getFlag(flags, 'ttl'));
  const resolvedOutDir = resolve(outDirFlag);
  const ledgerPath = join(resolvedOutDir, 'ledger.json');

  if (flags['dry-run'] === true || flags.yes !== true) {
    ctx.emitPreview(
      `Provision Upskii QA bundle (${total} users)`,
      '/api/admin/qa/users',
      1,
      `ttr external upskii qa bundle create --run ${runLabel} --teachers ${teachers} --students ${students} --outsiders ${outsiders}${seedClass ? ' --seed-class' : ''} --ttl ${ttlSeconds}s --out-dir ${outDirFlag} --yes`,
      [
        { after: runLabel, field: 'runLabel' },
        { after: { outsiders, students, teachers }, field: 'roles' },
        { after: seedClass, field: 'seedClass' },
        { after: ttlSeconds, field: 'ttlSeconds' },
        { after: ledgerPath, field: 'ledgerPath' },
      ]
    );
    return;
  }

  await ensurePrivateDir(resolvedOutDir);
  const dirAnchor = await captureVerifiedDirectory(resolvedOutDir);
  const realOutDir = dirAnchor.realDir;
  const client = await ctx.getClient();
  const collectedSecrets: string[] = [...ctx.getActiveSecrets()];
  const ledger: UpskiiQaLedger = {
    createdAt: new Date().toISOString(),
    env: ctx.env,
    origins: ctx.origins,
    runLabel,
    seedClassId: null,
    storageStatePaths: {},
    ttlSeconds,
    users: [],
    version: 1,
  };
  const persistLedger = async () => {
    const serialized = `${JSON.stringify(ledger, null, 2)}\n`;
    assertSafeResponseText(serialized, collectedSecrets);
    await assertVerifiedDirectory(dirAnchor);
    return writePrivateFile(join(realOutDir, 'ledger.json'), serialized);
  };
  const rolesPlan: Array<{ index: number; role: UpskiiQaRole }> = [
    ...Array.from({ length: teachers }, (_, i) => ({
      index: i + 1,
      role: 'teacher' as const,
    })),
    ...Array.from({ length: students }, (_, i) => ({
      index: i + 1,
      role: 'student' as const,
    })),
    ...Array.from({ length: outsiders }, (_, i) => ({
      index: i + 1,
      role: 'outsider' as const,
    })),
  ];

  for (const { index, role } of rolesPlan) {
    const slotKey = `${role}-${index}`;
    const created = await client.create({ role, runLabel, ttlSeconds });
    if (created.password) collectedSecrets.push(created.password);
    const credentialsPath = await ctx.writeCredentialsFile(
      realOutDir,
      `${slotKey}.credentials.json`,
      created,
      runLabel,
      ctx.env,
      dirAnchor
    );
    const ledgerUser: UpskiiQaLedgerUser = {
      credentialsPath,
      email: created.email,
      role: created.role,
      userId: created.userId,
    };
    ledger.users.push(ledgerUser);
    await persistLedger();

    if (created.password) {
      const signedIn = await upskiiPasswordSignIn({
        email: created.email,
        fetch: ctx.fetch,
        origins: ctx.origins,
        password: created.password,
        role: created.role,
      });
      collectedSecrets.push(signedIn.cookiePair);
      const storageFileName = `${slotKey}.storage-state.json`;
      const storageTarget = resolve(realOutDir, storageFileName);
      if (relative(realOutDir, storageTarget) !== storageFileName) {
        fail(
          'UNSAFE_OUTPUT_PATH',
          'StorageState path escaped output directory.',
          CLI_EXIT.policy
        );
      }
      await assertVerifiedDirectory(dirAnchor);
      const storageStatePath = await writePrivateFile(
        storageTarget,
        `${JSON.stringify(signedIn.storageState, null, 2)}\n`
      );
      ledgerUser.storageStatePath = storageStatePath;
      ledger.storageStatePaths[slotKey] = storageStatePath;
      await persistLedger();
    }
  }

  if (seedClass) {
    const teacher = ledger.users.find((u) => u.role === 'teacher');
    if (teacher) {
      ledger.seedClassId = (await client.seedClass(teacher.userId)).classId;
      await persistLedger();
    }
  }

  const outputPayload = {
    env: ctx.env,
    ledgerPath: join(realOutDir, 'ledger.json'),
    outDir: realOutDir,
    runLabel,
    seedClassId: ledger.seedClassId,
    storageStatePaths: ledger.storageStatePaths,
    users: ledger.users,
  };
  assertSafeResponseText(JSON.stringify(outputPayload), collectedSecrets);
  ctx.emitOutput(outputPayload, [
    `Provisioned Upskii QA bundle "${runLabel}" (${ledger.users.length} users, env=${ctx.env})`,
    `Ledger (0600): ${outputPayload.ledgerPath}`,
    ...(ledger.seedClassId ? [`Seed class: ${ledger.seedClassId}`] : []),
  ]);
}

async function verifySafeTeardownTarget(
  ledgerRealDir: string,
  rawPath: string
): Promise<string | null> {
  const candidatePath = resolve(rawPath);
  const name = basename(candidatePath);
  if (!SAFE_BUNDLE_ARTIFACT_NAME.test(name)) {
    fail(
      'UNSAFE_TEARDOWN_PATH',
      `Refusing to delete unexpected bundle artifact name: ${name}`,
      CLI_EXIT.policy
    );
  }
  const info = await lstat(candidatePath).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  );
  if (!info) return null;
  if (info.isSymbolicLink() || !info.isFile()) {
    fail(
      'UNSAFE_TEARDOWN_PATH',
      `Refusing to delete non-regular or symlink file: ${candidatePath}`,
      CLI_EXIT.policy
    );
  }
  if (typeof process.getuid === 'function' && info.uid !== process.getuid()) {
    fail(
      'UNSAFE_TEARDOWN_PATH',
      `Refusing to delete file not owned by current user: ${candidatePath}`,
      CLI_EXIT.policy
    );
  }
  const realTarget = await realpath(candidatePath);
  const rel = relative(ledgerRealDir, realTarget);
  if (
    !rel ||
    isAbsolute(rel) ||
    rel.startsWith('..') ||
    rel.includes('/') ||
    rel.includes('\\')
  ) {
    fail(
      'UNSAFE_TEARDOWN_PATH',
      `Refusing to delete file outside ledger directory: ${candidatePath}`,
      CLI_EXIT.policy
    );
  }
  return realTarget;
}

async function collectSafeTeardownFiles(
  ledgerRealDir: string,
  ledger: UpskiiQaLedger
): Promise<string[]> {
  const candidates = new Set<string>(Object.values(ledger.storageStatePaths));
  for (const user of ledger.users) {
    candidates.add(user.credentialsPath);
    if (user.storageStatePath) candidates.add(user.storageStatePath);
  }
  const safeTargets: string[] = [];
  for (const rawPath of candidates) {
    const verified = await verifySafeTeardownTarget(ledgerRealDir, rawPath);
    if (verified) safeTargets.push(verified);
  }
  return safeTargets;
}

export async function handleBundleTeardown(
  ctx: QaBundleHelpers,
  flags: Record<string, FlagValue>
): Promise<void> {
  const ledgerFile = resolve(ctx.requireFlag(flags, 'ledger'));
  await assertNoUntrustedPathSymlinks(ledgerFile);
  const parsed = ledgerSchema.safeParse(
    await readPrivateJsonFile(ledgerFile, 'ledger')
  );
  if (!parsed.success)
    fail('INVALID_LEDGER', `Invalid Upskii QA ledger schema: ${ledgerFile}`);
  const ledger = parsed.data;
  if (!UPSKII_RUN_LABEL_PATTERN.test(ledger.runLabel))
    fail('INVALID_LEDGER', `Invalid runLabel in ledger: ${ledgerFile}`);
  if (ledger.env !== ctx.env)
    fail(
      'LEDGER_ENV_MISMATCH',
      `Ledger targets "${ledger.env}" but active environment is "${ctx.env}".`,
      CLI_EXIT.policy,
      `Re-run with --env ${ledger.env}`
    );
  for (const user of ledger.users) {
    if (!isUpskiiQaEmail(user.email))
      fail(
        'NON_QA_EMAIL_REFUSED',
        `Refusing teardown for non-QA email in ledger: ${user.userId}`,
        CLI_EXIT.policy
      );
  }

  const ledgerDirAnchor = await captureVerifiedDirectory(dirname(ledgerFile));
  const ledgerRealDir = ledgerDirAnchor.realDir;
  const safeFilesToDelete = await collectSafeTeardownFiles(
    ledgerRealDir,
    ledger
  );
  const mode = ctx.parsePurgeMode(getFlag(flags, 'mode'), 'apply');
  if (flags['dry-run'] === true || flags.yes !== true) {
    ctx.emitPreview(
      `Teardown Upskii QA bundle "${ledger.runLabel}" (mode=${mode})`,
      ledgerFile,
      mode === 'apply' ? 2 : 1,
      mode === 'apply'
        ? `ttr external upskii qa bundle teardown --ledger ${ledgerFile} --mode apply --yes --confirm ${ledger.runLabel}`
        : `ttr external upskii qa bundle teardown --ledger ${ledgerFile} --mode ${mode} --yes`,
      [
        { after: ledger.users.map((u) => u.userId), field: 'purgeUserIds' },
        ...(mode === 'apply'
          ? [{ after: safeFilesToDelete, field: 'deleteFiles' }]
          : []),
      ],
      mode === 'apply' ? ledger.runLabel : undefined
    );
    return;
  }
  if (mode === 'apply') {
    ctx.requireConfirm(flags, ledger.runLabel, 'bundle teardown --mode apply');
  }

  const client = await ctx.getClient();
  const results: Array<{
    apply?: UpskiiQaPurgeResult;
    result?: UpskiiQaPurgeResult;
    userId: string;
    verify?: UpskiiQaPurgeResult;
  }> = [];
  for (const user of ledger.users) {
    if (mode === 'apply') {
      const authoritative = await client.get(user.userId);
      if (authoritative.email.toLowerCase() !== user.email.toLowerCase()) {
        fail(
          'QA_IDENTITY_MISMATCH',
          `Server email for ${user.userId} does not match ledger email; refusing purge.`,
          CLI_EXIT.policy
        );
      }
      results.push({
        apply: await client.purge(user.userId, 'apply'),
        userId: user.userId,
        verify: await client.purge(user.userId, 'verify'),
      });
    } else {
      results.push({
        result: await client.purge(user.userId, mode),
        userId: user.userId,
      });
    }
  }

  const deletedFiles: string[] = [];
  if (mode === 'apply') {
    for (const file of safeFilesToDelete) {
      await assertVerifiedDirectory(ledgerDirAnchor);
      if ((await realpath(dirname(ledgerFile))) !== ledgerRealDir) {
        fail(
          'UNSAFE_TEARDOWN_PATH',
          'Ledger parent path changed during teardown; refusing local file deletion.',
          CLI_EXIT.policy
        );
      }
      const verified = await verifySafeTeardownTarget(ledgerRealDir, file);
      if (!verified) continue;
      await rm(verified, { force: true });
      deletedFiles.push(verified);
    }
  }

  ctx.emitOutput(
    {
      deletedFiles,
      env: ctx.env,
      ledgerPath: ledgerFile,
      mode,
      results,
      runLabel: ledger.runLabel,
    },
    [
      `Bundle teardown (${mode}) for "${ledger.runLabel}": processed ${results.length} user(s)`,
      ...(deletedFiles.length > 0
        ? [
            `Removed ${deletedFiles.length} local credential/storageState file(s).`,
          ]
        : []),
    ]
  );
}

export async function handleSweep(
  ctx: QaBundleHelpers,
  flags: Record<string, FlagValue>
): Promise<void> {
  const runLabel = getFlag(flags, 'run')?.trim();
  if (runLabel && !UPSKII_RUN_LABEL_PATTERN.test(runLabel))
    fail('INVALID_RUN_LABEL', `Invalid --run "${runLabel}".`);
  const expired = flags.expired === true;
  const apply = flags.yes === true;
  if (flags['dry-run'] === true && apply)
    fail('CONFLICTING_FLAGS', 'Cannot pass both --dry-run and --yes.');
  if (apply) ctx.requireConfirm(flags, SWEEP_CONFIRM_TOKEN, 'sweep --yes');

  const client = await ctx.getClient();
  const seenIds = new Set<string>();
  const matched: Array<Omit<UpskiiQaIdentity, 'password'>> = [];
  const purged: Array<{ result: UpskiiQaPurgeResult; userId: string }> = [];
  let cursor: string | undefined;
  let pages = 0;
  let truncated = false;

  while (pages < MAX_SWEEP_PAGES) {
    pages += 1;
    const page = await client.list({
      cursor,
      runLabel,
      state: expired ? 'expired' : undefined,
    });
    const newUsers = page.users.filter((u) => !seenIds.has(u.userId));
    for (const user of newUsers) {
      seenIds.add(user.userId);
      matched.push(ctx.sanitizeIdentity(user));
      if (apply)
        purged.push({
          result: await client.purge(user.userId, 'apply'),
          userId: user.userId,
        });
    }
    if (!page.more) break;
    if (
      pages >= MAX_SWEEP_PAGES ||
      (!page.nextCursor && (!apply || newUsers.length === 0))
    ) {
      truncated = true;
      break;
    }
    if (page.nextCursor) cursor = page.nextCursor;
  }

  const mode = apply ? 'apply' : 'dry-run';
  ctx.emitOutput(
    {
      env: ctx.env,
      expired,
      matchedCount: matched.length,
      mode,
      pages,
      purged,
      purgedCount: purged.length,
      runLabel: runLabel ?? null,
      truncated,
      users: matched,
    },
    [
      `Upskii QA sweep (${mode}, env=${ctx.env}): matched=${matched.length}, purged=${purged.length}, pages=${pages}${truncated ? ' (capped)' : ''}`,
    ]
  );
}
