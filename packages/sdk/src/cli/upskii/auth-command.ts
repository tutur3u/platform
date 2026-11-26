import { type FlagValue, getFlag, parseArgs } from '../args';
import {
  CLI_EXIT,
  CliError,
  type CredentialFamily,
  type CredentialStoreBackend,
} from '../cli-contracts';
import { type CliEnv, resolveUpskiiOrigins } from '../cli-env';
import { createCredentialStore, rejectSecretFlags } from '../credential-store';
import { requireMutationGate } from '../safety-gate';
import { formatTable } from '../ui/table';
import { createTheme } from '../ui/theme';

export interface UpskiiAuthCommandOptions {
  args: string[];
  credentialStore?: ReturnType<typeof createCredentialStore>;
  env: CliEnv;
  explicitEnvFlag: boolean;
  json: boolean;
  noColor?: boolean;
  readStdin?: () => Promise<string>;
  write?: (chunk: string) => void;
}

const MODE_TO_FAMILY: Record<string, CredentialFamily> = {
  admin: 'upskii-admin',
  qa: 'upskii-qa',
  user: 'upskii-user',
};

const DEFAULT_SCOPES_BY_MODE: Record<string, string[]> = {
  admin: ['upskii:admin:read'],
  qa: [
    'upskii:qa:create',
    'upskii:qa:list',
    'upskii:qa:seed',
    'upskii:qa:purge',
  ],
  user: [
    'upskii:profile:read',
    'upskii:classes:read',
    'upskii:lessons:read',
    'upskii:credits:read',
    'upskii:chat:read',
    'upskii:link:read',
  ],
};

async function readHiddenSecretFromTty(): Promise<string> {
  if (typeof process.stdin.setRawMode !== 'function') {
    throw new CliError({
      code: 'INTERACTIVE_ECHO_REFUSED',
      exitCode: CLI_EXIT.policy,
      hint: 'Pipe the token via stdin with --token-stdin so it is never echoed.',
      message:
        'Refusing interactive credential prompt without hidden TTY echo.',
    });
  }
  process.stderr.write('Enter credential (hidden): ');
  return new Promise<string>((resolvePromise, rejectPromise) => {
    let buffer = '';
    const wasRaw = process.stdin.isRaw;
    const cleanup = () => {
      process.stdin.off('data', onData);
      process.stdin.setRawMode(Boolean(wasRaw));
      process.stdin.pause();
    };
    const onData = (chunk: Buffer | string) => {
      const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      for (const ch of text) {
        if (ch === '\u0003') {
          cleanup();
          process.stderr.write('\n');
          rejectPromise(
            new CliError({
              code: 'ABORTED',
              exitCode: CLI_EXIT.usage,
              message: 'Credential entry cancelled.',
            })
          );
          return;
        }
        if (ch === '\r' || ch === '\n') {
          cleanup();
          process.stderr.write('\n');
          resolvePromise(buffer.trim());
          return;
        }
        if (ch === '\u007f' || ch === '\b') {
          buffer = buffer.slice(0, -1);
          continue;
        }
        buffer += ch;
      }
    };
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', onData);
  });
}

async function readSecretFromStdin(): Promise<string> {
  let value: string;
  if (process.stdin.isTTY) {
    value = await readHiddenSecretFromTty();
  } else {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    value = Buffer.concat(chunks).toString('utf8').trim();
  }
  if (!value) {
    throw new CliError({
      code: 'EMPTY_CREDENTIAL',
      exitCode: CLI_EXIT.usage,
      hint: 'Pipe the token via stdin, e.g. `printf "%s" "$TOKEN" | ttr external upskii auth login --mode qa --env staging --token-stdin --yes`.',
      message: 'No credential was supplied on stdin.',
    });
  }
  return value;
}

export function upskiiAuthHelp(): string {
  return [
    'ttr external upskii auth — manage scoped Upskii credentials per environment',
    '',
    'Usage:',
    '  ttr external upskii auth login --mode <qa|user|admin> [--env staging|prod|sandbox|local] [--profile default] [--token-stdin] [--store keychain|file]',
    '  ttr external upskii auth status [--env <env>] [--profile default] [--json]',
    '  ttr external upskii auth whoami [--env <env>] [--profile default] [--json]',
    '  ttr external upskii auth profiles [list|remove <profile>] [--mode <qa|user|admin>] [--env <env>]',
    '  ttr external upskii auth logout [--mode <qa|user|admin>] [--env <env>] [--profile default]',
    '',
    'Security:',
    '  Secrets are never accepted as CLI flags (--token/--password are refused).',
    '  Credentials are stored in the OS Keychain by default (or 0600 file with --store file).',
  ].join('\n');
}

