import { join, resolve } from 'node:path';
import type {
  CreateQaUsersResult,
  QaSessionResult,
  QaUser,
  QaUsersAdminClient,
} from '../platform-qa-users';
import { type FlagValue, getFlag } from './args';
import {
  createQaSecretStore,
  keychainAvailable,
  type PasswordStore,
  type QaSecretStore,
  runDirectory,
  sessionFileName,
  writePrivateFile,
} from './qa-users-secrets';

const RUN_ID = /^[a-z0-9]{8}$/u;
const USER_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const MIN_TTL_SECONDS = 15 * 60;
const MAX_TTL_SECONDS = 72 * 60 * 60;

export interface QaCliOptions {
  client: { qa: { users: QaUsersAdminClient } };
  flags: Record<string, FlagValue>;
  json: boolean;
  positionals: string[];
}

export interface QaCliDeps {
  secrets: QaSecretStore;
  keychain: boolean;
  write: (text: string) => void;
  now: () => number;
}

const defaultDeps = (): QaCliDeps => ({
  secrets: createQaSecretStore(),
  keychain: keychainAvailable(),
  write: (text) => process.stdout.write(text),
  now: Date.now,
});

/** Parses 15m..72h durations with m, h or d units into seconds. */
export function parseQaTtl(value: string) {
  const match = value.trim().match(/^(\d{1,4})([mhd])$/u);
  if (!match)
    throw new Error('Invalid --ttl. Use a duration such as 90m, 24h or 2d.');
  const seconds =
    Number(match[1]) *
    { m: 60, h: 3600, d: 86_400 }[match[2] as 'm' | 'h' | 'd'];
  if (seconds < MIN_TTL_SECONDS || seconds > MAX_TTL_SECONDS)
    throw new Error('--ttl must be between 15m and 72h.');
  return seconds;
}

/** Playwright storage state. Domain falls back to the session origin host. */
export function toStorageState(result: QaSessionResult, now = Date.now()) {
  const host = new URL(result.origin).hostname;
  return {
    cookies: result.cookies.map((cookie) => ({
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain ?? host,
      path: cookie.path || '/',
      expires:
        typeof cookie.maxAge === 'number'
          ? Math.floor(now / 1000) + cookie.maxAge
          : -1,
      httpOnly: cookie.httpOnly,
      secure: cookie.secure,
      sameSite: cookie.sameSite,
    })),
    origins: [],
  };
}

function toTokens(result: QaSessionResult) {
  return {
    userId: result.userId,
    email: result.email,
    runId: result.runId,
    origin: result.origin,
    accountExpiresAt: result.expiresAt,
    accessToken: result.session.accessToken,
    refreshToken: result.session.refreshToken,
    accessTokenExpiresAt: result.session.expiresAt,
  };
}

function emit(deps: QaCliDeps, json: boolean, value: unknown, human: string) {
  deps.write(json ? `${JSON.stringify(value, null, 2)}\n` : `${human}\n`);
}

function requireUserId(id: string | undefined) {
  if (!id || !USER_ID.test(id)) throw new Error('Pass a QA user ID (UUID).');
  return id;
}

function userLine(
  user: Pick<QaUser, 'email' | 'userId' | 'ordinal' | 'staff' | 'tier'>
) {
  return `  #${user.ordinal}  ${user.email}  ${user.userId}  ${user.tier}${user.staff ? '  staff' : ''}`;
}

