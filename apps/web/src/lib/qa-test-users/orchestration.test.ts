import { describe, expect, it, vi } from 'vitest';
import { deleteQaUser, deleteQaUsers, type QaDeletionDeps } from './deletion';
import { createQaUsersSchema } from './policy';
import { createQaUsers, type QaProvisionDeps } from './provision';
import type { QaStore } from './store';

const operator = '11111111-1111-4111-8111-111111111111';
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function fakeStore(overrides: Partial<QaStore> = {}): QaStore {
  return {
    reserve: vi.fn(),
    activate: vi.fn(async (userId: string) => ({
      userId,
      personalWorkspaceId: id(900),
      runWorkspaceId: id(901),
    })),
    recordSession: vi.fn(),
    beginDelete: vi.fn(async () => ({
      state: 'deleting' as const,
      authPresent: true,
      runId: 'abcd1234',
      runWorkspaceId: null,
    })),
    finishDelete: vi.fn(async () => ({ state: 'deleted' as const })),
    finishWorkspaceDelete: vi.fn(async () => true),
    listExpired: vi.fn(),
    listUsers: vi.fn(),
    ...overrides,
  };
}

function deletionDeps(store: QaStore): QaDeletionDeps {
  return {
    store,
    deleteWorkspace: vi.fn(async () => undefined),
    deleteAuthUser: vi.fn(async () => 'deleted' as const),
  };
}

describe('deleteQaUser', () => {
  it('deletes the run workspace, then the Auth account, then settles', async () => {
    const store = fakeStore({
      beginDelete: vi.fn(async () => ({
        state: 'deleting' as const,
        authPresent: true,
        runId: 'abcd1234',
        runWorkspaceId: id(901),
      })),
    });
    const deps = deletionDeps(store);
    expect(await deleteQaUser(deps, id(1), 'cron', null)).toBe('deleted');
    expect(deps.deleteWorkspace).toHaveBeenCalledWith(id(901));
    expect(store.finishWorkspaceDelete).toHaveBeenCalledWith(
      'abcd1234',
      'cron',
      null
    );
    expect(deps.deleteAuthUser).toHaveBeenCalledWith(id(1));
    expect(store.finishDelete).toHaveBeenCalled();
  });

  it('never deletes anything the ledger refuses', async () => {
    for (const state of ['not_found', 'busy', 'deleted'] as const) {
      const deps = deletionDeps(
        fakeStore({ beginDelete: vi.fn(async () => ({ state })) })
      );
      expect(await deleteQaUser(deps, id(1), 'operator', operator)).toBe(state);
      expect(deps.deleteAuthUser).not.toHaveBeenCalled();
      expect(deps.deleteWorkspace).not.toHaveBeenCalled();
    }
  });

  it('keeps an unconfirmed Auth delete leased instead of settling', async () => {
    const store = fakeStore();
    const deps = {
      ...deletionDeps(store),
      deleteAuthUser: vi.fn(async () => 'unknown' as const),
    };
    expect(await deleteQaUser(deps, id(1), 'cron', null)).toBe('pending');
    expect(store.finishDelete).not.toHaveBeenCalled();
  });

  it('propagates a ledger refusal of an unmarked account', async () => {
    const refusal = new Error(
      'Refusing to delete an account without the QA test marker'
    );
    const deps = deletionDeps(
      fakeStore({
        beginDelete: vi.fn(async () => {
          throw refusal;
        }),
      })
    );
    await expect(deleteQaUser(deps, id(1), 'operator', operator)).rejects.toBe(
      refusal
    );
    expect(deps.deleteAuthUser).not.toHaveBeenCalled();
  });

  it('stops starting deletions at the deadline', async () => {
    const deps = deletionDeps(fakeStore());
    const result = await deleteQaUsers(deps, [id(1), id(2)], 'cron', null, {
      deadline: Date.now() - 1,
    });
    expect(result.skipped).toEqual([id(1), id(2)]);
    expect(deps.deleteAuthUser).not.toHaveBeenCalled();
  });
});

