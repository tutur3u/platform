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
import { runUpskiiAuthCommand } from './auth-command';
import {
  runUpskiiClassesCommand,
  runUpskiiLessonsCommand,
} from './classes-lessons-command';
import {
  runUpskiiChatCommand,
  runUpskiiCreditsCommand,
  runUpskiiStatusCommand,
} from './chat-credits-status-command';
import { runUpskiiLinkCommand } from './link-command';
import {
  createUpskiiProductClient,
  readUpskiiCookieFromStorageState,
  type UpskiiExperience,
} from './product-client';
import { runUpskiiQaCommand } from './qa-command';

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
    'P1 Subfamilies (available now):',
    '  auth        manage scoped Upskii credentials in OS Keychain (qa, user, admin)',
    '  qa          provision QA seats, seed classes, export Playwright storageState, purge & sweep',
    '  classes     list, inspect, create, and join Upskii classes',
    '  lessons     list, create, seed (edufest-workshop|basic|qa-smoke), publish, and unpublish lessons',
    '  link        verify and manage Upskii <-> Tuturuuu (E3) account links',
    '  chat        list AI chat conversations/models and run bounded AI chat smokes',
    '  credits     inspect AI credit balances and assert smoke deltas',
    '  status      check Upskii host health, QA provisioner window, and E3 link readiness',
    '',
    'Planned P2 Subfamilies (scoped Upskii CLI auth):',
    '  workspaces, assessments, tutor, settings, accounts, admin',
    '',
    'Global flags:',
    '  --env <staging|prod|sandbox|local>  target environment (qa defaults to staging)',
    '  --session-file <path>               Playwright storageState JSON for product API calls',
    '  --experience <educator|learn>       Upskii workspace experience (default: educator)',
    '  --profile <name>                    keychain credential profile (default: default)',
    '  --json | --jsonl                    machine-readable output',
    '  --watch [seconds]                   poll live status/credits/link (10-3600s)',
    '  --no-color                          disable ANSI colors',
  ].join('\n');
}

const P2_PLANNED = new Set([
  'accounts',
  'admin',
  'assessments',
  'settings',
  'tutor',
  'workspaces',
]);

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
    const config = await (deps.readConfig ?? readCliConfig)().catch(
      () => undefined
    );
    const defaultEnv: CliEnv = subfamily === 'qa' ? 'staging' : 'staging';
    const env = resolveCliEnv({
      configuredEnv: (config as { defaultEnv?: CliEnv } | undefined)
        ?.defaultEnv,
      defaultEnv,
      env: deps.envVars,
      explicitFlag: explicitEnvFlag,
    });
    const profile = getFlag(flags, 'profile') ?? 'default';
    const subArgs = argv.slice(argv.indexOf(subfamily) + 1);
    const hasExplicitEnvFlag = Boolean(explicitEnvFlag?.trim());

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

    if (P2_PLANNED.has(subfamily)) {
      throw new CliError({
        code: 'UPSKII_P2_PENDING',
        exitCode: CLI_EXIT.usage,
        hint: 'This subfamily ships in Phase 2 once Upskii scoped CLI Bearer auth lands. Run `ttr external upskii --help`.',
        message: `\`ttr external upskii ${subfamily}\` is scheduled for Phase 2.`,
      });
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

    const origins = resolveUpskiiOrigins(env, deps.envVars);
    const tuturuuuOrigins = resolveTuturuuuOrigins(env, deps.envVars);
    const sessionFile = getFlag(flags, 'session-file');
    let auth: { bearerToken?: string; cookiePair?: string } | undefined;
    if (sessionFile) {
      auth = {
        cookiePair: await readUpskiiCookieFromStorageState(
          sessionFile,
          origins.app
        ),
      };
    } else if (subfamily !== 'status') {
      const storedUser = await store.get({
        env,
        family: 'upskii-user',
        profile,
      });
      if (storedUser?.secret) {
        auth = storedUser.secret.includes('upskii.session_token=')
          ? { cookiePair: storedUser.secret }
          : { bearerToken: storedUser.secret };
      }
    }

    const client = createUpskiiProductClient({
      auth,
      env,
      experience,
      fetch: deps.fetch,
      origins,
    });

    if (subfamily === 'classes') {
      await runUpskiiClassesCommand({
        args: subArgs,
        client,
        env,
        explicitEnvFlag: hasExplicitEnvFlag,
        json,
        noColor,
        write,
      });
      return;
    }

    if (subfamily === 'lessons') {
      await runUpskiiLessonsCommand({
        args: subArgs,
        client,
        env,
        explicitEnvFlag: hasExplicitEnvFlag,
        json,
        noColor,
        write,
      });
      return;
    }

    if (subfamily === 'link') {
      // M2 fix: only attach ttr login accessToken when its origin strictly matches target env web origin;
      // otherwise look up an env-scoped Tuturuuu credential from the credential store.
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
        args: subArgs,
        client,
        env,
        explicitEnvFlag: hasExplicitEnvFlag,
        fetch: deps.fetch,
        json,
        noColor,
        tuturuuuAccessToken,
        write,
      });
      return;
    }

    if (subfamily === 'chat') {
      await runUpskiiChatCommand({
        args: subArgs,
        client,
        env,
        explicitEnvFlag: hasExplicitEnvFlag,
        fetch: deps.fetch,
        json,
        noColor,
        write,
      });
      return;
    }

    if (subfamily === 'credits') {
      await runUpskiiCreditsCommand({
        args: subArgs,
        client,
        env,
        fetch: deps.fetch,
        json,
        noColor,
        write,
      });
      return;
    }

    if (subfamily === 'status') {
      await runUpskiiStatusCommand({
        args: subArgs,
        client,
        env,
        explicitEnvFlag: hasExplicitEnvFlag,
        fetch: deps.fetch,
        json,
        noColor,
        resolveQaToken: async () =>
          (await store.get({ env, family: 'upskii-qa', profile }))?.secret ??
          null,
        write,
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
