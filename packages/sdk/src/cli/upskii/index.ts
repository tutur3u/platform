import { getFlag, parseArgs } from '../args';
import { CLI_EXIT, CliError } from '../cli-contracts';
import {
  type CliEnv,
  resolveCliEnv,
  resolveTuturuuuOrigins,
  resolveUpskiiOrigins,
} from '../cli-env';
import { readCliConfig } from '../config';
import { createCredentialStore, rejectSecretFlags } from '../credential-store';
import { emitCliError } from '../ui/errors';
import {
  runUpskiiAccountsCommand,
  runUpskiiAdminCommand,
} from './accounts-admin-command';
import {
  runUpskiiAssessmentsCommand,
  runUpskiiTutorCommand,
} from './assessments-tutor-command';
import { runUpskiiAuthCommand } from './auth-command';
import {
  runUpskiiChatCommand,
  runUpskiiCreditsCommand,
  runUpskiiStatusCommand,
} from './chat-credits-status-command';
import {
  runUpskiiClassesCommand,
  runUpskiiLessonsCommand,
} from './classes-lessons-command';
import { runUpskiiLinkCommand } from './link-command';
import {
  createUpskiiProductClient,
  readUpskiiCookieFromStorageState,
  type UpskiiAuthMaterial,
  type UpskiiExperience,
  type UpskiiProductClient,
} from './product-client';
import { runUpskiiQaCommand } from './qa-command';
import {
  runUpskiiSettingsCommand,
  runUpskiiWorkspacesCommand,
} from './workspaces-settings-command';

export interface RunUpskiiCommandDeps {
  credentialStore?: ReturnType<typeof createCredentialStore>;
  envVars?: Record<string, string | undefined>;
  fetch?: typeof globalThis.fetch;
  readConfig?: typeof readCliConfig;
  readStdin?: () => Promise<string>;
  write?: (chunk: string) => void;
  writeErr?: (chunk: string) => void;
}

export function upskiiHelp(): string {
  return [
    'ttr external upskii — Upskii control plane & QA automation',
    '',
    'Usage: ttr external upskii <subfamily> <action> [options]',
    '',
    'Subfamilies:',
    '  auth         manage scoped Upskii credentials in OS Keychain (qa, user, admin)',
    '  qa           provision QA seats, seed classes, export Playwright storageState, purge & sweep',
    '  workspaces   list, inspect, view members, and switch Upskii workspaces',
    '  classes      list, inspect, create, and join Upskii classes',
    '  lessons      list, create, seed (edufest-workshop|basic|qa-smoke), publish, and unpublish lessons',
    '  assessments  list, inspect, view submissions, create, and publish assessments',
    '  tutor        list tutor sessions/prompts, inspect sessions, and run bounded tutor smokes',
    '  chat         list AI chat conversations/models and run bounded AI chat smokes',
    '  credits      inspect AI credit balances and assert smoke deltas',
    '  settings     read and update Upskii account settings and display preferences',
    '  accounts     inspect account profile, sessions, usage, and revoke sessions',
    '  admin        admin overview, user lookup, and feature flags (requires upskii-admin credential)',
    '  link         verify and manage Upskii <-> Tuturuuu (E3) account links',
    '  status       check Upskii host health, QA provisioner window, and E3 link readiness',
    '',
    'Global flags:',
    '  --env <staging|prod|sandbox|local>  target environment (defaults to staging)',
    '  --session-file <path>               Playwright storageState JSON for user API calls',
    '  --experience <educator|learn>       Upskii workspace experience (default: educator)',
    '  --profile <name>                    keychain credential profile (default: default)',
    '  --json | --jsonl                    machine-readable output',
    '  --watch [seconds]                   poll live status/credits/link (10-3600s)',
    '  --no-color                          disable ANSI colors',
  ].join('\n');
}

function assertNotUpskiiRefreshToken(rawValue: string): void {
  const normalized = rawValue
    .trim()
    .replace(/^Bearer\s+/iu, '')
    .trim();
  if (normalized.startsWith('upskii_cli_r_')) {
    throw new CliError({
      code: 'UPSKII_REFRESH_TOKEN_NOT_ACCESS',
      exitCode: CLI_EXIT.auth,
      hint: 'Store an Upskii CLI access token (`upskii_cli_a_*`) instead of a refresh token.',
      message:
        'Upskii CLI refresh tokens (`upskii_cli_r_*`) cannot be used as API access credentials.',
    });
  }
}

function assertCookiePairNotRefreshToken(cookiePair: string): void {
  for (const part of cookiePair.split(';')) {
    const eqIdx = part.indexOf('=');
    const cookieVal = eqIdx >= 0 ? part.slice(eqIdx + 1).trim() : part.trim();
    if (cookieVal) assertNotUpskiiRefreshToken(cookieVal);
  }
}

