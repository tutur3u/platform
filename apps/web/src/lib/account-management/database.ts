import { z } from 'zod';
import type { HumanAuthority } from './authorization';
import { AccountManagementError } from './policy';
import type { AccountMutation } from './requests';
import type { AccountActor, AccountAdmin } from './session';

export function accountData<T>(result: {
  data: T;
  error: { code: string } | null;
}): T {
  switch (result.error?.code) {
    case undefined:
      return result.data;
    case 'P0002':
      throw new AccountManagementError('not_found', 404);
    case '42501':
      throw new AccountManagementError('forbidden', 403);
    case '23505':
      throw new AccountManagementError('operation_conflict', 409);
    case 'PT409':
      throw new AccountManagementError('conflict', 409);
    case '54000':
      throw new AccountManagementError('limit_reached', 429);
    default:
      throw new AccountManagementError('unavailable', 503);
  }
}

export function humanAuthority(
  admin: AccountAdmin,
  actor: Extract<AccountActor, { kind: 'human' }>
): HumanAuthority {
  const rpc = admin.schema('private');
  // The database predicate checks both permissions on every request.
  let access: Promise<boolean> | undefined;
  const allowed = () =>
    (access ??= (async () =>
      accountData(
        await rpc.rpc('accounts_human_allowed', { p_actor: actor.id })
      ) === true)());
  return {
    hasRootRolePermission: allowed,
    hasEnabledPlatformRole: allowed,
    async hasFreshTotpStepUp(id, sessionId) {
      if (id !== actor.id || sessionId !== actor.sessionId) return false;
      return (
        accountData(
          await rpc.rpc('accounts_fresh_totp', {
            p_actor: id,
            p_session: sessionId,
          })
        ) === true
      );
    },
  };
}

export function operationArgs(actor: AccountActor, operationId: string) {
  return {
    p_actor: actor.id,
    p_operation: operationId,
    // Generated RPC args model SQL parameters as non-nullable even though the
    // function accepts NULL for the human credential and optional fields.
    p_credential: actor.kind === 'machine' ? actor.credentialId : sqlNull,
  };
}

export const sqlNull = null as unknown as never;

export function operationAudit(
  admin: AccountAdmin,
  actor: AccountActor,
  command: AccountMutation
) {
  const rpc = admin.schema('private');
  const args = operationArgs(actor, command.operationId);
  const action =
    command.action === 'disable' && !command.disabled
      ? 'enable'
      : command.action === 'delete'
        ? 'human-delete'
        : command.action;
  return async (
    phase: 'denied' | 'intent' | 'success' | 'failure' | 'unknown',
    target?: string
  ) => {
    if (phase === 'denied') {
      accountData(
        await rpc.rpc('accounts_deny', { ...args, p_action: action })
      );
    } else if (phase === 'intent') {
      accountData(
        await rpc.rpc('accounts_begin', {
          ...args,
          p_action: action,
          p_target: 'targetId' in command ? command.targetId : sqlNull,
          p_email: 'email' in command ? command.email : sqlNull,
        })
      );
    } else {
      const settled = accountData(
        await rpc.rpc('accounts_finish', {
          ...args,
          p_phase: phase,
          p_target: target ?? sqlNull,
        })
      );
      if (settled !== true)
        throw new AccountManagementError('unavailable', 503);
    }
  };
}

const listInput = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.uuid().optional(),
});

export async function readAccounts(
  admin: AccountAdmin,
  actorId: string,
  request: Request,
  targetId?: string
) {
  const params = new URL(request.url).searchParams;
  const parsed = listInput.safeParse({
    limit: params.get('limit') ?? undefined,
    cursor: params.get('cursor') ?? undefined,
  });
  if (!parsed.success) throw new AccountManagementError('invalid_request', 400);
  if (targetId !== undefined && !z.uuid().safeParse(targetId).success)
    throw new AccountManagementError('not_found', 404);
  return accountData(
    await admin.schema('private').rpc('accounts_read', {
      p_actor: actorId,
      p_target: targetId ?? sqlNull,
      p_cursor: parsed.data.cursor ?? sqlNull,
      p_limit: parsed.data.limit,
    })
  );
}
