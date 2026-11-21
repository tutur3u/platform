import { z } from 'zod';
import { deleteQaUser } from '@/lib/qa-test-users/deletion';
import { generateQaPassword, qaTestMarker } from '@/lib/qa-test-users/policy';
import { completeQaOnboarding } from '@/lib/qa-test-users/provision';
import { createQaDeletionDeps } from '@/lib/qa-test-users/runtime';
import {
  beginDeleteSchema,
  finishDeleteSchema,
  reservationSchema,
} from '@/lib/qa-test-users/store';
import { accountData, operationArgs, sqlNull } from './database';
import { AccountManagementError } from './policy';
import type { AccountMutation } from './requests';
import { accountAdmin, type AccountActor, type AccountAdmin } from './session';

const inviteRedirect = 'https://tuturuuu.com/';

type TestMutation = Extract<
  AccountMutation,
  { action: 'test-create' | 'test-delete' }
>;
export async function executeTestMutation(
  admin: AccountAdmin,
  actor: AccountActor,
  command: TestMutation
) {
  const rpc = admin.schema('private');
  const args = operationArgs(actor, command.operationId);
  async function step(p_step: string) {
    return accountData(
      await rpc.rpc('accounts_test_step', { ...args, p_step })
    );
  }
  if (command.action === 'test-create') {
    const reservation = reservationSchema.parse(
      accountData(
        await rpc.rpc('accounts_reserve_test', {
          ...args,
          p_label: command.label,
        })
      )
    );
    const [test] = reservation.users;
    if (reservation.users.length !== 1 || !test || test.staff)
      throw new AccountManagementError('unavailable', 503);
    const result = await admin.auth.admin.createUser({
      id: test.userId,
      email: test.email,
      password: generateQaPassword(),
      email_confirm: true,
      app_metadata: qaTestMarker({
        expiresAt: reservation.expiresAt,
        operatorUserId: actor.id,
        purpose: reservation.purpose,
        runId: reservation.runId,
        staff: false,
      }),
    });
    if (result.error || result.data.user?.id !== test.userId)
      throw new AccountManagementError('unavailable', 503);
    await completeQaOnboarding(admin, test.userId);
    if ((await step('activate')) === null)
      throw new AccountManagementError('unavailable', 503);
    return test.userId;
  }

  const deps = createQaDeletionDeps(admin);
  const deleted = await deleteQaUser(
    {
      ...deps,
      store: {
        ...deps.store,
        async beginDelete() {
          const result = beginDeleteSchema.parse(await step('begin'));
          // Accounts test runs never own shared workspaces.
          if (result.runWorkspaceId)
            throw new AccountManagementError('unavailable', 503);
          return result;
        },
        async finishDelete() {
          return finishDeleteSchema.parse(await step('finish'));
        },
      },
    },
    command.targetId,
    'operator',
    actor.id
  );
  if (deleted !== 'deleted')
    throw new AccountManagementError('unavailable', 503);
  // Also handles an account that another authorized cleanup already removed.
  if (finishDeleteSchema.parse(await step('finish')).state !== 'deleted')
    throw new AccountManagementError('unavailable', 503);
  return command.targetId;
}

export async function executeHumanMutation(
  admin: AccountAdmin,
  actor: Extract<AccountActor, { kind: 'human' }>,
  command: Exclude<AccountMutation, { action: 'delete' }>
) {
  if (command.action === 'invite') {
    const response = await admin.auth.admin.inviteUserByEmail(command.email, {
      redirectTo: inviteRedirect,
    });
    if (
      response.error ||
      !response.data.user ||
      response.data.user.email !== command.email
    )
      throw new AccountManagementError('unavailable', 503);
    return z.uuid().parse(response.data.user.id);
  }
  if (command.action === 'test-create' || command.action === 'test-delete')
    return executeTestMutation(admin, actor, command);
  if (command.action !== 'admin' && command.action !== 'role')
    throw new AccountManagementError('unavailable', 503);
  const writer =
    command.action === 'admin' ? await accountAdmin(actor.id) : admin;
  accountData(
    await writer.schema('private').rpc('accounts_apply_human', {
      p_operation: command.operationId,
      p_actor: actor.id,
      p_session: actor.sessionId,
      p_workspace: command.action === 'role' ? command.workspaceId : sqlNull,
      p_role: command.action === 'role' ? command.roleId : sqlNull,
      p_enabled: command.action === 'admin' ? command.enabled : sqlNull,
    })
  );
  return command.targetId;
}
