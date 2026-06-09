import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { hostname, platform, userInfo } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import type { TuturuuuUserClient } from '../platform';
import type { DevboxAgentRegistrationResponse } from '../platform-devbox';
import { getDefaultConfigPath } from './config';
import {
  canPromptDevboxSetup,
  confirmDevboxSetupQuestion,
  type DevboxSetupConfirm,
} from './devbox-setup-checkout';
import type { DevboxSetupCommandRunner } from './devbox-setup-command';
import {
  type DevboxServiceManager,
  getServiceDefinitionPath,
  renderLaunchdPlist,
  renderSystemdUnit,
} from './devbox-setup-service-templates';

export type { DevboxServiceManager };

export interface DevboxRunnerSetupResult {
  runner: DevboxAgentRegistrationResponse['runner'];
  service?: {
    definitionPath: string;
    manager: Exclude<DevboxServiceManager, 'auto'>;
    wrapperPath: string;
  };
  tokenFile: string;
}

export interface InstallDevboxRunnerServiceOptions {
  checkoutDir: string;
  json?: boolean;
  manager?: DevboxServiceManager;
  runCommand: DevboxSetupCommandRunner;
  serviceUser?: string;
  tokenFile: string;
}

export interface SetupDevboxRunnerOptions {
  checkoutDir: string;
  options: {
    agent?: boolean;
    client?: TuturuuuUserClient;
    confirm?: DevboxSetupConfirm;
    env?: Record<string, string | undefined>;
    json?: boolean;
    runnerName?: string;
    runCommand: DevboxSetupCommandRunner;
    service?: boolean;
    serviceManager?: DevboxServiceManager;
    serviceUser?: string;
    tokenFile?: string;
  };
}

export function getDefaultRunnerName() {
  return `${hostname() || 'tuturuuu'}-devbox`;
}

export function getDefaultRunnerTokenFile(configPath = getDefaultConfigPath()) {
  return join(dirname(configPath), 'devbox-runner.env');
}

function getDefaultRunnerWrapperFile(configPath = getDefaultConfigPath()) {
  return join(dirname(configPath), 'devbox-runner.sh');
}

function getDefaultServiceDefinitionFile(
  manager: Exclude<DevboxServiceManager, 'auto'>,
  configPath = getDefaultConfigPath()
) {
  return join(
    dirname(configPath),
    manager === 'systemd'
      ? 'tuturuuu-devbox-runner.service'
      : 'com.tuturuuu.devbox-runner.plist'
  );
}

function resolveServiceManager(
  manager: DevboxServiceManager | undefined,
  currentPlatform = platform()
): Exclude<DevboxServiceManager, 'auto'> {
  if (manager && manager !== 'auto') return manager;
  if (currentPlatform === 'linux') return 'systemd';
  if (currentPlatform === 'darwin') return 'launchd';

  throw new Error(
    `Automatic devbox runner service installation is not supported on ${currentPlatform}.`
  );
}