function parseMode(flags: Record<string, FlagValue>): {
  family: CredentialFamily;
  mode: string;
} {
  const mode = (getFlag(flags, 'mode') ?? 'qa').toLowerCase();
  const family = MODE_TO_FAMILY[mode];
  if (!family) {
    throw new CliError({
      code: 'INVALID_AUTH_MODE',
      exitCode: CLI_EXIT.usage,
      message: `Invalid --mode "${mode}". Use qa, user, or admin.`,
    });
  }
  return { family, mode };
}

export async function runUpskiiAuthCommand(
  options: UpskiiAuthCommandOptions
): Promise<void> {
  const write =
    options.write ?? ((chunk: string) => process.stdout.write(chunk));
  const store = options.credentialStore ?? createCredentialStore();
  const { flags, positionals } = parseArgs(options.args);
  const [action, arg1] = positionals;

  if (!action || action === 'help' || flags.help === true || flags.h === true) {
    write(`${upskiiAuthHelp()}\n`);
    return;
  }

  rejectSecretFlags(flags);

  const profile = getFlag(flags, 'profile') ?? 'default';
  const origins = resolveUpskiiOrigins(options.env);
  const theme = createTheme({ noColor: options.noColor });

  if (action === 'login') {
    const { family, mode } = parseMode(flags);
    const requestedStore = getFlag(flags, 'store') as
      | CredentialStoreBackend
      | undefined;
    if (
      requestedStore &&
      !['keychain', 'secret-tool', 'dpapi', 'file'].includes(requestedStore)
    ) {
      throw new CliError({
        code: 'INVALID_CREDENTIAL_STORE',
        exitCode: CLI_EXIT.usage,
        message: 'Invalid --store. Use keychain, secret-tool, dpapi, or file.',
      });
    }
    const scopes =
      getFlag(flags, 'scopes')
        ?.split(',')
        .map((s) => s.trim())
        .filter(Boolean) ?? DEFAULT_SCOPES_BY_MODE[mode]!;

    const origin =
      mode === 'qa' || mode === 'admin' ? origins.admin : origins.app;
    const gate = await requireMutationGate({
      explicitEnvFlag: options.explicitEnvFlag,
      flags,
      json: options.json,
      noColor: options.noColor,
      preview: {
        applyHint: `printf "%s" "$TOKEN" | ttr external upskii auth login --mode ${mode} --env ${options.env} --profile ${profile}${requestedStore ? ` --store ${requestedStore}` : ''} --token-stdin --yes`,
        changes: [
          { after: family, field: 'family' },
          { after: profile, field: 'profile' },
          { after: requestedStore ?? 'auto-keychain', field: 'store' },
        ],
        env: options.env,
        origin,
        target: `credential:${family}/${options.env}/${profile}`,
        tier: 1,
        title: `Store Upskii ${mode} credential`,
      },
      qaVerified: true,
      write,
    });
    if (!gate.applied) return;

    const secret = await (options.readStdin ?? readSecretFromStdin)();
    const saved = await store.set({
      backend: requestedStore,
      env: options.env,
      expiresAt: getFlag(flags, 'expires-at') ?? null,
      family,
      origin,
      profile,
      scopes,
      secret,
    });

    if (options.json) {
      write(`${JSON.stringify({ ok: true, profile: saved }, null, 2)}\n`);
      return;
    }

    write(
      `${theme.ok('Stored')} Upskii ${mode} credential for ${theme.bold(options.env)} (${saved.profile}) in ${theme.cyan(saved.backend)}.\n`
    );
    return;
  }

  if (action === 'logout') {
    const { family, mode } = parseMode(flags);
    const gate = await requireMutationGate({
      explicitEnvFlag: options.explicitEnvFlag,
      flags,
      json: options.json,
      noColor: options.noColor,
      preview: {
        applyHint: `ttr external upskii auth logout --mode ${mode} --env ${options.env} --profile ${profile} --yes`,
        changes: [{ after: null, before: profile, field: 'credential' }],
        env: options.env,
        origin: mode === 'user' ? origins.app : origins.admin,
        target: `credential:${family}/${options.env}/${profile}`,
        tier: 1,
        title: `Remove Upskii ${mode} credential`,
      },
      qaVerified: true,
      write,
    });
    if (!gate.applied) return;
    const removed = await store.delete({ env: options.env, family, profile });
    if (options.json) {
      write(
        `${JSON.stringify({ env: options.env, family, profile, removed }, null, 2)}\n`
      );
      return;
    }
    write(
      removed
        ? `Removed Upskii ${mode} credential for ${options.env} (${profile}).\n`
        : `No stored Upskii ${mode} credential found for ${options.env} (${profile}).\n`
    );
    return;
  }

  if (action === 'status' || action === 'whoami') {
    const families: CredentialFamily[] = [
      'upskii-qa',
      'upskii-user',
      'upskii-admin',
    ];
    const entries = await Promise.all(
      families.map(async (family) => {
        const record = await store.get({ env: options.env, family, profile });
        return {
          backend: record?.backend ?? 'none',
          configured: Boolean(record),
          env: options.env,
          expiresAt: record?.expiresAt ?? null,
          family,
          origin:
            record?.origin ??
            (family === 'upskii-user' ? origins.app : origins.admin),
          profile,
          scopes: record?.scopes ?? [],
        };
      })
    );
    if (options.json) {
      write(
        `${JSON.stringify({ env: options.env, origins, profiles: entries }, null, 2)}\n`
      );
      return;
    }
    write(
      formatTable(
        entries.map((entry) => ({
          Backend: entry.backend,
          Env: entry.env,
          Family: entry.family,
          Origin: entry.origin,
          Status: entry.configured ? 'configured' : 'missing',
        })),
        { noColor: options.noColor }
      )
    );
    return;
  }

  if (action === 'profiles') {
    if (arg1 === 'remove') {
      const targetProfile = positionals[2];
      if (!targetProfile) {
        throw new CliError({
          code: 'MISSING_PROFILE',
          exitCode: CLI_EXIT.usage,
          message: 'Pass a profile name to remove.',
        });
      }
      const { family, mode } = parseMode(flags);
      const gate = await requireMutationGate({
        explicitEnvFlag: options.explicitEnvFlag,
        flags,
        json: options.json,
        noColor: options.noColor,
        preview: {
          applyHint: `ttr external upskii auth profiles remove ${targetProfile} --mode ${mode} --env ${options.env} --yes`,
          changes: [
            { after: null, before: targetProfile, field: 'credential' },
          ],
          env: options.env,
          origin: mode === 'user' ? origins.app : origins.admin,
          target: `credential:${family}/${options.env}/${targetProfile}`,
          tier: 1,
          title: `Remove Upskii ${mode} profile ${targetProfile}`,
        },
        qaVerified: true,
        write,
      });
      if (!gate.applied) return;
      const removed = await store.delete({
        env: options.env,
        family,
        profile: targetProfile,
      });
      write(
        options.json
          ? `${JSON.stringify({ family, profile: targetProfile, removed }, null, 2)}\n`
          : `${removed ? 'Removed' : 'Not found'}: ${family}/${options.env}/${targetProfile}\n`
      );
      return;
    }

    const list = (await store.list({ env: options.env })).filter((entry) =>
      entry.family.startsWith('upskii-')
    );
    if (options.json) {
      write(
        `${JSON.stringify({ env: options.env, profiles: list }, null, 2)}\n`
      );
      return;
    }
    write(
      formatTable(
        list.map((entry) => ({
          Backend: entry.backend,
          Env: entry.env,
          Expires: entry.expiresAt ?? '',
          Family: entry.family,
          Profile: entry.profile,
          Scopes: entry.scopes.join(', '),
        })),
        {
          emptyMessage: 'No stored Upskii credential profiles.',
          noColor: options.noColor,
        }
      )
    );
    return;
  }

  throw new CliError({
    code: 'UNKNOWN_AUTH_ACTION',
    exitCode: CLI_EXIT.usage,
    hint: 'Run `ttr external upskii auth --help` for supported actions.',
    message: `Unknown upskii auth action "${action}".`,
  });
}
