import { describe, expect, it, vi } from 'vitest';
import { createEmployeeCreationJournal } from './employee-creation-journal';
import {
  createEmployeeCreationOperationStore,
  type EmployeeOperationSnapshot,
  EmployeeOperationSnapshotSchema,
} from './employee-creation-operation-store';
import { createEmployeeRuntimeRpc } from './employee-creation-rpc';
import { createEmployeeRpcPhaseProvider } from './employee-creation-rpc-provider';
import type { EmployeeAuthAdmin } from './employee-creation-supplier';

vi.mock('server-only', () => ({}));
const actor = '00000000-0000-4000-8000-000000000001';
const operationId = '00000000-0000-4000-8000-000000000002';
const target = '00000000-0000-4000-8000-000000000003';
const payload = {
  email: 'staff@tuturuuu.com',
  displayName: 'Staff',
  temporaryPassword: 'synthetic-password',
};
type User = NonNullable<
  Awaited<ReturnType<EmployeeAuthAdmin['getUserById']>>['data']['user']
>;
const banned: User = {
  id: target,
  email: payload.email,
  email_confirmed_at: '2026-10-01T00:00:00Z',
  banned_until: '2126-01-01T00:00:00Z',
  app_metadata: { employee_onboarding: true },
  user_metadata: {},
  aud: 'authenticated',
  created_at: '2026-10-01T00:00:00Z',
};
function fixture(
  options: {
    loseCreate?: boolean;
    loseActivation?: boolean;
    rollbackClaim?: boolean;
    denyActor?: boolean;
  } = {}
) {
  let user: User | null = null;
  let operation: EmployeeOperationSnapshot | null = null;
  let account: {
    id: string;
    email: string;
    displayName: string;
    status: 'pending' | 'created';
  } | null = null;
  let mutations = 0;
  const transport = createEmployeeRuntimeRpc({
    url: 'https://project.supabase.co',
    key: 'synthetic',
    fetch: vi.fn<typeof fetch>(async (url, init) => {
      const name = new URL(String(url)).pathname.split('/').at(-1);
      const body: unknown = JSON.parse(String(init?.body));
      if (name === 'employee_creation_runtime_ready')
        return Response.json({
          ready: true,
          contract: 'employee-http-rpc-v1',
          finalizeSha256: 'a'.repeat(64),
          confirmSha256: 'b'.repeat(64),
        });
      if (name === 'employee_creation_runtime_inspect')
        return Response.json({ operation, account });
      if (name === 'employee_creation_operation_claim') {
        if (operation) return Response.json({ kind: 'inspect', operation });
        const created: EmployeeOperationSnapshot = {
          actorUserId: actor,
          operationId,
          targetUserId: target,
          email: payload.email,
          displayName: payload.displayName,
          phase: 'reserved',
          version: 0,
          leaseId: '00000000-0000-4000-8000-000000000004',
          leaseExpiresAt: Date.now() + 60_000,
          revoked: false,
          lastReceipt: null,
        };
        if (!options.rollbackClaim) operation = created;
        return Response.json({ kind: 'claimed', operation: created });
      }
      if (name === 'employee_creation_operation_advance') {
        if (
          !operation ||
          typeof body !== 'object' ||
          !body ||
          !('p_next_phase' in body) ||
          !('p_receipt' in body)
        )
          throw new Error('fixture transition');
        operation = EmployeeOperationSnapshotSchema.parse({
          ...operation,
          phase: body.p_next_phase,
          version: operation.version + 1,
          lastReceipt: body.p_receipt ?? operation.lastReceipt,
        });
        return Response.json({ kind: 'advanced', operation });
      }
      if (
        name === 'finalize_employee_creation' ||
        name === 'confirm_employee_activation'
      ) {
        mutations++;
        account = {
          id: target,
          email: payload.email,
          displayName: payload.displayName,
          status: name === 'finalize_employee_creation' ? 'pending' : 'created',
        };
        return Response.json(account);
      }
      throw new Error('unexpected fixed RPC');
    }),
  });
  const create = vi.fn<EmployeeAuthAdmin['createUser']>(async () => {
    user = banned;
    if (options.loseCreate) throw new Error('provider response lost');
    return { data: { user }, error: null };
  });
  const update = vi.fn<EmployeeAuthAdmin['updateUserById']>(async () => {
    user = { ...banned, banned_until: undefined };
    if (options.loseActivation) throw new Error('activation response lost');
    return { data: { user }, error: null };
  });
  const read = vi.fn<EmployeeAuthAdmin['getUserById']>(async () => {
    if (!user) throw new Error('missing fixture provider user');
    return { data: { user }, error: null };
  });
  const store = createEmployeeCreationOperationStore({
    rpc: transport.rpc,
    async authorize() {
      const now = Date.now();
      return {
        actorUserId: actor,
        workspaceId: '00000000-0000-0000-0000-000000000000',
        membership: 'MEMBER',
        permission: 'manage_internal_accounts',
        email: 'admin@tuturuuu.com',
        emailConfirmed: true,
        unbanned: true,
        observedAt: now,
        expiresAt: now + 60_000,
      };
    },
  });
  const provider = createEmployeeRpcPhaseProvider({
    transport,
    auth: { createUser: create, updateUserById: update, getUserById: read },
    authorize: async () => !options.denyActor,
  });
  return {
    journal: createEmployeeCreationJournal({ store, provider }),
    create,
    update,
    mutations: () => mutations,
    operation: () => operation,
  };
}
describe('RPC phase provider with the real journal and store', () => {
  it('publishes success only after durable phases and persisted account state', async () => {
    const f = fixture();
    const result = await f.journal.claimAndRun({
      actorUserId: actor,
      operationId,
      payload,
    });
    expect(result).toMatchObject({
      targetUserId: target,
      outcome: {
        status: 'created',
        operationId,
        account: { id: target, email: payload.email },
      },
    });
    expect(f.operation()?.phase).toBe('active');
    expect(f.create).toHaveBeenCalledTimes(1);
    expect(f.update).toHaveBeenCalledTimes(1);
    await f.journal.claimAndRun({ actorUserId: actor, operationId, payload });
    expect(f.create).toHaveBeenCalledTimes(1);
    expect(f.update).toHaveBeenCalledTimes(1);
  });
  it.each(['loseCreate', 'loseActivation'] as const)(
    'retains the original operation after %s without replay',
    async (failure) => {
      const f = fixture({ [failure]: true });
      const first = await f.journal.claimAndRun({
        actorUserId: actor,
        operationId,
        payload,
      });
      expect(first).toMatchObject({
        targetUserId: target,
        outcome: { status: 'pending', operationId },
      });
      const count = f.mutations();
      await f.journal.claimAndRun({ actorUserId: actor, operationId, payload });
      expect(f.create).toHaveBeenCalledTimes(1);
      expect(f.update).toHaveBeenCalledTimes(
        failure === 'loseActivation' ? 1 : 0
      );
      expect(f.mutations()).toBe(count);
    }
  );
  it.each([{ rollbackClaim: true }, { denyActor: true }])(
    'denies provider calls without persisted admission %j',
    async (options) => {
      const f = fixture(options);
      await expect(
        f.journal.claimAndRun({ actorUserId: actor, operationId, payload })
      ).rejects.toThrow();
      expect(f.create).not.toHaveBeenCalled();
      expect(f.update).not.toHaveBeenCalled();
    }
  );
});