describe('createQaUsers', () => {
  const reserve = (count: number) =>
    vi.fn(async () => ({
      runId: 'abcd1234',
      purpose: 'meet-rehearsal',
      expiresAt: '2026-11-21T12:00:00Z',
      users: Array.from({ length: count }, (_, index) => ({
        userId: id(index + 1),
        email: `qa+abcd1234-${index + 1}@tutur3u.com`,
        ordinal: index + 1,
        staff: false,
        tier: 'FREE' as const,
      })),
    }));

  function provisionDeps(store: QaStore, createUser = vi.fn()) {
    createUser.mockImplementation(async ({ id: userId }: { id: string }) => ({
      data: { user: { id: userId } },
      error: null,
    }));
    const upsert = vi.fn(async () => ({ error: null }));
    const deps = {
      ...deletionDeps(store),
      admin: {
        auth: { admin: { createUser } },
        from: vi.fn(() => ({ upsert })),
      },
    } as unknown as QaProvisionDeps;
    return { deps, createUser };
  }

  it('creates marked accounts with unique passwords and activates each', async () => {
    const store = fakeStore({ reserve: reserve(3) });
    const { deps, createUser } = provisionDeps(store);
    const input = createQaUsersSchema.parse({
      count: 3,
      purpose: 'meet-rehearsal',
      ttlSeconds: 86_400,
      workspace: true,
    });
    const result = await createQaUsers(deps, operator, input);
    expect(result.users.map((user) => user.ordinal)).toEqual([1, 2, 3]);
    expect(new Set(result.users.map((user) => user.password)).size).toBe(3);
    expect(result.runWorkspaceId).toBe(id(901));
    for (const [call] of createUser.mock.calls) {
      expect(call.email_confirm).toBe(true);
      expect(call.app_metadata).toMatchObject({
        qa_test: true,
        qa_run: 'abcd1234',
        qa_owner: operator,
      });
    }
    expect(store.activate).toHaveBeenCalledTimes(3);
  });

  it('rolls a failed account back through the marker-checked delete', async () => {
    const store = fakeStore({ reserve: reserve(2) });
    const createUser = vi.fn();
    const { deps } = provisionDeps(store, createUser);
    createUser.mockImplementationOnce(async () => ({
      data: { user: null },
      error: { code: 'unexpected_failure' },
    }));
    const input = createQaUsersSchema.parse({
      count: 2,
      purpose: 'meet-rehearsal',
      ttlSeconds: 3600,
    });
    const result = await createQaUsers(deps, operator, input);
    expect(result.failed).toEqual([
      { userId: id(1), email: 'qa+abcd1234-1@tutur3u.com', cleanup: 'deleted' },
    ]);
    expect(JSON.stringify(result.failed)).not.toContain('password');
    expect(store.beginDelete).toHaveBeenCalledWith(id(1), 'operator', operator);
  });
});

describe('createQaUsersSchema', () => {
  it('requires purpose and TTL for a new run and bounds them', () => {
    expect(createQaUsersSchema.safeParse({ count: 1 }).success).toBe(false);
    expect(
      createQaUsersSchema.safeParse({
        count: 1,
        purpose: 'x',
        ttlSeconds: 3600,
      }).success
    ).toBe(false);
    expect(
      createQaUsersSchema.safeParse({
        count: 51,
        purpose: 'meet',
        ttlSeconds: 3600,
      }).success
    ).toBe(false);
    expect(
      createQaUsersSchema.safeParse({
        count: 1,
        purpose: 'meet',
        ttlSeconds: 73 * 3600,
      }).success
    ).toBe(false);
    expect(
      createQaUsersSchema.safeParse({ count: 40, runId: 'abcd1234' }).success
    ).toBe(true);
    expect(
      createQaUsersSchema.parse({
        count: 1,
        purpose: 'meet',
        ttlSeconds: 3600,
        tier: 'pro',
      }).tier
    ).toBe('PRO');
  });
});
