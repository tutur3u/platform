import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createEmployeeManagementTransport } from '@tuturuuu/utils/internal-accounts/employee-management-rpc';
import { inspectEmployeeManagement } from '@tuturuuu/utils/internal-accounts/employee-restoration-boundary';
import {
  reconcileEmployeeAccess,
  restoreEmployeeAccess,
} from '@tuturuuu/utils/internal-accounts/employee-restoration-orchestration';
import { createEmployeeRestorationOperations } from '@tuturuuu/utils/internal-accounts/employee-restoration-rpc';
import { z } from 'zod';

const rpcNames = [
  'inspect_employee_management',
  'begin_employee_restore',
  'mark_employee_restore_attempt',
  'confirm_employee_restore',
  'reconcile_employee_restore',
] as const;

export async function qualifyEmployeeRestoreHttp(input: {
  url: string;
  key: string;
  anonKey: string;
  actorUserId: string;
  password: string;
  admin: Pick<SupabaseClient, 'auth'>;
  authorize(id: string): Promise<boolean>;
  createTarget(): Promise<{ id: string; email: string }>;
}) {
  let phase = 'restore-effective-permissions';
  let assertions = 0;
  const phaseAssertions: Record<string, number> = {};
  function check(value: unknown) {
    assert.ok(value);
    assertions++;
    phaseAssertions[phase] = (phaseAssertions[phase] ?? 0) + 1;
  }
  let unbans = 0;
  const provider = {
    getUserById: input.admin.auth.admin.getUserById.bind(
      input.admin.auth.admin
    ),
    async updateUserById(
      ...args: Parameters<typeof input.admin.auth.admin.updateUserById>
    ) {
      assert.deepEqual(args[1], { ban_duration: 'none' });
      unbans++;
      return input.admin.auth.admin.updateUserById(...args);
    },
  };
  function operations(targetUserId: string, fetcher?: typeof fetch) {
    return createEmployeeRestorationOperations({
      ...input,
      targetUserId,
      authorize: input.authorize,
      fetch: fetcher,
    });
  }
  async function target() {
    const user = await input.createTarget();
    const banned = await input.admin.auth.admin.updateUserById(user.id, {
      ban_duration: '24h',
    });
    assert.ok(!banned.error && banned.data.user);
    assert.ok(Date.parse(banned.data.user.banned_until ?? '') > Date.now());
    return {
      actorUserId: input.actorUserId,
      targetUserId: user.id,
      confirmationEmail: user.email,
      expectedRevision: 0,
      provider,
      operations: operations(user.id),
    };
  }
  async function observe(value: Awaited<ReturnType<typeof target>>) {
    return inspectEmployeeManagement(
      { ...value, operations: operations(value.targetUserId) },
      (await provider.getUserById(value.targetUserId)).data.user
    );
  }
  async function deniedRpc(
    name: (typeof rpcNames)[number],
    key: string,
    token: string,
    actorId: string,
    value: Awaited<ReturnType<typeof target>>
  ) {
    const response = await fetch(`${input.url}/rest/v1/rpc/${name}`, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(8000),
      headers: {
        apikey: key,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Profile': 'private',
        'Accept-Profile': 'private',
      },
      body: JSON.stringify({
        p_actor_id: actorId,
        p_user_id: value.targetUserId,
        p_email: value.confirmationEmail,
        ...(name === 'inspect_employee_management'
          ? {}
          : { p_expected_revision: 0, p_operation_id: randomUUID() }),
      }),
    });
    const error = z.object({ code: z.string() }).parse(await response.json());
    check(!response.ok && error.code === '42501');
  }
  try {
    const value = await target();
    const outsider = await input.admin.auth.admin.createUser({
      email: `http-outsider-${randomUUID()}@example.test`,
      password: input.password,
      email_confirm: true,
    });
    check(!outsider.error && outsider.data.user);
    const outsiderId = z.uuid().parse(outsider.data.user?.id);
    const sessionClient = createClient(input.url, input.anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
    const signedIn = await sessionClient.auth.signInWithPassword({
      email: z.email().parse(outsider.data.user?.email),
      password: input.password,
    });
    check(!signedIn.error && signedIn.data.session);
    const token = z.string().min(1).parse(signedIn.data.session?.access_token);
    for (const name of rpcNames) {
      await deniedRpc(
        name,
        input.anonKey,
        input.anonKey,
        input.actorUserId,
        value
      );
      await deniedRpc(name, input.anonKey, token, input.actorUserId, value);
      await deniedRpc(name, input.key, input.key, outsiderId, value);
    }
    const before = await observe(value);
    check(
      before.revision === 0 && before.operation === null && before.mailboxReady
    );

    phase = 'restore-success-and-replay';
    const restored = await restoreEmployeeAccess(value);
    check(restored.status === 'restored');
    if (restored.status !== 'restored') throw new Error('Restore incomplete');
    check(
      restored.account.id === value.targetUserId && restored.revision === 1
    );
    check(unbans === 1);
    const committed = await observe(value);
    check(committed.operation?.operationId === restored.operationId);
    check(
      committed.operation?.phase === 'completed' && committed.revision === 1
    );
    const active = await provider.getUserById(value.targetUserId);
    check(
      !active.error &&
        active.data.user?.id === value.targetUserId &&
        (!active.data.user.banned_until ||
          Date.parse(active.data.user.banned_until) <= Date.now())
    );
    const replay = await reconcileEmployeeAccess({
      ...value,
      operationId: restored.operationId,
    });
    check(
      replay.status === 'restored' &&
        replay.operationId === restored.operationId &&
        replay.account.id === value.targetUserId
    );
    check(unbans === 1);
    await assert.rejects(restoreEmployeeAccess(value), {
      code: 'employee_revision_or_operation_conflict',
    });
    check(unbans === 1);
    const call = createEmployeeManagementTransport({
      ...input,
      authorize: input.authorize,
    });
    const conflict = await call(
      'reconcile_employee_restore',
      input.actorUserId,
      {
        p_actor_id: input.actorUserId,
        p_user_id: value.targetUserId,
        p_email: value.confirmationEmail,
        p_expected_revision: 1,
        p_operation_id: restored.operationId,
      }
    );
    check(conflict.error?.code === '23514');
    const unchanged = await observe(value);
    check(
      unchanged.revision === 1 &&
        unchanged.operation?.operationId === restored.operationId
    );

    for (const [name, expectedPhase] of [
      ['begin_employee_restore', 'reserved'],
      ['mark_employee_restore_attempt', 'attempted'],
      ['confirm_employee_restore', 'completed'],
    ] as const) {
      phase = `restore-lost-${expectedPhase}-acknowledgement`;
      const pendingTarget = await target();
      const initialUnbans = unbans;
      let committedAckLost = false;
      const lost: typeof fetch = async (url, options) => {
        const response = await fetch(url, options);
        if (!committedAckLost && String(url).endsWith(`/rpc/${name}`)) {
          assert.ok(response.ok);
          await response.text();
          committedAckLost = true;
          throw new Error('Synthetic lost committed acknowledgement');
        }
        return response;
      };
      const result = await restoreEmployeeAccess({
        ...pendingTarget,
        operations: operations(pendingTarget.targetUserId, lost),
      });
      check(committedAckLost && result.status === 'pending');
      const retained = await observe(pendingTarget);
      check(retained.operation?.phase === expectedPhase);
      check(retained.operation?.operationId === result.operationId);
      check(unbans === initialUnbans + (expectedPhase === 'completed' ? 1 : 0));
      const reconciled = await reconcileEmployeeAccess({
        ...pendingTarget,
        operationId: result.operationId,
      });
      check(
        reconciled.status !== 'observed' &&
          reconciled.operationId === result.operationId &&
          reconciled.status ===
            (expectedPhase === 'completed' ? 'restored' : 'pending')
      );
      check(unbans === initialUnbans + (expectedPhase === 'completed' ? 1 : 0));
      await assert.rejects(restoreEmployeeAccess(pendingTarget), {
        code: 'employee_revision_or_operation_conflict',
      });
      check(unbans === initialUnbans + (expectedPhase === 'completed' ? 1 : 0));
      const final = await observe(pendingTarget);
      check(
        final.operation?.operationId === result.operationId &&
          final.operation.phase === expectedPhase
      );
    }

    phase = 'restore-lost-provider-acknowledgement';
    const unknownTarget = await target();
    const initialUnbans = unbans;
    let providerCommitted = false;
    const unknown = await restoreEmployeeAccess({
      ...unknownTarget,
      provider: {
        ...provider,
        async updateUserById(
          ...args: Parameters<typeof provider.updateUserById>
        ) {
          const response = await provider.updateUserById(...args);
          assert.ok(!response.error);
          providerCommitted = true;
          throw new Error('Synthetic lost GoTrue update acknowledgement');
        },
      },
    });
    check(providerCommitted && unknown.status === 'pending');
    const attempted = await observe(unknownTarget);
    check(
      attempted.operation?.phase === 'attempted' &&
        attempted.operation.operationId === unknown.operationId
    );
    const actual = await provider.getUserById(unknownTarget.targetUserId);
    check(
      !actual.error &&
        actual.data.user?.id === unknownTarget.targetUserId &&
        (!actual.data.user.banned_until ||
          Date.parse(actual.data.user.banned_until) <= Date.now())
    );
    const reconciled = await reconcileEmployeeAccess({
      ...unknownTarget,
      operationId: unknown.operationId,
    });
    check(
      reconciled.status === 'restored' &&
        reconciled.operationId === unknown.operationId &&
        reconciled.account.id === unknownTarget.targetUserId
    );
    check(unbans === initialUnbans + 1);
    const again = await reconcileEmployeeAccess({
      ...unknownTarget,
      operationId: unknown.operationId,
    });
    check(
      again.status === 'restored' && again.operationId === unknown.operationId
    );
    check(unbans === initialUnbans + 1);
    const final = await observe(unknownTarget);
    check(
      final.revision === 1 &&
        final.operation?.phase === 'completed' &&
        final.operation.operationId === unknown.operationId
    );
    phase = 'restore-revoked-actor';
    const revokedTarget = await target();
    const tuple = {
      actorUserId: input.actorUserId,
      targetUserId: revokedTarget.targetUserId,
      email: revokedTarget.confirmationEmail,
      expectedRevision: 0,
      operationId: randomUUID(),
    };
    const initialWrites = unbans;
    const begun = await revokedTarget.operations.begin(tuple);
    check(Boolean(begun));
    const bannedActor = await input.admin.auth.admin.updateUserById(
      input.actorUserId,
      { ban_duration: '24h' }
    );
    check(
      !bannedActor.error &&
        Date.parse(bannedActor.data.user?.banned_until ?? '') > Date.now()
    );
    try {
      // Bypass the application authorize callback to require the SQL actor check.
      await deniedRpc(
        'mark_employee_restore_attempt',
        input.key,
        input.key,
        input.actorUserId,
        revokedTarget
      );
      check(unbans === initialWrites);
    } finally {
      const restoredActor = await input.admin.auth.admin.updateUserById(
        input.actorUserId,
        { ban_duration: 'none' }
      );
      assert.ok(!restoredActor.error);
    }
    const stillReserved = await observe(revokedTarget);
    check(
      stillReserved.operation?.operationId === tuple.operationId &&
        stillReserved.operation.phase === 'reserved' &&
        stillReserved.revision === 0
    );
    phase = 'complete';
    return { qualified: true, phase, assertions, phaseAssertions };
  } catch {
    return { qualified: false, phase, assertions, phaseAssertions };
  }
}
