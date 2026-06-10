import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { type FlagValue, getFlag } from './args';
import {
  type DevboxCheckoutSelection,
  resolveExistingDevboxCheckout,
} from './devbox-setup-checkout';
import {
  type DevboxSetupCommandRunner,
  defaultDevboxSetupRunCommand,
} from './devbox-setup-command';
import {
  type DevboxServiceManager,
  getDefaultRunnerTokenFile,
  getDefaultRunnerWrapperFile,
  installDevboxRunnerService,
  resolveDevboxServiceManager,
  restartDevboxRunnerService,
} from './devbox-setup-service';
import { getServiceDefinitionPath } from './devbox-setup-service-templates';

export interface DevboxRepairOptions {
  cwd?: string;
  dir?: string;
  dryRun?: boolean;
  json?: boolean;
  noRestart?: boolean;
  runCommand?: DevboxSetupCommandRunner;
  serviceManager?: DevboxServiceManager;
  serviceUser?: string;
  stdout?: (value: string) => void;
  tokenFile?: string;
}

export interface DevboxRepairReport {
  checkout: DevboxCheckoutSelection & {
    status: 'reused';
  };
  service: {
    definitionPath: string;
    dryRun: boolean;
    manager: Exclude<DevboxServiceManager, 'auto'>;
    restarted: boolean;
    wrapperPath: string;
  };
  status: 'ok';
  tokenFile: {
    path: string;
    status: 'found';
  };
}

function printJson(value: unknown, stdout: (value: string) => void) {
  stdout(`${JSON.stringify(value, null, 2)}\n`);
}

function printRepairReport(
  report: DevboxRepairReport,
  stdout: (value: string) => void
) {
  stdout(
    `${[
      report.service.dryRun ? 'Devbox repair plan' : 'Devbox repair complete',
      `Checkout: ${report.checkout.path} (${report.checkout.source})`,
      `Token file: ${report.tokenFile.path} (${report.tokenFile.status})`,
      `Runner wrapper: ${report.service.wrapperPath}`,
      `Runner service: ${report.service.manager} at ${report.service.definitionPath}`,
      `Service restart: ${
        report.service.dryRun
          ? 'dry-run'
          : report.service.restarted
            ? 'succeeded'
            : 'skipped'
      }`,
    ].join('\n')}\n`
  );
}

function assertSupportedServiceManager(value: string | undefined) {
  if (value && !['auto', 'launchd', 'systemd'].includes(value)) {
    throw new Error(
      'Invalid --service-manager value. Use auto, systemd, or launchd.'
    );
  }

  return value as DevboxServiceManager | undefined;
}

async function assertRunnerTokenFile(tokenFile: string) {
  let content: string;
  try {
    content = await readFile(tokenFile, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(
        `Missing runner token file at ${tokenFile}. Run \`ttr box setup --agent --service\` first or pass --token-file <path>.`
      );
    }
    throw error;
  }

  if (
    !/^(?:export\s+)?TUTURUUU_DEVBOX_RUNNER_TOKEN=.+$/mu.test(content.trim())
  ) {
    throw new Error(
      `Runner token file ${tokenFile} does not define TUTURUUU_DEVBOX_RUNNER_TOKEN.`
    );
  }
}

export async function runDevboxRepair(
  options: DevboxRepairOptions = {}
): Promise<DevboxRepairReport> {
  const runCommand = options.runCommand ?? defaultDevboxSetupRunCommand;
  const stdout =
    options.stdout ?? ((value: string) => process.stdout.write(value));
  const tokenFile = resolve(
    options.tokenFile?.trim() || getDefaultRunnerTokenFile()
  );
  const manager = resolveDevboxServiceManager(options.serviceManager);

  await assertRunnerTokenFile(tokenFile);

  const checkout = await resolveExistingDevboxCheckout({
    cwd: options.cwd,
    dir: options.dir,
    json: options.json,
    runCommand,
  });

  const service = options.dryRun
    ? {
        definitionPath: getServiceDefinitionPath(manager),
        manager,
        wrapperPath: resolve(getDefaultRunnerWrapperFile()),
      }
    : await installDevboxRunnerService({
        checkoutDir: checkout.path,
        json: options.json,
        manager,
        runCommand,
        serviceUser: options.serviceUser,
        tokenFile,
      });

  const restarted =
    !options.dryRun &&
    !options.noRestart &&
    Boolean(
      await restartDevboxRunnerService({
        json: options.json,
        manager: service.manager,
        runCommand,
      })
    );

  const report: DevboxRepairReport = {
    checkout: {
      ...checkout,
      status: 'reused',
    },
    service: {
      definitionPath: service.definitionPath,
      dryRun: options.dryRun === true,
      manager: service.manager,
      restarted,
      wrapperPath: service.wrapperPath,
    },
    status: 'ok',
    tokenFile: {
      path: tokenFile,
      status: 'found',
    },
  };

  if (options.json) printJson(report, stdout);
  else printRepairReport(report, stdout);

  return report;
}

export async function runDevboxRepairCommand({
  flags,
  json,
}: {
  flags: Record<string, FlagValue>;
  json: boolean;
}) {
  await runDevboxRepair({
    dir: getFlag(flags, 'dir'),
    dryRun: flags['dry-run'] === true,
    json,
    noRestart: flags['no-restart'] === true,
    serviceManager: assertSupportedServiceManager(
      getFlag(flags, 'service-manager')
    ),
    serviceUser: getFlag(flags, 'service-user'),
    tokenFile: getFlag(flags, 'token-file'),
  });
}