async function create(options: QaCliOptions, deps: QaCliDeps) {
  const { flags } = options;
  const count = Number(getFlag(flags, 'count') ?? '1');
  if (!Number.isInteger(count) || count < 1 || count > 50)
    throw new Error('--count must be an integer from 1 to 50.');
  const tier = (getFlag(flags, 'tier') ?? 'free').toLowerCase();
  if (tier !== 'free' && tier !== 'plus' && tier !== 'pro')
    throw new Error('--tier must be free, plus or pro.');
  const runId = getFlag(flags, 'run');
  const purpose = getFlag(flags, 'purpose');
  const ttl = getFlag(flags, 'ttl');
  if (runId && !RUN_ID.test(runId)) throw new Error('Invalid --run ID.');
  if (runId && (purpose || ttl))
    throw new Error(
      '--purpose and --ttl apply only to a new run; omit them with --run.'
    );
  if (!runId && (!purpose || !ttl))
    throw new Error(
      'A new run needs --purpose and --ttl (or pass --run <id>).'
    );
  const requested = getFlag(flags, 'password-store');
  if (requested && requested !== 'keychain' && requested !== 'file')
    throw new Error('--password-store must be keychain or file.');
  const store: PasswordStore =
    (requested as PasswordStore | undefined) ??
    (deps.keychain ? 'keychain' : 'file');
  if (store === 'keychain' && !deps.keychain)
    throw new Error(
      'macOS Keychain is unavailable; use --password-store file.'
    );

  const result: CreateQaUsersResult = await options.client.qa.users.create({
    count,
    tier,
    staff: flags.staff === true,
    workspace: flags.workspace === true,
    ...(runId ? { runId } : { purpose, ttlSeconds: parseQaTtl(ttl!) }),
  });
  const stored = result.users.length
    ? await deps.secrets.storePasswords(
        result.runId,
        result.users.map(({ userId, email, password }) => ({
          userId,
          email,
          password,
        })),
        store
      )
    : null;
  const users = result.users.map(({ password: _secret, ...user }) => user);
  const summary = {
    runId: result.runId,
    purpose: result.purpose,
    expiresAt: result.expiresAt,
    runWorkspaceId: result.runWorkspaceId,
    users,
    failed: result.failed,
    credentials: stored,
  };
  emit(
    deps,
    options.json,
    summary,
    [
      `Run ${result.runId} (${result.purpose}) expires ${result.expiresAt}`,
      ...(result.runWorkspaceId
        ? [`Run workspace: ${result.runWorkspaceId}`]
        : []),
      `Created ${users.length}:`,
      ...users.map(userLine),
      ...(result.failed.length
        ? [
            `Failed ${result.failed.length} (cleanup: ${result.failed.map((f) => f.cleanup).join(', ')}):`,
            ...result.failed.map(
              (f) =>
                `  ${f.email}  ${f.userId}${f.stage ? `  step: ${f.stage}` : ''}${f.code ? `  code: ${f.code}` : ''}`
            ),
          ]
        : []),
      ...(stored ? [`Passwords stored in ${stored.location}`] : []),
      ...(users.length
        ? [`Mint a browser session: ttr qa users session <user-id>`]
        : []),
    ].join('\n')
  );
  if (!users.length)
    throw new Error(
      `No QA accounts were created in run ${result.runId}; see the failed steps above.`
    );
}

async function session(options: QaCliOptions, deps: QaCliDeps, id?: string) {
  const userId = requireUserId(id);
  const format = getFlag(options.flags, 'format') ?? 'storage-state';
  if (format !== 'storage-state' && format !== 'tokens')
    throw new Error('--format must be storage-state or tokens.');
  const origin = getFlag(options.flags, 'origin');
  const result = await options.client.qa.users.session(
    userId,
    origin ? { origin } : {}
  );
  if (result.userId !== userId || !RUN_ID.test(result.runId))
    throw new Error('Unexpected QA session response.');
  const out = getFlag(options.flags, 'out');
  const path = out
    ? resolve(out)
    : join(await runDirectory(result.runId), sessionFileName(userId, format));
  const contents =
    format === 'tokens' ? toTokens(result) : toStorageState(result, deps.now());
  await writePrivateFile(path, `${JSON.stringify(contents, null, 2)}\n`);
  const summary = {
    userId,
    email: result.email,
    runId: result.runId,
    format,
    path,
    accountExpiresAt: result.expiresAt,
    accessTokenExpiresAt: new Date(
      result.session.expiresAt * 1000
    ).toISOString(),
  };
  emit(
    deps,
    options.json,
    summary,
    `Wrote ${format} for ${result.email} to ${path} (0600). Account expires ${result.expiresAt}.`
  );
}

async function forget(deps: QaCliDeps, users: QaUser[], ids: string[]) {
  const byId = new Map(users.map((user) => [user.userId, user]));
  for (const id of ids) {
    const user = byId.get(id);
    if (user)
      await deps.secrets.removeUser(user.runId, user.userId, user.email);
  }
}

