import { constants } from 'node:fs';
import { access, stat } from 'node:fs/promises';
import { delimiter, isAbsolute, join } from 'node:path';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { installedBuildIdentity } from './build-identity';
import { CLI_EXIT, CREDENTIAL_FAMILIES, CliError } from './cli-contracts';
import {
  CLI_ENVS,
  type CliEnv,
  resolveCliEnv,
  resolveTuturuuuOrigins,
  resolveUpskiiOrigins,
} from './cli-env';
import { withAbortSignal } from './cli-versions-download';
import { createCredentialStore, rejectSecretFlags } from './credential-store';

const PROBE_TIMEOUT_MS = 5_000;
const doctorFamily = z.enum(['all', 'upskii', 'infra', 'db', 'local']);
type Family = z.infer<typeof doctorFamily>;
type Check = {
  id: string;
  family: Exclude<Family, 'all'>;
  status: 'ok' | 'warn' | 'fail';
  summary: string;
  hint?: string;
};

export function doctorHelp() {
  return [
    'Usage: ttr doctor [--env prod|staging|sandbox|local]',
    '                  [--family all|upskii|infra|db|local] [--json] [--no-color] [--help]',
    'Check the installed CLI, credential profiles, and configured services.',
  ].join('\n');
}

async function supabaseAvailable(env: Record<string, string | undefined>) {
  const executable = process.platform === 'win32' ? 'supabase.exe' : 'supabase';
  const directories = (env.PATH ?? env.Path ?? '')
    .split(delimiter)
    .filter(isAbsolute);
  for (const directory of directories) {
    const path = join(directory, executable);
    const usable = await Promise.all([
      stat(path),
      access(path, constants.X_OK),
    ]).then(
      ([info]) => info.isFile(),
      () => false
    );
    if (usable) return true;
  }
  return false;
}

function cliCheck(): Check {
  try {
    const { version, channel, sourceSha } = installedBuildIdentity();
    return {
      id: 'cli',
      family: 'local',
      status: 'ok',
      summary: `ttr ${version} (${channel}, source ${sourceSha ?? 'unknown'}), Node ${process.versions.node}, Bun ${process.versions.bun ?? 'unavailable'}`,
    };
  } catch {
    return {
      id: 'cli',
      family: 'local',
      status: 'fail',
      summary: 'Unable to read the installed CLI build identity.',
      hint: 'Reinstall the CLI and retry.',
    };
  }
}

async function credentialChecks(
  store: ReturnType<typeof createCredentialStore>,
  env: CliEnv,
  family: Family
): Promise<Check[]> {
  try {
    const [backend, profiles] = await Promise.all([
      store.preferredBackend(),
      store.list({ env }),
    ]);
    const families = CREDENTIAL_FAMILIES.filter(
      (name) =>
        family === 'all' ||
        family === 'local' ||
        (family === 'upskii' ? name.startsWith('upskii-') : name === family)
    );
    const now = Date.now();
    return [
      {
        id: 'credentials',
        family: 'local',
        status: 'ok',
        summary: `Preferred backend: ${backend}.`,
      },
      ...families.map((name): Check => {
        const scoped = profiles.filter((profile) => profile.family === name);
        const expired = scoped.filter(
          (profile) => profile.expiresAt && Date.parse(profile.expiresAt) <= now
        ).length;
        return {
          id: `credentials.${name}`,
          family: 'local',
          status: expired ? 'warn' : 'ok',
          summary: `${scoped.length} ${name} profile(s) in ${env}, ${expired} expired.`,
          ...(expired
            ? { hint: 'Refresh expired credentials before use.' }
            : {}),
        };
      }),
    ];
  } catch {
    return [
      {
        id: 'credentials',
        family: 'local',
        status: 'warn',
        summary: 'Unable to inspect the credential store.',
        hint: 'Check the credential store configuration and permissions.',
      },
    ];
  }
}

async function upskiiCredential(
  store: ReturnType<typeof createCredentialStore>,
  env: CliEnv
): Promise<Check> {
  const check = { id: 'upskii.qa-token', family: 'upskii' as const };
  try {
    const record = await store.get({ family: 'upskii-qa', env });
    if (!record) {
      return {
        ...check,
        status: 'warn',
        summary: 'Upskii QA credential is missing.',
        hint: `Configure TTR_UPSKII_QA_TOKEN_${env.toUpperCase()} or the default Upskii QA profile.`,
      };
    }
    if (record.expiresAt && Date.parse(record.expiresAt) <= Date.now()) {
      return {
        ...check,
        status: 'warn',
        summary: 'Upskii QA credential is expired.',
      };
    }
    return {
      ...check,
      status: 'ok',
      summary: 'Upskii QA credential is present.',
    };
  } catch {
    return {
      ...check,
      status: 'warn',
      summary: 'Unable to inspect the Upskii QA credential.',
    };
  }
}

