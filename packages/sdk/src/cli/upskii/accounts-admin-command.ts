import { getFlag, parseArgs } from '../args';
import { CLI_EXIT, CliError } from '../cli-contracts';
import type { CliEnv } from '../cli-env';
import { rejectSecretFlags } from '../credential-store';
import { requireMutationGate } from '../safety-gate';
import { formatTable } from '../ui/table';
import type { UpskiiProductClient } from './product-client';

export interface UpskiiAccountsCommandOptions {
  args: string[];
  client: UpskiiProductClient;
  env: CliEnv;
  explicitEnvFlag?: boolean;
  json: boolean;
  noColor?: boolean;
  write?: (chunk: string) => void;
}

export interface UpskiiAdminCommandOptions {
  args: string[];
  client?: UpskiiProductClient;
  env: CliEnv;
  explicitEnvFlag?: boolean;
  hasAdminCredential?: boolean;
  json: boolean;
  noColor?: boolean;
  write?: (chunk: string) => void;
}

const FLAG_KEY_PATTERN = /^[a-zA-Z0-9._:-]{1,128}$/u;
const ISO_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/u;

function projectSafeOverview(
  record: Record<string, unknown>
): Record<string, boolean | number | string> {
  const safe: Record<string, boolean | number | string> = {};
  for (const [key, value] of Object.entries(record)) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      safe[key] = value;
    } else if (typeof value === 'boolean') {
      safe[key] = value;
    } else if (
      typeof value === 'string' &&
      (ISO_TIMESTAMP_PATTERN.test(value) ||
        (key === 'status' && /^[a-z0-9_-]{1,32}$/iu.test(value)))
    ) {
      safe[key] = value;
    }
  }
  return safe;
}

function projectSafeAdminUser(
  user: Record<string, unknown>
): Record<string, unknown> {
  return {
    createdAt: user.createdAt ?? user.created_at ?? null,
    displayName: user.displayName ?? user.display_name ?? user.name ?? null,
    email: user.email ?? null,
    id: user.id ?? null,
    role: user.role ?? user.adminRole ?? null,
    status: user.status ?? null,
    updatedAt: user.updatedAt ?? user.updated_at ?? null,
  };
}

function parseScalarFlagValue(raw: string): boolean | number | string {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (/^-?\d+(?:\.\d+)?$/u.test(raw)) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) return parsed;
  }
  return raw;
}

function renderSummaryTable(
  record: Record<string, unknown>,
  emptyMessage: string,
  noColor?: boolean
): string {
  const rows = Object.entries(record).map(([key, value]) => ({
    Field: key,
    Value:
      typeof value === 'object' && value !== null
        ? JSON.stringify(value)
        : String(value ?? ''),
  }));
  return formatTable(rows, { emptyMessage, noColor });
}

export function upskiiAccountsHelp(): string {
  return [
    'ttr external upskii accounts — inspect Upskii account profile, active sessions, and usage',
    '',
    'Usage:',
    '  ttr external upskii accounts profile [--json]',
    '  ttr external upskii accounts sessions list [--json]',
    '  ttr external upskii accounts usage [--days <n>] [--json]',
    '  ttr external upskii accounts revoke-session <sessionId> --yes --confirm <sessionId> [--json]',
    '',
    'Revoking a session is a Tier 2 action requiring --yes and --confirm <sessionId>.',
  ].join('\n');
}

export function upskiiAdminHelp(): string {
  return [
    'ttr external upskii admin — Upskii admin overview, user lookup, and feature flags',
    '',
    'Usage:',
    '  ttr external upskii admin overview [--json]',
    '  ttr external upskii admin users list [--query <q>] [--limit <n>] [--json]',
    '  ttr external upskii admin users get <userId> [--json]',
    '  ttr external upskii admin flags list [--json]',
    '  ttr external upskii admin flags set <key> --value <v> --yes --confirm <key> [--json]',
    '',
    'Security:',
    '  Requires a dedicated upskii-admin credential (never falls back to user cookies).',
    '  Targeting production requires explicit --env prod (and --reason for writes).',
    '  `flags set` is Tier 2 and requires --yes and --confirm <key>.',
  ].join('\n');
}