function resolveStoredUpskiiAuth(
  secret: string,
  family: 'upskii-user' | 'upskii-admin'
): UpskiiAuthMaterial {
  const trimmed = secret.trim();
  const normalizedToken = trimmed.replace(/^Bearer\s+/iu, '').trim();
  assertNotUpskiiRefreshToken(normalizedToken);

  if (normalizedToken.startsWith('upskii_cli_')) {
    return { bearerToken: normalizedToken };
  }

  if (trimmed.includes('upskii.session_token=')) {
    assertCookiePairNotRefreshToken(trimmed);
    if (family === 'upskii-admin') {
      throw new CliError({
        code: 'UPSKII_ADMIN_USER_COOKIE_REFUSED',
        exitCode: CLI_EXIT.policy,
        hint: 'Store an Upskii admin Bearer token (`upskii_cli_a_*` or service session) under `--mode admin`.',
        message:
          'Upskii admin commands require a dedicated Bearer credential and refuse user session cookies.',
      });
    }
    return { cookiePair: trimmed };
  }

  return { bearerToken: normalizedToken };
}

function isHelpRequest(args: string[]): boolean {
  const parsed = parseArgs(args);
  return (
    parsed.positionals[0] === 'help' ||
    parsed.flags.help === true ||
    parsed.flags.h === true
  );
}

type StandardProductHandler = (options: {
  args: string[];
  client: UpskiiProductClient;
  env: CliEnv;
  explicitEnvFlag?: boolean;
  json: boolean;
  noColor?: boolean;
  write?: (chunk: string) => void;
}) => Promise<void>;

const PRODUCT_HANDLERS: Record<string, StandardProductHandler> = {
  accounts: runUpskiiAccountsCommand,
  assessments: runUpskiiAssessmentsCommand,
  classes: runUpskiiClassesCommand,
  lessons: runUpskiiLessonsCommand,
  settings: runUpskiiSettingsCommand,
  tutor: runUpskiiTutorCommand,
  workspaces: runUpskiiWorkspacesCommand,
};

