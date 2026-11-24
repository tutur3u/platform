import { AccountsClient } from '../accounts';
import { TuturuuuUserClient } from '../platform';
import { type FlagValue } from './args';
import { refreshCliSession } from './auth';
import {
  type CliConfig,
  resolveCliTasksBaseUrl,
  writeCliConfig,
} from './config';
import { EmployeesAdminClient } from '../platform-employees';
import { WorkspaceRolesAdminClient } from '../platform-workspace-roles';
import { runAccountsCommand } from './accounts';
import { defaultEmployeesDeps, runEmployeesCommand } from './employees';
import { createEmployeeSecretStore } from './employees-secrets';
import { runQaCommand } from './qa-users';
import { runWorkspaceRolesCommand } from './workspace-roles';

export function getClient(config: CliConfig) {
  if (!config.session?.accessToken || !config.session.refreshToken) {
    throw new Error('Not logged in. Run `ttr login` first.');
  }

  return new TuturuuuUserClient({
    accessToken: config.session.accessToken,
    baseUrl: config.baseUrl,
    expiresAt: config.session.expiresAt,
    onSessionRefresh: async (session) => {
      await writeCliConfig({ ...config, session });
    },
    refreshToken: config.session.refreshToken,
    tasksBaseUrl: config.tasksBaseUrl ?? resolveCliTasksBaseUrl(config.baseUrl),
  });
}

async function createHumanAccountsClient(config: CliConfig) {
  let session = config.session;
  if (!session?.accessToken || !session.refreshToken)
    throw new Error('Not logged in. Run `ttr login` first.');
  // Validate the transport before sending either credential.
  const checked = new AccountsClient({ baseUrl: config.baseUrl });
  if (session.expiresAt && session.expiresAt * 1000 <= Date.now() + 60_000) {
    const origin = new URL(config.baseUrl).origin;
    session = await refreshCliSession({
      baseUrl: origin,
      refreshToken: session.refreshToken,
      fetch: (input, init) => fetch(input, { ...init, redirect: 'error' }),
    });
    await writeCliConfig({ ...config, session });
  }
  return checked.withBearer(session.accessToken);
}

type AccountGroupOptions = {
  config: CliConfig;
  action?: string;
  flags: Record<string, FlagValue>;
  json: boolean;
  positionals: string[];
};

export async function runAccountGroup(
  group: string | undefined,
  options: AccountGroupOptions
) {
  const { action, config, flags, json, positionals } = options;
  if (group === 'accounts') {
    await runAccountsCommand({
      action,
      flags,
      json,
      target: positionals[2],
      createHuman: () => createHumanAccountsClient(config),
      createMachine: () =>
        AccountsClient.forRunner(
          process.env.TUTURUUU_DEVBOX_RUNNER_TOKEN ?? ''
        ),
    });
    return true;
  }
  if (group === 'employees') {
    await runEmployeesCommand(
      {
        client: () =>
          new EmployeesAdminClient(getClient(config).getClientOptions()),
        flags,
        json,
        positionals: positionals.slice(1),
      },
      defaultEmployeesDeps(createEmployeeSecretStore())
    );
    return true;
  }
  if (
    group === 'workspaces' &&
    (action === 'roles' ||
      (action === 'members' && positionals[2] === 'invite'))
  ) {
    await runWorkspaceRolesCommand({
      client: () =>
        new WorkspaceRolesAdminClient(getClient(config).getClientOptions()),
      flags,
      json,
      positionals: positionals.slice(1),
    });
    return true;
  }
  if (group === 'qa') {
    await runQaCommand({
      client: getClient(config),
      flags,
      json,
      positionals: positionals.slice(1),
    });
    return true;
  }
  return false;
}