function shellQuote(value: string) {
  return `'${value.replace(/'/gu, `'\\''`)}'`;
}

function getCurrentTtrCommand() {
  const candidate = process.argv[1];
  return candidate?.startsWith('/') ? [process.execPath, candidate] : ['ttr'];
}

export async function writeRunnerTokenFile({
  token,
  tokenFile,
}: {
  token: string;
  tokenFile?: string;
}) {
  const resolvedTokenFile = resolve(
    tokenFile?.trim() || getDefaultRunnerTokenFile()
  );

  await mkdir(dirname(resolvedTokenFile), { mode: 0o700, recursive: true });
  await writeFile(
    resolvedTokenFile,
    `TUTURUUU_DEVBOX_RUNNER_TOKEN=${token}\n`,
    {
      mode: 0o600,
    }
  );
  await chmod(resolvedTokenFile, 0o600);

  return resolvedTokenFile;
}

async function writeRunnerWrapper({
  checkoutDir,
  tokenFile,
}: {
  checkoutDir: string;
  tokenFile: string;
}) {
  const wrapperPath = resolve(getDefaultRunnerWrapperFile());
  const ttrCommand = getCurrentTtrCommand();
  const script = [
    '#!/bin/sh',
    'set -eu',
    `. ${shellQuote(tokenFile)}`,
    `cd ${shellQuote(checkoutDir)}`,
    `exec ${ttrCommand.map(shellQuote).join(' ')} box agent start --no-update-check`,
    '',
  ].join('\n');

  await mkdir(dirname(wrapperPath), { mode: 0o700, recursive: true });
  await writeFile(wrapperPath, script, { mode: 0o700 });
  await chmod(wrapperPath, 0o700);

  return wrapperPath;
}

async function runRequiredServiceCommand({
  args,
  command,
  json,
  name,
  runCommand,
}: {
  args: string[];
  command: string;
  json?: boolean;
  name: string;
  runCommand: DevboxSetupCommandRunner;
}) {
  const result = await runCommand(command, args, { json });
  if (result.code !== 0) {
    throw new Error(
      `${name} failed with exit code ${result.code}: ${command} ${args.join(
        ' '
      )}`
    );
  }
}

export async function installDevboxRunnerService({
  checkoutDir,
  json,
  manager,
  runCommand,
  serviceUser,
  tokenFile,
}: InstallDevboxRunnerServiceOptions) {
  const resolvedManager = resolveServiceManager(manager);
  const resolvedServiceUser = serviceUser?.trim() || userInfo().username;
  const wrapperPath = await writeRunnerWrapper({ checkoutDir, tokenFile });
  const definitionPath = getDefaultServiceDefinitionFile(resolvedManager);
  const systemDefinitionPath = getServiceDefinitionPath(resolvedManager);
  const definition =
    resolvedManager === 'systemd'
      ? renderSystemdUnit({
          checkoutDir,
          serviceUser: resolvedServiceUser,
          wrapperPath,
        })
      : renderLaunchdPlist({
          checkoutDir,
          serviceUser: resolvedServiceUser,
          wrapperPath,
        });

  await writeFile(definitionPath, definition, { mode: 0o644 });

  if (resolvedManager === 'systemd') {
    await runRequiredServiceCommand({
      args: ['cp', definitionPath, systemDefinitionPath],
      command: 'sudo',
      json,
      name: 'Install systemd devbox runner service',
      runCommand,
    });
    await runRequiredServiceCommand({
      args: ['systemctl', 'daemon-reload'],
      command: 'sudo',
      json,
      name: 'Reload systemd',
      runCommand,
    });
    await runRequiredServiceCommand({
      args: ['systemctl', 'enable', '--now', 'tuturuuu-devbox-runner.service'],
      command: 'sudo',
      json,
      name: 'Enable systemd devbox runner service',
      runCommand,
    });
  } else {
    await runRequiredServiceCommand({
      args: ['cp', definitionPath, systemDefinitionPath],
      command: 'sudo',
      json,
      name: 'Install launchd devbox runner service',
      runCommand,
    });
    await runRequiredServiceCommand({
      args: ['chown', 'root:wheel', systemDefinitionPath],
      command: 'sudo',
      json,
      name: 'Set launchd devbox runner service owner',
      runCommand,
    });
    await runRequiredServiceCommand({
      args: ['chmod', '644', systemDefinitionPath],
      command: 'sudo',
      json,
      name: 'Set launchd devbox runner service permissions',
      runCommand,
    });
    await runCommand(
      'sudo',
      ['launchctl', 'bootout', 'system', systemDefinitionPath],
      {
        json,
      }
    );
    await runRequiredServiceCommand({
      args: ['launchctl', 'bootstrap', 'system', systemDefinitionPath],
      command: 'sudo',
      json,
      name: 'Bootstrap launchd devbox runner service',
      runCommand,
    });
    await runRequiredServiceCommand({
      args: ['launchctl', 'enable', 'system/com.tuturuuu.devbox-runner'],
      command: 'sudo',
      json,
      name: 'Enable launchd devbox runner service',
      runCommand,
    });
    await runRequiredServiceCommand({
      args: [
        'launchctl',
        'kickstart',
        '-k',
        'system/com.tuturuuu.devbox-runner',
      ],
      command: 'sudo',
      json,
      name: 'Start launchd devbox runner service',
      runCommand,
    });
  }

  return {
    definitionPath: systemDefinitionPath,
    manager: resolvedManager,
    wrapperPath,
  };
}

async function confirmSetupStep(
  options: SetupDevboxRunnerOptions['options'],
  question: string
) {
  if (!canPromptDevboxSetup(options)) return false;
  const confirm = options.confirm ?? confirmDevboxSetupQuestion;
  return confirm(question);
}

export async function setupDevboxRunner({
  checkoutDir,
  options,
}: SetupDevboxRunnerOptions) {
  const shouldRegister =
    options.agent ||
    options.service ||
    (await confirmSetupStep(
      options,
      'Register this machine as a Tuturuuu devbox runner?'
    ));

  if (!shouldRegister) return undefined;

  if (!options.client) {
    throw new Error('Not logged in. Run `ttr login` first.');
  }

  const shouldInstallService =
    options.service ||
    (await confirmSetupStep(
      options,
      'Install a boot-starting devbox runner system service?'
    ));
  const runnerName = options.runnerName?.trim() || getDefaultRunnerName();
  const registration = await options.client.devboxes.registerAgent({
    name: runnerName,
  });
  const tokenFile = await writeRunnerTokenFile({
    token: registration.token,
    tokenFile: options.tokenFile,
  });

  if (!shouldInstallService) {
    return {
      runner: registration.runner,
      tokenFile,
    } satisfies DevboxRunnerSetupResult;
  }

  return {
    runner: registration.runner,
    service: await installDevboxRunnerService({
      checkoutDir,
      json: options.json,
      manager: options.serviceManager,
      runCommand: options.runCommand,
      serviceUser: options.serviceUser,
      tokenFile,
    }),
    tokenFile,
  } satisfies DevboxRunnerSetupResult;
}