async function originCheck(
  family: 'upskii' | 'infra',
  name: string,
  origin: string,
  fetch: typeof globalThis.fetch
): Promise<Check> {
  const check = { id: `${family}.${name}`, family };
  try {
    const signal = AbortSignal.timeout(PROBE_TIMEOUT_MS);
    const response = await withAbortSignal(
      fetch(origin, { method: 'HEAD', redirect: 'manual', signal }),
      signal
    );
    if (response.status >= 200 && response.status < 500) {
      return {
        ...check,
        status: 'ok',
        summary: `${name} is reachable (HTTP ${response.status}).`,
      };
    }
    return {
      ...check,
      status: 'fail',
      summary: `${name} returned HTTP ${response.status}.`,
    };
  } catch {
    return {
      ...check,
      status: 'fail',
      summary: `Unable to reach ${name}.`,
      hint: 'Check network connectivity and try again.',
    };
  }
}

async function originChecks(
  family: 'upskii' | 'infra',
  resolveOrigins: () => Record<string, string>,
  fetch: typeof globalThis.fetch
): Promise<Check[]> {
  let origins: Record<string, string>;
  try {
    origins = resolveOrigins();
  } catch {
    return [
      {
        id: `${family}.origins`,
        family,
        status: 'fail',
        summary: 'The origin configuration is invalid.',
        hint: 'Local origins must use a loopback or .localhost address.',
      },
    ];
  }
  return Promise.all(
    Object.entries(origins).map(([name, origin]) =>
      originCheck(family, name, origin, fetch)
    )
  );
}

async function databaseChecks(
  env: Record<string, string | undefined>
): Promise<Check[]> {
  const binary = await supabaseAvailable(env);
  const configured = Boolean(
    env.SUPABASE_URL?.trim() || env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  );
  return [
    {
      id: 'db.supabase',
      family: 'db',
      status: binary ? 'ok' : 'warn',
      summary: binary
        ? 'Supabase CLI is available.'
        : 'Supabase CLI is unavailable.',
    },
    {
      id: 'db.environment',
      family: 'db',
      status: configured ? 'ok' : 'warn',
      summary: configured
        ? 'Supabase URL is configured.'
        : 'Supabase URL is unset.',
    },
  ];
}

function parseDoctorArgs(
  argv: string[],
  env: Record<string, string | undefined>
) {
  rejectSecretFlags(
    Object.fromEntries(
      argv
        .filter((arg) => arg.startsWith('--'))
        .map((arg) => [arg.split('=', 1)[0], true])
    )
  );
  try {
    const { values } = parseArgs({
      args: argv,
      options: {
        env: { type: 'string' },
        family: { type: 'string' },
        help: { type: 'boolean', short: 'h' },
        json: { type: 'boolean' },
        'no-color': { type: 'boolean' },
      },
    });
    return {
      ...values,
      env: values.help
        ? undefined
        : z
            .enum(CLI_ENVS)
            .parse(resolveCliEnv({ explicitFlag: values.env, env })),
      family: values.help
        ? ('all' as const)
        : doctorFamily.parse(values.family ?? 'all'),
    };
  } catch {
    throw new CliError({
      code: 'INVALID_DOCTOR_OPTIONS',
      message: 'Invalid doctor options.',
      hint: doctorHelp(),
    });
  }
}

export async function runDoctorCommand(
  argv: string[],
  deps: {
    fetch?: typeof globalThis.fetch;
    env?: Record<string, string | undefined>;
    homeDir?: string;
    write?: (chunk: string) => void;
    credentialStore?: ReturnType<typeof createCredentialStore>;
  } = {}
): Promise<void> {
  const env = deps.env ?? process.env;
  const flags = parseDoctorArgs(argv, env);
  const write = deps.write ?? ((chunk: string) => process.stdout.write(chunk));
  if (!flags.env) {
    write(`${doctorHelp()}\n`);
    process.exitCode = CLI_EXIT.ok;
    return;
  }

  const target = flags.env;
  const store =
    deps.credentialStore ??
    createCredentialStore({ env, homeDir: deps.homeDir });
  const fetch = deps.fetch ?? globalThis.fetch;
  const wants = (family: Family) =>
    flags.family === 'all' || flags.family === family;
  const groups = [credentialChecks(store, target, flags.family)];
  if (wants('upskii')) {
    groups.push(
      originChecks(
        'upskii',
        () => ({ ...resolveUpskiiOrigins(target, env) }),
        fetch
      ),
      upskiiCredential(store, target).then((check) => [check])
    );
  }
  if (wants('infra')) {
    groups.push(
      originChecks(
        'infra',
        () => {
          const { web, admin } = resolveTuturuuuOrigins(target, env);
          return { web, admin };
        },
        fetch
      )
    );
  }
  if (wants('db')) groups.push(databaseChecks(env));

  const checks = [cliCheck(), ...(await Promise.all(groups)).flat()];
  const ok = !checks.some((check) => check.status === 'fail');
  if (flags.json) {
    write(
      `${JSON.stringify({ ok, env: target, checkedAt: new Date().toISOString(), checks })}\n`
    );
  } else {
    const width = Math.max(...checks.map((check) => check.id.length));
    write(
      `ttr doctor [ENV: ${target.toUpperCase()}]\n${checks
        .map(
          ({ status, id, summary, hint }) =>
            `${status.toUpperCase().padEnd(4)}  ${id.padEnd(width)}  ${summary}${hint ? ` ${hint}` : ''}`
        )
        .join('\n')}\n`
    );
  }
  process.exitCode = ok ? CLI_EXIT.ok : CLI_EXIT.unavailable;
}
