import { randomUUID } from 'node:crypto';
import {
  type AccountCommand,
  AccountsClient,
  accountCommandSchema,
} from '../accounts';
import { type FlagValue, getFlag } from './args';
import { qaHelp } from './qa-users';

export function accountsHelp(
  group = 'accounts',
  action?: string,
  subaction?: string
) {
  if (group === 'qa') return qaHelp(action === 'users' ? subaction : undefined);
  return [
    'ttr accounts invite <staff-email>',
    'ttr accounts list [--limit <count>] [--cursor <uuid>]',
    'ttr accounts status <user-id> | status --operation <operation-id>',
    'ttr accounts role <user-id> --workspace <uuid> --role <uuid>',
    'ttr accounts admin <user-id> --enabled true|false --confirm <user-id>',
    'ttr accounts test-create --label a1|a2 [--fleet]',
    'ttr accounts test-delete <user-id> --confirm <user-id> [--fleet]',
    'Every command supports --json. Fleet operation status also accepts --fleet.',
    'Disable, enable, and human deletion are closed.',
  ].join('\n');
}

type Options = {
  action: string | undefined;
  target: string | undefined;
  flags: Record<string, FlagValue>;
  json: boolean;
  createHuman: () => AccountsClient | Promise<AccountsClient>;
  createMachine: () => Promise<AccountsClient>;
  write?: (line: string) => void;
};

export async function runAccountsCommand({
  action,
  target,
  flags,
  json,
  createHuman,
  createMachine,
  write = (line) => process.stdout.write(line),
}: Options) {
  if (!action) {
    write(`${accountsHelp()}\n`);
    return;
  }
  if (['disable', 'enable', 'delete'].includes(action))
    throw new Error('This account command is closed pending D292.');
  if (
    Object.hasOwn(flags, 'token') ||
    Object.hasOwn(flags, 'password') ||
    Object.hasOwn(flags, 'challenge')
  )
    throw new Error(
      'Account credentials must come from the configured credential store.'
    );
  const field = (name: string) => getFlag(flags, name);
  const operationId = randomUUID();
  const confirmation = field('confirm');
  const machine = flags.fleet === true;
  const operationStatus = action === 'status' && field('operation');
  if (
    machine &&
    action !== 'test-create' &&
    action !== 'test-delete' &&
    !operationStatus
  )
    throw new Error('Fleet access permits test account operations only.');
  let command: AccountCommand;
  const parse = (input: unknown) => {
    const parsed = accountCommandSchema.safeParse(input);
    if (!parsed.success)
      throw new Error('Invalid account arguments. See ttr accounts --help.');
    return parsed.data;
  };
  const client = () => (machine ? createMachine() : createHuman());
  let adminClient: AccountsClient | undefined;
  switch (action) {
    case 'list':
      command = parse({
        action,
        limit: field('limit') === undefined ? 25 : Number(field('limit')),
        cursor: field('cursor'),
      });
      break;
    case 'status':
      command = parse(
        operationStatus
          ? { action: 'operation-status', operationId: operationStatus }
          : { action, targetId: target }
      );
      break;
    case 'invite':
      command = parse({ action, operationId, email: target?.toLowerCase() });
      break;
    case 'role':
      command = parse({
        action,
        operationId,
        targetId: target,
        workspaceId: field('workspace'),
        roleId: field('role'),
      });
      break;
    case 'admin': {
      const enabled = field('enabled');
      if (
        (enabled !== 'true' && enabled !== 'false') ||
        !target ||
        confirmation !== target
      )
        throw new Error(
          'Pass --enabled true|false and type the exact target UUID in --confirm.'
        );
      adminClient = await client();
      const draft = {
        action,
        operationId,
        targetId: target,
        confirmTarget: confirmation,
        enabled: enabled === 'true',
      } as const;
      const challenge = await adminClient.requestAdminChallenge(draft);
      command = parse({ ...draft, challenge });
      break;
    }
    case 'test-create':
      command = parse({ action, operationId, label: field('label') });
      break;
    case 'test-delete':
      if (!target || confirmation !== target)
        throw new Error('Type the exact target UUID in --confirm.');
      command = parse({
        action,
        operationId,
        targetId: target,
        confirmTarget: confirmation,
      });
      break;
    default:
      throw new Error('Unknown account command. See ttr accounts --help.');
  }
  const accounts = adminClient ?? (await client());
  const mutation = !['list', 'status', 'operation-status'].includes(
    command.action
  );
  const result = await accounts.execute(command).catch((error: Error) => {
    if (!mutation) throw error;
    throw new Error(`${error.message} Operation ${operationId}.`);
  });
  if (json) {
    write(`${JSON.stringify(result, null, 2)}\n`);
  } else if ('accounts' in result) {
    const rows = result.accounts.map(
      (item) =>
        `${item.id}  ${item.maskedEmail}  ${item.disabled ? 'disabled' : 'enabled'}`
    );
    if (result.nextCursor) rows.push(`Next cursor ${result.nextCursor}`);
    write(`${rows.length ? rows.join('\n') : 'No accounts.'}\n`);
  } else if ('account' in result) {
    const { account } = result;
    write(
      `${account.id}  ${account.email}  ${account.disabled ? 'disabled' : 'enabled'}\n`
    );
  } else {
    write(
      `${result.status}  ${result.operationId}${result.targetId ? `  ${result.targetId}` : ''}\n`
    );
  }
  if ('status' in result && ['unknown', 'failure'].includes(result.status))
    process.exitCode = 1;
}
