import { beforeEach, describe, expect, it, vi } from 'vitest';

const USER_ID = 'user-1';
const WORKSPACE_ID = 'ws-1';

type QueryResult = { data?: unknown; error?: unknown };

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  createClient: vi.fn(),
  checkWorkspaceCreationLimit: vi.fn(),
  createPolarClient: vi.fn(),
  getOrCreatePolarCustomer: vi.fn(),
  createFreeSubscription: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: unknown[]) => mocks.createAdminClient(...args),
  createClient: (...args: unknown[]) => mocks.createClient(...args),
}));

vi.mock('@tuturuuu/utils/workspace-limits', () => ({
  checkWorkspaceCreationLimit: (...args: unknown[]) =>
    mocks.checkWorkspaceCreationLimit(...args),
}));

vi.mock('@tuturuuu/payment/polar/server', () => ({
  createPolarClient: () => mocks.createPolarClient(),
}));

vi.mock('@tuturuuu/payment-core/customer-helper', () => ({
  getOrCreatePolarCustomer: (...args: unknown[]) =>
    mocks.getOrCreatePolarCustomer(...args),
}));

vi.mock('@tuturuuu/payment-core/subscription-helper', () => ({
  createFreeSubscription: (...args: unknown[]) =>
    mocks.createFreeSubscription(...args),
}));

vi.mock('next/navigation', () => ({ redirect: vi.fn() }));

interface Call {
  table: string;
  op: string;
  payload?: unknown;
  filters: Array<[string, unknown]>;
}

/**
 * Minimal Supabase query-builder fake. Each terminal call resolves through
 * `resolve(call)`, and every call is recorded for assertions.
 */
function createFakeClient(resolve: (call: Call) => QueryResult) {
  const calls: Call[] = [];

  const from = (table: string) => {
    const call: Call = { table, op: 'select', filters: [] };
    const builder: Record<string, unknown> = {};
    const setOp = (op: string) => (payload?: unknown) => {
      call.op = op;
      call.payload = payload;
      return builder;
    };
    builder.insert = setOp('insert');
    builder.upsert = setOp('upsert');
    builder.update = setOp('update');
    builder.delete = setOp('delete');
    builder.select = (columns?: unknown) => {
      if (call.op === 'select') call.payload = columns;
      return builder;
    };
    builder.eq = (column: string, value: unknown) => {
      call.filters.push([column, value]);
      return builder;
    };
    const finish = () => {
      calls.push(call);
      return Promise.resolve(resolve(call));
    };
    builder.single = finish;
    builder.maybeSingle = finish;
    // biome-ignore lint/suspicious/noThenProperty: mimics the awaitable query builder.
    builder.then = (
      onFulfilled: (value: QueryResult) => unknown,
      onRejected?: (reason: unknown) => unknown
    ) => finish().then(onFulfilled, onRejected);
    return builder;
  };

  return { calls, from };
}

function setup(adminResolve: (call: Call) => QueryResult) {
  const userClient = createFakeClient((call) => {
    if (call.table === 'onboarding_progress') {
      return { data: { user_id: USER_ID, completed_steps: [] }, error: null };
    }
    if (call.table === 'workspaces' && call.op === 'insert') {
      return { data: { id: WORKSPACE_ID }, error: null };
    }
    if (call.table === 'workspace_members') {
      // Mirrors production RLS: the creator is already a member, so every
      // authenticated insert/upsert fails the WITH CHECK clause.
      return {
        data: null,
        error: {
          code: '42501',
          message: 'new row violates row-level security',
        },
      };
    }
    return { data: null, error: null };
  });
  const user = {
    ...userClient,
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: USER_ID, email: 'creator@example.com' } },
        error: null,
      }),
    },
  };
  const admin = createFakeClient(adminResolve);

  mocks.createClient.mockResolvedValue(user);
  mocks.createAdminClient.mockResolvedValue(admin);

  return { admin, user };
}

const isMemberLookup = (call: Call) =>
  call.table === 'workspace_members' && call.op === 'select';
const isMemberInsert = (call: Call) =>
  call.table === 'workspace_members' && call.op === 'insert';
const isWorkspaceDelete = (call: Call) =>
  call.table === 'workspaces' && call.op === 'delete';