export async function runUpskiiAccountsCommand(
  options: UpskiiAccountsCommandOptions
): Promise<void> {
  const write =
    options.write ?? ((chunk: string) => process.stdout.write(chunk));
  const { flags, positionals } = parseArgs(options.args);
  const [action = 'profile', arg1] = positionals;

  if (action === 'help' || flags.help === true || flags.h === true) {
    write(`${upskiiAccountsHelp()}\n`);
    return;
  }

  rejectSecretFlags(flags);
  const { client, env, json, noColor } = options;

  if (action === 'profile') {
    const res = await client.requestJson<Record<string, unknown>>({
      command: 'external.upskii.accounts.profile',
      path: `${client.apiBase}/profile`,
    });
    if (json) {
      write(
        `${JSON.stringify({ d1Telemetry: res.d1Telemetry, env, profile: res.data }, null, 2)}\n`
      );
      return;
    }
    write(renderSummaryTable(res.data, 'No profile data returned.', noColor));
    return;
  }

  if (action === 'sessions') {
    const verb = arg1 ?? 'list';
    if (verb !== 'list' && verb !== 'ls') {
      throw new CliError({
        code: 'UNKNOWN_ACCOUNTS_ACTION',
        exitCode: CLI_EXIT.usage,
        hint: 'Run `ttr external upskii accounts --help`.',
        message: `Unknown accounts sessions action "${verb}".`,
      });
    }
    const res = await client.requestJson<{
      items?: Array<Record<string, unknown>>;
      sessions?: Array<Record<string, unknown>>;
    }>({
      command: 'external.upskii.accounts.sessions.list',
      path: `${client.apiBase}/account/sessions`,
    });
    const rawSessions = Array.isArray(res.data.sessions)
      ? res.data.sessions
      : Array.isArray(res.data.items)
        ? res.data.items
        : [];
    const sessions = rawSessions.map((session) => ({
      createdAt: session.createdAt ?? session.created_at ?? null,
      current: session.current === true,
      expiresAt: session.expiresAt ?? session.expires_at ?? null,
      id: session.id ?? null,
      lastActiveAt: session.lastActiveAt ?? session.last_active_at ?? null,
      userAgent: session.userAgent ?? session.user_agent ?? null,
    }));
    if (json) {
      write(
        `${JSON.stringify({ count: sessions.length, d1Telemetry: res.d1Telemetry, env, sessions }, null, 2)}\n`
      );
      return;
    }
    write(
      formatTable(
        sessions.map((session) => ({
          CreatedAt: String(session.createdAt ?? ''),
          Current: session.current ? 'yes' : 'no',
          ExpiresAt: String(session.expiresAt ?? ''),
          Id: String(session.id ?? ''),
        })),
        { emptyMessage: 'No active sessions found.', noColor }
      )
    );
    return;
  }

  if (action === 'usage') {
    const daysRaw = getFlag(flags, 'days');
    let query = '';
    if (daysRaw !== undefined) {
      const days = Number(daysRaw);
      if (!Number.isInteger(days) || days < 1 || days > 365) {
        throw new CliError({
          code: 'INVALID_DAYS',
          exitCode: CLI_EXIT.usage,
          message: '--days must be an integer between 1 and 365.',
        });
      }
      query = `?days=${encodeURIComponent(String(days))}`;
    }
    const res = await client.requestJson<Record<string, unknown>>({
      command: 'external.upskii.accounts.usage',
      path: `${client.apiBase}/account/usage${query}`,
    });
    if (json) {
      write(
        `${JSON.stringify({ d1Telemetry: res.d1Telemetry, env, usage: res.data }, null, 2)}\n`
      );
      return;
    }
    write(renderSummaryTable(res.data, 'No account usage returned.', noColor));
    return;
  }

  if (action === 'revoke-session') {
    const sessionId = arg1 ?? getFlag(flags, 'session') ?? getFlag(flags, 'id');
    if (!sessionId) {
      throw new CliError({
        code: 'MISSING_SESSION_ID',
        exitCode: CLI_EXIT.usage,
        message:
          'Pass a session ID: `ttr external upskii accounts revoke-session <sessionId> --yes --confirm <sessionId>`.',
      });
    }

    const gate = await requireMutationGate({
      explicitEnvFlag: options.explicitEnvFlag,
      flags,
      json,
      noColor,
      preview: {
        applyHint: `ttr external upskii accounts revoke-session ${sessionId} --env ${env}${env === 'prod' ? ' --reason "<reason>"' : ''} --yes --confirm ${sessionId}`,
        changes: [{ after: 'revoked', before: 'active', field: 'session' }],
        confirmToken: sessionId,
        env,
        origin: client.origins.app,
        target: `session:${sessionId}`,
        tier: 2,
        title: 'Revoke Upskii account session',
      },
      write,
    });
    if (!gate.applied) return;

    const res = await client.requestJson<Record<string, unknown>>({
      command: 'external.upskii.accounts.revoke-session',
      method: 'DELETE',
      path: `${client.apiBase}/account/sessions/${encodeURIComponent(sessionId)}`,
      reason: gate.reason,
    });
    write(
      `${JSON.stringify({ applied: true, env, result: res.data, revoked: true, sessionId }, null, 2)}\n`
    );
    return;
  }

  throw new CliError({
    code: 'UNKNOWN_ACCOUNTS_ACTION',
    exitCode: CLI_EXIT.usage,
    hint: 'Run `ttr external upskii accounts --help`.',
    message: `Unknown accounts action "${action}".`,
  });
}

