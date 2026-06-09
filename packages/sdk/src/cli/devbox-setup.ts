import { join } from 'node:path';
import {
  createLocalSupabaseEnv,
  DEFAULT_DEVBOX_REPOSITORY_URL,
  parseLocalSupabaseStatus,
  redactDevboxSupabaseEnv,
} from '@tuturuuu/devbox';
import type { TuturuuuUserClient } from '../platform';
import { type FlagValue, getFlag } from './args';
import {
  createDevboxDoctorReport,
  type DevboxDoctorReport,
} from './devbox-doctor';
import {
  type DevboxSetupConfirm,
  ensurePlatformCheckout,
  resolveDevboxCheckout,
} from './devbox-setup-checkout';
import {
  type DevboxSetupCommandRunner,
  defaultDevboxSetupRunCommand,
  formatDevboxSetupCommand,
} from './devbox-setup-command';
import {
  type DevboxSetupEnvTarget,
  writeLocalSupabaseEnvFiles,
} from './devbox-setup-env';
import {
  type DevboxRunnerSetupResult,
  type DevboxServiceManager,
  setupDevboxRunner,
} from './devbox-setup-service';

export interface DevboxSetupOptions {
  agent?: boolean;
  cloneInto?: string;
  client?: TuturuuuUserClient;
  confirm?: DevboxSetupConfirm;
  cwd?: string;
  dir?: string;
  doctorReport?: DevboxDoctorReport;
  env?: Record<string, string | undefined>;
  json?: boolean;
  runnerName?: string;
  runCommand?: DevboxSetupCommandRunner;
  service?: boolean;
  serviceManager?: DevboxServiceManager;
  serviceUser?: string;
  stdout?: (value: string) => void;
  tokenFile?: string;
  yes?: boolean;
}

export interface DevboxSetupReport extends DevboxDoctorReport {
  checkout: {
    path: string;
    repository: string;
    source: 'clone-into' | 'current' | 'default' | 'explicit';
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
  runner?: DevboxRunnerSetupResult;
  status: 'ok';
  supabase: {
    apiUrl: string;
    dbUrl: '[REDACTED]' | null;
    studioUrl: string | null;
  };
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
      report.runner
        ? `Runner: ${report.runner.runner.name} (${report.runner.runner.id}); token stored at ${report.runner.tokenFile}`
        : null,
      report.runner?.service
        ? `Runner service: ${report.runner.service.manager} installed at ${report.runner.service.definitionPath}`
        : null,
    ]
      .filter(Boolean)
      .join('\n')}\n`
  );
}

export async function runDevboxSetup(
  options: DevboxSetupOptions = {}
): Promise<DevboxSetupReport | DevboxDoctorReport> {
  const runCommand = options.runCommand ?? defaultDevboxSetupRunCommand;
  const stdout =
    options.stdout ?? ((value: string) => process.stdout.write(value));
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

  const checkout = await resolveDevboxCheckout({
    cloneInto: options.cloneInto,
    confirm: options.confirm,
    cwd: options.cwd,
    dir: options.dir,
    env: options.env ?? process.env,
    json: options.json,
    runCommand,
  });
  const checkoutDir = checkout.path;
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
  const runner = await setupDevboxRunner({
    checkoutDir,
    options: {
      ...options,
      runCommand,
    },
  });
  const report: DevboxSetupReport = {
    ...doctor,
    checkout: {
      path: checkoutDir,
      repository: DEFAULT_DEVBOX_REPOSITORY_URL,
      source: checkout.source,
      status: checkoutStatus,
    },
    commands,
    env: {
      targets: envTargets,
      values: redactDevboxSupabaseEnv(env),
    },
    ...(runner ? { runner } : {}),
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
  client,
  flags,
  json,
}: {
  client?: TuturuuuUserClient;
  flags: Record<string, FlagValue>;
  json: boolean;
}) {
  const serviceManager = getFlag(flags, 'service-manager');
  if (
    serviceManager &&
    !['auto', 'launchd', 'systemd'].includes(serviceManager)
  ) {
    throw new Error(
      'Invalid --service-manager value. Use auto, systemd, or launchd.'
    );
  }

  await runDevboxSetup({
    agent: flags.agent === true,
    client,
    cloneInto: getFlag(flags, 'clone-into'),
    dir: getFlag(flags, 'dir'),
    json,
    runnerName: getFlag(flags, 'runner-name'),
    service: flags.service === true,
    serviceManager: serviceManager as DevboxServiceManager | undefined,
    serviceUser: getFlag(flags, 'service-user'),
    tokenFile: getFlag(flags, 'token-file'),
    yes: flags.yes === true,
  });
}