describe('createWorkspaceFromOnboarding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    mocks.checkWorkspaceCreationLimit.mockResolvedValue({ canCreate: true });
    mocks.createPolarClient.mockReturnValue({});
    mocks.getOrCreatePolarCustomer.mockResolvedValue({});
    mocks.createFreeSubscription.mockResolvedValue({ status: 'skipped' });
  });

  it('succeeds without deleting when the creator trigger already added membership', async () => {
    const { admin, user } = setup((call) =>
      isMemberLookup(call)
        ? { data: { user_id: USER_ID }, error: null }
        : { data: null, error: null }
    );
    const { createWorkspaceFromOnboarding } = await import('./actions');

    const result = await createWorkspaceFromOnboarding('Acme');

    expect(result).toEqual({ success: true, workspaceId: WORKSPACE_ID });
    expect(admin.calls.find(isMemberLookup)?.filters).toEqual([
      ['ws_id', WORKSPACE_ID],
      ['user_id', USER_ID],
    ]);
    expect(admin.calls.some(isMemberInsert)).toBe(false);
    expect([...admin.calls, ...user.calls].some(isWorkspaceDelete)).toBe(false);
    expect(user.calls.some((call) => call.table === 'workspace_members')).toBe(
      false
    );
  });

  it('inserts the creator membership with the service role when it is missing', async () => {
    const { admin, user } = setup(() => ({ data: null, error: null }));
    const { createWorkspaceFromOnboarding } = await import('./actions');

    const result = await createWorkspaceFromOnboarding('Acme');

    expect(result).toEqual({ success: true, workspaceId: WORKSPACE_ID });
    expect(admin.calls.find(isMemberInsert)?.payload).toEqual({
      ws_id: WORKSPACE_ID,
      user_id: USER_ID,
    });
    expect([...admin.calls, ...user.calls].some(isWorkspaceDelete)).toBe(false);
  });

  it('cleans up the workspace and returns an error on a genuine membership failure', async () => {
    const { admin } = setup((call) => {
      if (isMemberLookup(call)) return { data: null, error: null };
      if (isMemberInsert(call)) {
        return {
          data: null,
          error: { code: '23503', message: 'fk violation' },
        };
      }
      return { data: null, error: null };
    });
    const { createWorkspaceFromOnboarding } = await import('./actions');

    const result = await createWorkspaceFromOnboarding('Acme');

    expect(result).toEqual({
      success: false,
      error: 'Failed to add user to workspace',
    });
    expect(admin.calls.find(isWorkspaceDelete)?.filters).toEqual([
      ['id', WORKSPACE_ID],
    ]);
  });

  it('reports a failed workspace cleanup', async () => {
    const { admin } = setup((call) => {
      if (isMemberInsert(call))
        return { data: null, error: { code: 'failure' } };
      if (isWorkspaceDelete(call))
        return { data: null, error: { code: 'failure' } };
      return { data: null, error: null };
    });
    const { createWorkspaceFromOnboarding } = await import('./actions');
    const result = await createWorkspaceFromOnboarding('Acme');
    expect(result).toEqual({
      success: false,
      error: 'Failed to clean up workspace',
    });
    expect(admin.calls.some(isWorkspaceDelete)).toBe(true);
    expect(console.error).toHaveBeenCalledWith('Error cleaning up workspace:', {
      code: 'failure',
    });
  });

  it('uses the session user even when an update includes a different user id', async () => {
    const { user } = setup(() => ({ data: null, error: null }));
    const { updateOnboardingProgress } = await import('./actions');
    await updateOnboardingProgress({ user_id: 'other-user' } as never);
    const update = user.calls.find(
      (call) => call.table === 'onboarding_progress' && call.op === 'upsert'
    );
    expect(update?.payload).toMatchObject({ user_id: USER_ID });
  });

  it('reads onboarding progress for the authenticated user', async () => {
    const { user } = setup(() => ({ data: null, error: null }));
    const { getUserOnboardingProgress } = await import('./actions');
    await getUserOnboardingProgress();
    const read = user.calls.find(
      (call) => call.table === 'onboarding_progress'
    );
    expect(read?.filters).toEqual([['user_id', USER_ID]]);
  });

  it('does not write onboarding progress without an authenticated user', async () => {
    const { user } = setup(() => ({ data: null, error: null }));
    user.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: null,
    } as never);
    const { updateOnboardingProgress } = await import('./actions');
    expect(await updateOnboardingProgress({})).toBeNull();
    expect(user.calls).toEqual([]);
  });
});