export async function runUpskiiCommand(
  argv: string[],
  deps: RunUpskiiCommandDeps = {}
): Promise<void> {
  const write = deps.write ?? ((chunk: string) => process.stdout.write(chunk));
  const { flags, positionals } = parseArgs(argv);
  const json = flags.json === true || flags.jsonl === true;
  const noColor = flags['no-color'] === true;
  const [subfamily] = positionals;

  if (
    !subfamily ||
    subfamily === 'help' ||
    (positionals.length === 0 && (flags.help === true || flags.h === true))
  ) {
    write(`${upskiiHelp()}\n`);
    return;
  }

  try {
    rejectSecretFlags(flags);

    const store =
      deps.credentialStore ?? createCredentialStore({ env: deps.envVars });
    const explicitEnvFlag = getFlag(flags, 'env');
    const hasExplicitEnvFlag = Boolean(explicitEnvFlag?.trim());
    const needsCliConfig = !hasExplicitEnvFlag || subfamily === 'link';
    const config = needsCliConfig
      ? await (deps.readConfig ?? readCliConfig)().catch(() => undefined)
      : undefined;
    const env = resolveCliEnv({
      configuredEnv: (config as { defaultEnv?: CliEnv } | undefined)
        ?.defaultEnv,
      defaultEnv: 'staging',
      env: deps.envVars,
      explicitFlag: explicitEnvFlag,
    });
    const profile = getFlag(flags, 'profile') ?? 'default';
    const subArgs = argv.slice(argv.indexOf(subfamily) + 1);

    if (subfamily === 'auth') {
      await runUpskiiAuthCommand({
        args: subArgs,
        credentialStore: store,
        env,
        explicitEnvFlag: hasExplicitEnvFlag,
        json,
        noColor,
        readStdin: deps.readStdin,
        write,
      });
      return;
    }

    const resolveQaToken = async () => {
      const record = await store.get({ env, family: 'upskii-qa', profile });
      if (!record?.secret) {
        throw new CliError({
          code: 'UPSKII_QA_AUTH_REQUIRED',
          exitCode: CLI_EXIT.auth,
          hint: `Store a QA provisioner token with \`ttr external upskii auth login --mode qa --env ${env} --token-stdin --yes\` or set TTR_UPSKII_QA_TOKEN_${env.toUpperCase()}.`,
          message: `No Upskii QA provisioner credential found for environment "${env}".`,
        });
      }
      return record.secret;
    };

    if (subfamily === 'qa') {
      await runUpskiiQaCommand({
        args: subArgs,
        env,
        explicitEnvFlag: hasExplicitEnvFlag,
        fetch: deps.fetch,
        json,
        noColor,
        resolveQaToken,
        write,
      });
      return;
    }

    const origins = resolveUpskiiOrigins(env, deps.envVars);
    const sessionFile = getFlag(flags, 'session-file');

    if (subfamily === 'admin') {
      if (isHelpRequest(subArgs)) {
        await runUpskiiAdminCommand({
          args: subArgs,
          env,
          explicitEnvFlag: hasExplicitEnvFlag,
          json,
          noColor,
          write,
        });
        return;
      }
      if (env === 'prod' && !hasExplicitEnvFlag) {
        throw new CliError({
          code: 'PROD_ENV_EXPLICIT_REQUIRED',
          exitCode: CLI_EXIT.policy,
          hint: 'Pass --env prod explicitly to run Upskii admin commands against production.',
          message:
            'Refusing Upskii admin command against prod without explicit --env prod.',
        });
      }
      if (sessionFile) {
        throw new CliError({
          code: 'UPSKII_ADMIN_SESSION_FILE_UNSUPPORTED',
          exitCode: CLI_EXIT.policy,
          hint: `Use a dedicated upskii-admin credential via \`ttr external upskii auth login --mode admin --env ${env} --token-stdin --yes\`.`,
          message:
            'Upskii admin commands require a dedicated upskii-admin credential and cannot use --session-file user cookies.',
        });
      }
      const storedAdmin = await store.get({
        env,
        family: 'upskii-admin',
        profile,
      });
      if (!storedAdmin?.secret) {
        await runUpskiiAdminCommand({
          args: subArgs,
          env,
          explicitEnvFlag: hasExplicitEnvFlag,
          hasAdminCredential: false,
          json,
          noColor,
          write,
        });
        return;
      }
      const adminClient = createUpskiiProductClient({
        auth: resolveStoredUpskiiAuth(storedAdmin.secret, 'upskii-admin'),
        env,
        envVars: deps.envVars,
        fetch: deps.fetch,
        origins: { ...origins, app: origins.admin },
      });
      await runUpskiiAdminCommand({
        args: subArgs,
        client: adminClient,
        env,
        explicitEnvFlag: hasExplicitEnvFlag,
        hasAdminCredential: true,
        json,
        noColor,
        write,
      });
      return;
    }

    const experienceRaw = (
      getFlag(flags, 'experience') ?? 'educator'
    ).toLowerCase();
    if (experienceRaw !== 'educator' && experienceRaw !== 'learn') {
      throw new CliError({
        code: 'INVALID_EXPERIENCE',
        exitCode: CLI_EXIT.usage,
        message: 'Invalid --experience. Use educator or learn.',
      });
    }
    const experience = experienceRaw as UpskiiExperience;

    const tuturuuuOrigins = resolveTuturuuuOrigins(env, deps.envVars);
    let auth: UpskiiAuthMaterial | undefined;
    if (sessionFile) {
      const cookiePair = await readUpskiiCookieFromStorageState(
        sessionFile,
        origins.app
      );
      assertCookiePairNotRefreshToken(cookiePair);
      auth = { cookiePair };
    } else if (subfamily !== 'status') {
      const storedUser = await store.get({
        env,
        family: 'upskii-user',
        profile,
      });
      if (storedUser?.secret) {
        auth = resolveStoredUpskiiAuth(storedUser.secret, 'upskii-user');
      }
    }

    const client = createUpskiiProductClient({
      auth,
      env,
      envVars: deps.envVars,
      experience,
      fetch: deps.fetch,
      origins,
    });
    const shared = {
      args: subArgs,
      client,
      env,
      explicitEnvFlag: hasExplicitEnvFlag,
      json,
      noColor,
      write,
    };

    const standardHandler = PRODUCT_HANDLERS[subfamily];
    if (standardHandler) {
      await standardHandler(shared);
      return;
    }

    if (subfamily === 'link') {
      let tuturuuuAccessToken: string | undefined;
      if (config?.session?.accessToken && config.baseUrl) {
        try {
          if (new URL(config.baseUrl).origin === tuturuuuOrigins.web) {
            tuturuuuAccessToken = config.session.accessToken;
          }
        } catch {
          // Ignore malformed saved baseUrl
        }
      }
      if (!tuturuuuAccessToken) {
        const storedTuturuuu = await store.get({
          env,
          family: 'tuturuuu',
          profile,
        });
        tuturuuuAccessToken = storedTuturuuu?.secret;
      }
      await runUpskiiLinkCommand({
        ...shared,
        fetch: deps.fetch,
        tuturuuuAccessToken,
      });
      return;
    }

    if (subfamily === 'chat') {
      await runUpskiiChatCommand({ ...shared, fetch: deps.fetch });
      return;
    }

    if (subfamily === 'credits') {
      await runUpskiiCreditsCommand({ ...shared, fetch: deps.fetch });
      return;
    }

    if (subfamily === 'status') {
      await runUpskiiStatusCommand({
        ...shared,
        fetch: deps.fetch,
        resolveQaToken: async () =>
          (await store.get({ env, family: 'upskii-qa', profile }))?.secret ??
          null,
      });
      return;
    }

    throw new CliError({
      code: 'UNKNOWN_UPSKII_SUBFAMILY',
      exitCode: CLI_EXIT.usage,
      hint: 'Run `ttr external upskii --help`.',
      message: `Unknown upskii subfamily "${subfamily}".`,
    });
  } catch (error) {
    process.exitCode = emitCliError(error, {
      json,
      noColor,
      writeErr: deps.writeErr,
    });
  }
}