export async function runUpskiiAdminCommand(
  options: UpskiiAdminCommandOptions
): Promise<void> {
  const write =
    options.write ?? ((chunk: string) => process.stdout.write(chunk));
  const { flags, positionals } = parseArgs(options.args);
  const [action = 'overview', subAction, targetId] = positionals;

  if (action === 'help' || flags.help === true || flags.h === true) {
    write(`${upskiiAdminHelp()}\n`);
    return;
  }

  rejectSecretFlags(flags);
  const { env, json, noColor } = options;

  if (env === 'prod' && options.explicitEnvFlag !== true) {
    throw new CliError({
      code: 'PROD_ENV_EXPLICIT_REQUIRED',
      exitCode: CLI_EXIT.policy,
      hint: 'Pass --env prod explicitly to run Upskii admin commands against production.',
      message:
        'Refusing Upskii admin command against prod without explicit --env prod.',
    });
  }

  if (!options.client || options.hasAdminCredential === false) {
    throw new CliError({
      code: 'UPSKII_ADMIN_AUTH_REQUIRED',
      exitCode: CLI_EXIT.auth,
      hint: `Store an admin credential with \`ttr external upskii auth login --mode admin --env ${env} --token-stdin --yes\` or set TTR_UPSKII_ADMIN_TOKEN_${env.toUpperCase()}.`,
      message: `No Upskii admin credential found for environment "${env}". Admin commands never fall back to user cookies.`,
    });
  }

  const client = options.client;
  const adminOrigin = client.origins.admin;

  if (action === 'overview') {
    const res = await client.requestJson<Record<string, unknown>>({
      command: 'external.upskii.admin.overview',
      origin: adminOrigin,
      path: '/api/admin/snapshot',
    });
    const overview = projectSafeOverview(res.data);
    if (json) {
      write(
        `${JSON.stringify({ d1Telemetry: res.d1Telemetry, env, origin: adminOrigin, overview }, null, 2)}\n`
      );
      return;
    }
    write(renderSummaryTable(overview, 'No admin overview returned.', noColor));
    return;
  }

  if (action === 'users') {
    const verb = subAction ?? 'list';
    if (verb === 'list' || verb === 'ls') {
      const query = getFlag(flags, 'query') ?? getFlag(flags, 'q');
      const limitRaw = getFlag(flags, 'limit');
      const params = new URLSearchParams();
      if (query?.trim()) params.set('query', query.trim());
      if (limitRaw !== undefined) {
        const limit = Number(limitRaw);
        if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
          throw new CliError({
            code: 'INVALID_LIMIT',
            exitCode: CLI_EXIT.usage,
            message: '--limit must be an integer between 1 and 200.',
          });
        }
        params.set('limit', String(limit));
      }
      const qs = params.toString();
      const res = await client.requestJson<{
        items?: Array<Record<string, unknown>>;
        users?: Array<Record<string, unknown>>;
      }>({
        command: 'external.upskii.admin.users.list',
        origin: adminOrigin,
        path: qs ? `/api/admin/users?${qs}` : '/api/admin/users',
      });
      const users = Array.isArray(res.data.users)
        ? res.data.users
        : Array.isArray(res.data.items)
          ? res.data.items
          : [];
      if (json) {
        write(
          `${JSON.stringify({ count: users.length, d1Telemetry: res.d1Telemetry, env, query: query ?? null, users }, null, 2)}\n`
        );
        return;
      }
      write(
        formatTable(
          users.map((user) => ({
            Email: String(user.email ?? ''),
            Id: String(user.id ?? ''),
            Role: String(user.role ?? user.adminRole ?? ''),
            Status: String(user.status ?? ''),
          })),
          { emptyMessage: 'No Upskii users found.', noColor }
        )
      );
      return;
    }

    if (verb === 'get' || verb === 'show') {
      const userId = targetId ?? getFlag(flags, 'user') ?? getFlag(flags, 'id');
      if (!userId) {
        throw new CliError({
          code: 'MISSING_USER_ID',
          exitCode: CLI_EXIT.usage,
          message:
            'Pass a user ID: `ttr external upskii admin users get <userId>`.',
        });
      }
      const res = await client.requestJson<Record<string, unknown>>({
        command: 'external.upskii.admin.users.get',
        origin: adminOrigin,
        path: `/api/admin/users/${encodeURIComponent(userId)}`,
      });
      write(`${JSON.stringify(projectSafeAdminUser(res.data), null, 2)}\n`);
      return;
    }

    throw new CliError({
      code: 'UNKNOWN_ADMIN_ACTION',
      exitCode: CLI_EXIT.usage,
      hint: 'Run `ttr external upskii admin --help`.',
      message: `Unknown admin users action "${verb}".`,
    });
  }

  if (action === 'flags') {
    const verb = subAction ?? 'list';
    if (verb === 'list' || verb === 'ls') {
      const res = await client.requestJson<{
        features?: Array<Record<string, unknown>>;
        flags?: Array<Record<string, unknown>>;
        items?: Array<Record<string, unknown>>;
      }>({
        command: 'external.upskii.admin.flags.list',
        origin: adminOrigin,
        path: '/api/admin/experimental-features',
      });
      const flagEntries = Array.isArray(res.data.flags)
        ? res.data.flags
        : Array.isArray(res.data.features)
          ? res.data.features
          : Array.isArray(res.data.items)
            ? res.data.items
            : [];
      if (json) {
        write(
          `${JSON.stringify({ count: flagEntries.length, d1Telemetry: res.d1Telemetry, env, flags: flagEntries }, null, 2)}\n`
        );
        return;
      }
      write(
        formatTable(
          flagEntries.map((entry) => ({
            Enabled:
              entry.enabled === undefined ? '' : entry.enabled ? 'yes' : 'no',
            Key: String(entry.key ?? entry.name ?? ''),
            UpdatedAt: String(entry.updatedAt ?? entry.updated_at ?? ''),
            Value: String(entry.value ?? ''),
          })),
          { emptyMessage: 'No admin feature flags found.', noColor }
        )
      );
      return;
    }

    if (verb === 'set') {
      const flagKey =
        targetId ?? getFlag(flags, 'key') ?? getFlag(flags, 'flag');
      if (!flagKey) {
        throw new CliError({
          code: 'MISSING_FLAG_KEY',
          exitCode: CLI_EXIT.usage,
          message:
            'Pass a feature flag key: `ttr external upskii admin flags set <key> --value <v> --yes --confirm <key>`.',
        });
      }
      if (!FLAG_KEY_PATTERN.test(flagKey)) {
        throw new CliError({
          code: 'INVALID_FLAG_KEY',
          exitCode: CLI_EXIT.usage,
          message: `Invalid feature flag key "${flagKey}".`,
        });
      }
      const rawValue = getFlag(flags, 'value');
      if (rawValue === undefined) {
        throw new CliError({
          code: 'MISSING_FLAG',
          exitCode: CLI_EXIT.usage,
          message: 'Missing required flag --value <v>.',
        });
      }
      const parsedValue = parseScalarFlagValue(rawValue);

      const gate = await requireMutationGate({
        explicitEnvFlag: options.explicitEnvFlag,
        flags,
        json,
        noColor,
        preview: {
          applyHint: `ttr external upskii admin flags set ${flagKey} --value ${JSON.stringify(rawValue)} --env ${env}${env === 'prod' ? ' --reason "<reason>"' : ''} --yes --confirm ${flagKey}`,
          changes: [{ after: parsedValue, field: flagKey }],
          confirmToken: flagKey,
          env,
          origin: adminOrigin,
          target: `admin-flag:${flagKey}`,
          tier: 2,
          title: 'Set Upskii admin feature flag',
        },
        write,
      });
      if (!gate.applied) return;

      const res = await client.requestJson<Record<string, unknown>>({
        body: { key: flagKey, value: parsedValue },
        command: 'external.upskii.admin.flags.set',
        method: 'PUT',
        origin: adminOrigin,
        path: `/api/admin/experimental-features/${encodeURIComponent(flagKey)}`,
        reason: gate.reason,
      });
      write(
        `${JSON.stringify({ applied: true, env, key: flagKey, status: res.status, value: parsedValue }, null, 2)}\n`
      );
      return;
    }

    throw new CliError({
      code: 'UNKNOWN_ADMIN_ACTION',
      exitCode: CLI_EXIT.usage,
      hint: 'Run `ttr external upskii admin --help`.',
      message: `Unknown admin flags action "${verb}".`,
    });
  }

  throw new CliError({
    code: 'UNKNOWN_ADMIN_ACTION',
    exitCode: CLI_EXIT.usage,
    hint: 'Run `ttr external upskii admin --help`.',
    message: `Unknown admin action "${action}".`,
  });
}
