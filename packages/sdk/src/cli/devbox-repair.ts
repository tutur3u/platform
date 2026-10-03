import { randomUUID } from 'node:crypto';
import {
  chown,
  lstat,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { userInfo } from 'node:os';
import { resolve } from 'node:path';
import { type FlagValue, getFlag } from './args';
import {
  type DevboxExecutionMode,
  parseDevboxExecutionMode,
  preflightProtectedService,
} from './devbox-host-protection';
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
  executionMode?: DevboxExecutionMode;
  dockerHost?: string;
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
  const content = await readFile(tokenFile, 'utf8');
  const readSetting = (key: string) =>
    content
      .split(/\r?\n/u)
      .map((line) => line.trim().replace(/^export\s+/u, ''))
      .find((line) => line.startsWith(`${key}=`))
      ?.slice(key.length + 1)
      .replace(/^['"]|['"]$/gu, '');
  const executionMode =
    options.executionMode ??
    parseDevboxExecutionMode(readSetting('TUTURUUU_DEVBOX_EXECUTION_MODE'));
  if (
    readSetting('TUTURUUU_DEVBOX_EXECUTION_MODE') === 'judge-only' &&
    executionMode !== 'judge-only'
  )
    throw new Error(
      'Repair cannot weaken an existing Judge-only execution policy.'
    );
  const dockerHost = options.dockerHost ?? readSetting('DOCKER_HOST');

  const checkout = await resolveExistingDevboxCheckout({
    cwd: options.cwd,
    dir: options.dir,
    json: options.json,
    runCommand,
  });

  await preflightProtectedService({
    mode: executionMode,
    manager,
    serviceUser: options.serviceUser ?? userInfo().username,
    checkoutDir: checkout.path,
    tokenFile,
    cliCommand: [process.execPath, process.argv[1] ?? 'ttr'],
    dockerHost,
    runCommand,
  });
  if (!options.dryRun && (options.executionMode || options.dockerHost)) {
    const metadata = await lstat(tokenFile);
    if (!metadata.isFile() || metadata.isSymbolicLink())
      throw new Error('Runner token file must be a regular private file.');
    let updated = content;
    for (const [key, value] of Object.entries({
      TUTURUUU_DEVBOX_EXECUTION_MODE: executionMode,
      ...(dockerHost ? { DOCKER_HOST: dockerHost } : {}),
    })) {
      updated = updated
        .split(/\r?\n/u)
        .filter(
          (line) =>
            !line
              .trim()
              .replace(/^export\s+/u, '')
              .startsWith(`${key}=`)
        )
        .join('\n')
        .trimEnd();
      updated += `\n${key}='${value.replace(/'/gu, "'\\''")}'\n`;
    }
    const temporary = `${tokenFile}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, updated, { mode: 0o600, flag: 'wx' });
      await chown(temporary, metadata.uid, metadata.gid);
      await rename(temporary, tokenFile);
    } finally {
      await rm(temporary, { force: true });
    }
  }
  const service = options.dryRun
    ? {
        definitionPath: getServiceDefinitionPath(manager),
        manager,
        wrapperPath: resolve(
          getDefaultRunnerWrapperFile(
            executionMode === 'judge-only' ? tokenFile : undefined
          )
        ),
      }
    : await installDevboxRunnerService({
        checkoutDir: checkout.path,
        executionMode,
        dockerHost,
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
    executionMode: getFlag(flags, 'execution-mode')
      ? parseDevboxExecutionMode(getFlag(flags, 'execution-mode'))
      : undefined,
    dockerHost: getFlag(flags, 'docker-host'),
    serviceUser: getFlag(flags, 'service-user'),
    tokenFile: getFlag(flags, 'token-file'),
  });
}
