import { mkdir, readdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import {
  createLocalSupabaseEnv,
  DEFAULT_DEVBOX_REPOSITORY_URL,
  getDefaultDevboxCheckoutPath,
  isTuturuuuPlatformRepositoryUrl,
  parseLocalSupabaseStatus,
  redactDevboxSupabaseEnv,
} from '@tuturuuu/devbox';
import { type FlagValue, getFlag } from './args';
import {
  createDevboxDoctorReport,
  type DevboxDoctorReport,
} from './devbox-doctor';
import {
  type DevboxSetupCommandRunner,
  defaultDevboxSetupRunCommand,
  formatDevboxSetupCommand,
} from './devbox-setup-command';
import {
  type DevboxSetupEnvTarget,
  writeLocalSupabaseEnvFiles,
} from './devbox-setup-env';

export interface DevboxSetupOptions {
  dir?: string;
  doctorReport?: DevboxDoctorReport;
  json?: boolean;
  runCommand?: DevboxSetupCommandRunner;
  stdout?: (value: string) => void;
  yes?: boolean;
}

export interface DevboxSetupReport extends DevboxDoctorReport {
  checkout: {
    path: string;
    repository: string;
    status: 'cloned' | 'reused';
  };
  commands: {
    command: string;
    cwd: string;
    name: string;
    status: 'succeeded';
  }[];
  env: {
    targets: DevboxSetupEnvTarget[];
    values: ReturnType<typeof redactDevboxSupabaseEnv>;
  };
  status: 'ok';
  supabase: {
    apiUrl: string;
    dbUrl: '[REDACTED]' | null;
    studioUrl: string | null;
  };
}

function expandHomePath(value: string) {
  if (value === '~') return homedir();
  if (value.startsWith('~/')) return join(homedir(), value.slice(2));
  return value;
}

async function runRequiredCommand({
  args,
  capture,
  command,
  cwd,
  json,
  name,
  redactOutput,
  runCommand,
}: {
  args: string[];
  capture?: boolean;
  command: string;
  cwd?: string;
  json?: boolean;
  name: string;
  redactOutput?: boolean;
  runCommand: DevboxSetupCommandRunner;
}) {
  const result = await runCommand(command, args, {
    capture,
    cwd,
    json,
    redactOutput,
  });
  if (result.code !== 0) {
    throw new Error(
      `${name} failed with exit code ${result.code}: ${formatDevboxSetupCommand(
        command,
        args
      )}`
    );
  }
  return result;
}

async function pathExists(pathname: string) {
  try {
    await stat(pathname);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

async function isEmptyDirectory(pathname: string) {
  try {
    return (await readdir(pathname)).length === 0;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

async function ensurePlatformCheckout({
  checkoutDir,
  json,
  runCommand,
}: {
  checkoutDir: string;
  json?: boolean;
  runCommand: DevboxSetupCommandRunner;
}) {
  const exists = await pathExists(checkoutDir);
  const canClone = !exists || (await isEmptyDirectory(checkoutDir));

  if (canClone) {
    await mkdir(dirname(checkoutDir), { recursive: true });
    await runRequiredCommand({
      args: ['clone', DEFAULT_DEVBOX_REPOSITORY_URL, checkoutDir],
      command: 'git',
      json,
      name: 'Clone Tuturuuu platform',
      runCommand,
    });
    return 'cloned' as const;
  }

  const remoteResult = await runCommand(
    'git',
    ['-C', checkoutDir, 'config', '--get', 'remote.origin.url'],
    { capture: true, json }
  );

  if (
    remoteResult.code !== 0 ||
    !isTuturuuuPlatformRepositoryUrl(remoteResult.stdout)
  ) {
    throw new Error(
      `Refusing to use ${checkoutDir}. It must be empty, missing, or a clone of ${DEFAULT_DEVBOX_REPOSITORY_URL}.`
    );
  }

  return 'reused' as const;
}

function printJson(value: unknown, stdout: (value: string) => void) {
  stdout(`${JSON.stringify(value, null, 2)}\n`);
}

function printMissingToolReport(
  report: DevboxDoctorReport,
  stdout: (value: string) => void
) {
  stdout(
    `${[
      'Devbox setup needs prerequisites',
      `Missing: ${report.missingTools.join(', ') || 'none'}`,
      `Package manager: ${report.packageManager ?? 'not detected'}`,
      ...report.setupCommands.map((command) => `  ${command.join(' ')}`),
      'Re-run with --yes to install detected prerequisites automatically.',
    ].join('\n')}\n`
  );
}

function printSetupReport(
  report: DevboxSetupReport,
  stdout: (value: string) => void
) {
  const changedTargets = report.env.targets.filter(
    (target) => target.status !== 'unchanged'
  );

  stdout(
    `${[
      'Devbox setup complete',
      `Checkout: ${report.checkout.path} (${report.checkout.status})`,
      ...report.commands.map((command) => `${command.name}: ${command.status}`),
      `Supabase API: ${report.supabase.apiUrl}`,
      `Supabase Studio: ${report.supabase.studioUrl ?? 'unavailable'}`,
      `Supabase DB: ${report.supabase.dbUrl ? 'available' : 'unavailable'}`,
      `Env files: ${report.env.targets.length} target(s), ${changedTargets.length} changed; values redacted`,
    ].join('\n')}\n`
  );
}

export async function runDevboxSetup(
  options: DevboxSetupOptions = {}
): Promise<DevboxSetupReport | DevboxDoctorReport> {
  const runCommand = options.runCommand ?? defaultDevboxSetupRunCommand;
  const stdout =
    options.stdout ?? ((value: string) => process.stdout.write(value));
  const checkoutDir = resolve(
    expandHomePath(options.dir?.trim() || getDefaultDevboxCheckoutPath())
  );
  let doctor = options.doctorReport ?? (await createDevboxDoctorReport());

  if (doctor.missingTools.length > 0) {
    if (!options.yes) {
      if (options.json) printJson(doctor, stdout);
      else printMissingToolReport(doctor, stdout);
      process.exitCode = 1;
      return doctor;
    }

    if (doctor.setupCommands.length === 0) {
      throw new Error(
        'Missing devbox prerequisites, and no supported package manager was detected.'
      );
    }

    for (const command of doctor.setupCommands) {
      await runRequiredCommand({
        args: command.slice(1),
        command: command[0]!,
        json: options.json,
        name: 'Install devbox prerequisite',
        runCommand,
      });
    }
    doctor = await createDevboxDoctorReport();
    if (doctor.missingTools.length > 0) {
      throw new Error(
        `Still missing devbox prerequisites after installation: ${doctor.missingTools.join(
          ', '
        )}`
      );
    }
  }

  const commands: DevboxSetupReport['commands'] = [];
  const checkoutStatus = await ensurePlatformCheckout({
    checkoutDir,
    json: options.json,
    runCommand,
  });

  await runRequiredCommand({
    args: ['install', '--frozen-lockfile'],
    command: 'bun',
    cwd: checkoutDir,
    json: options.json,
    name: 'Install dependencies',
    runCommand,
  });
  commands.push({
    command: 'bun install --frozen-lockfile',
    cwd: checkoutDir,
    name: 'Dependencies',
    status: 'succeeded',
  });

  await runRequiredCommand({
    args: ['sb:start'],
    command: 'bun',
    cwd: checkoutDir,
    json: options.json,
    name: 'Start local Supabase',
    redactOutput: true,
    runCommand,
  });
  commands.push({
    command: 'bun sb:start',
    cwd: checkoutDir,
    name: 'Supabase start',
    status: 'succeeded',
  });

  const statusResult = await runRequiredCommand({
    args: ['supabase', 'status', '-o', 'json'],
    capture: true,
    command: 'bun',
    cwd: join(checkoutDir, 'apps/database'),
    json: options.json,
    name: 'Read local Supabase status',
    runCommand,
  });
  const supabaseStatus = parseLocalSupabaseStatus(statusResult.stdout);
  const env = createLocalSupabaseEnv(supabaseStatus);
  const envTargets = await writeLocalSupabaseEnvFiles({
    checkoutDir,
    env,
  });
  const report: DevboxSetupReport = {
    ...doctor,
    checkout: {
      path: checkoutDir,
      repository: DEFAULT_DEVBOX_REPOSITORY_URL,
      status: checkoutStatus,
    },
    commands,
    env: {
      targets: envTargets,
      values: redactDevboxSupabaseEnv(env),
    },
    status: 'ok',
    supabase: {
      apiUrl: supabaseStatus.apiUrl,
      dbUrl: supabaseStatus.dbUrl ? '[REDACTED]' : null,
      studioUrl: supabaseStatus.studioUrl ?? null,
    },
  };

  if (options.json) printJson(report, stdout);
  else printSetupReport(report, stdout);

  return report;
}

export async function runDevboxSetupCommand({
  flags,
  json,
}: {
  flags: Record<string, FlagValue>;
  json: boolean;
}) {
  await runDevboxSetup({
    dir: getFlag(flags, 'dir'),
    json,
    yes: flags.yes === true,
  });
}