async function remove(options: QaCliOptions, deps: QaCliDeps, id?: string) {
  const userId = requireUserId(id);
  const { users }: { users: QaUser[] } = await options.client.qa.users.list({
    includeDeleted: true,
  });
  const result = await options.client.qa.users.delete(userId);
  if (result.outcome === 'deleted' || result.outcome === 'not_found')
    await forget(deps, users, [userId]);
  emit(deps, options.json, result, `${userId}: ${result.outcome}`);
  if (result.outcome === 'busy' || result.outcome === 'pending')
    process.exitCode = 1;
}

async function cleanup(options: QaCliOptions, deps: QaCliDeps) {
  const runId = getFlag(options.flags, 'run');
  const expired = options.flags.expired === true;
  if (Boolean(runId) === expired)
    throw new Error('Pass exactly one of --run <id> or --expired.');
  if (runId && !RUN_ID.test(runId)) throw new Error('Invalid --run ID.');
  const { users }: { users: QaUser[] } = await options.client.qa.users.list({
    ...(runId ? { runId } : {}),
    includeDeleted: true,
  });
  const result = await options.client.qa.users.cleanup(
    runId ? { runId } : { expired: true }
  );
  await forget(deps, users, result.deleted);
  emit(
    deps,
    options.json,
    result,
    result.fenced
      ? 'Cleanup is fenced (disabled in private.qa_test_user_control).'
      : `Deleted ${result.deleted.length}, pending ${result.pending.length}, skipped ${result.skipped.length}.`
  );
  if (result.pending.length || result.skipped.length) process.exitCode = 1;
}

async function list(options: QaCliOptions, deps: QaCliDeps) {
  const runId = getFlag(options.flags, 'run');
  if (runId && !RUN_ID.test(runId)) throw new Error('Invalid --run ID.');
  const { users }: { users: QaUser[] } = await options.client.qa.users.list({
    ...(runId ? { runId } : {}),
    includeDeleted: options.flags['include-deleted'] === true,
  });
  emit(
    deps,
    options.json,
    { users },
    users.length
      ? users
          .map(
            (u) =>
              `${u.runId}  #${u.ordinal}  ${u.state}  ${u.tier}${u.staff ? ' staff' : ''}  ${u.email}  ${u.userId}  expires ${u.expiresAt}`
          )
          .join('\n')
      : 'No QA test users.'
  );
}

/** `ttr qa users <create|list|session|delete|cleanup>`; positionals start after `qa`. */
export async function runQaCommand(
  options: QaCliOptions,
  deps: QaCliDeps = defaultDeps()
) {
  const [resource, action = 'list', id] = options.positionals;
  if (resource !== 'users')
    throw new Error('Unknown qa command. Run `ttr qa --help`.');
  if (action === 'create') return create(options, deps);
  if (action === 'list') return list(options, deps);
  if (action === 'session') return session(options, deps, id);
  if (action === 'delete') return remove(options, deps, id);
  if (action === 'cleanup') return cleanup(options, deps);
  throw new Error(`Unknown qa users action: ${action}`);
}

export function qaHelp(action?: string) {
  const usage: Record<string, string> = {
    create:
      'ttr qa users create --count N [--tier free|plus|pro] [--staff] [--workspace]\n    (--purpose <slug> --ttl <15m..72h> | --run <id>) [--password-store keychain|file] [--json]',
    list: 'ttr qa users list [--run <id>] [--include-deleted] [--json]',
    session:
      'ttr qa users session <user-id> [--origin <https-url>] [--format storage-state|tokens] [--out <path>] [--json]',
    delete: 'ttr qa users delete <user-id> [--json]',
    cleanup: 'ttr qa users cleanup (--run <id> | --expired) [--json]',
  };
  const lines =
    action && usage[action]
      ? [`  ${usage[action]}`]
      : Object.values(usage).map((line) => `  ${line}`);
  return `QA test users (root permission manage_qa_test_users)

${lines.join('\n')}

Accounts carry an immutable QA marker, reserved qa+<run>-<n> addresses and a run
expiry (default cleanup deletes them automatically). --staff uses @tuturuuu.com
(max 5 per run); participants use @tutur3u.com. --workspace adds the run to a
shared [QA] workspace owned by the run's first account. Passwords go only to the
macOS Keychain (service tuturuuu-qa) or 0600 files under ~/.tuturuuu/qa;
sessions are written as 0600 Playwright storage state. Secrets never print.
`;
}
