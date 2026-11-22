import { describe, expect, it, vi } from 'vitest';
import {
  removeExternalProjectTeamMember,
  WORKSPACE_CREATOR_PROTECTED,
  WORKSPACE_LAST_MANAGER,
} from './team-member-removal';

const WS = 'workspace-1';
const CREATOR = '11111111-1111-4111-8111-111111111111';
const MEMBER = '22222222-2222-4222-8222-222222222222';
const ACTOR = '33333333-3333-4333-8333-333333333333';

type Filter = [op: string, column: string, value: unknown];

/** An admin client that records every statement it is asked to run. */
function createAccess(
  workspace:
    | { creator_id: string | null }
    | null
    | { error: { code: string } } = { creator_id: CREATOR },
  rpcResult: { data: unknown; error: unknown } = {
    data: 'removed',
    error: null,
  }
) {
  const statements: { filters: Filter[]; op: string; table: string }[] = [];
  const rpcCalls: { args: Record<string, unknown>; fn: string }[] = [];

  const chain = (table: string, op: string) => {
    const statement = { filters: [] as Filter[], op, table };
    statements.push(statement);
    const result = () => {
      if (table === 'workspaces')
        return workspace && 'error' in workspace
          ? { data: null, error: workspace.error }
          : { data: workspace, error: null };
      if (table === 'workspace_members_and_invites')
        return { data: [{ id: 'invited-user' }], error: null };
      return { error: null };
    };
    const query: Record<string, unknown> = {};
    for (const filter of ['eq', 'in'])
      query[filter] = (column: string, value: unknown) => {
        statement.filters.push([filter, column, value]);
        return query;
      };
    query.maybeSingle = async () => result();
    query.then = (resolve: (value: unknown) => unknown) =>
      Promise.resolve(result()).then(resolve);
    return query;
  };

  const admin = {
    from: (table: string) => ({
      delete: () => chain(table, 'delete'),
      select: () => chain(table, 'select'),
    }),
    rpc: async (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ args, fn });
      return rpcResult;
    },
  };

  return {
    access: { admin, normalizedWorkspaceId: WS, user: { id: ACTOR } },
    deletes: () =>
      statements
        .filter((statement) => statement.op === 'delete')
        .map(({ filters, table }) => ({ filters, table })),
    rpcCalls,
  };
}

const guardedCall = (userId: string) => ({
  args: { p_actor_id: ACTOR, p_user_id: userId, p_ws_id: WS },
  fn: 'remove_workspace_member_guarded',
});

const remove = (
  access: ReturnType<typeof createAccess>['access'],
  query: string
) =>
  removeExternalProjectTeamMember({
    access: access as never,
    request: new Request(`http://localhost/access?${query}`, {
      method: 'DELETE',
    }),
  });

describe('removing a CMS team member', () => {
  it('never removes the workspace creator, whatever the id casing or padding', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    for (const id of [CREATOR, CREATOR.toUpperCase(), `%20${CREATOR}%20`]) {
      const { access, deletes, rpcCalls } = createAccess();
      const response = await remove(access, `id=${id}`);

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toEqual({
        code: WORKSPACE_CREATOR_PROTECTED,
        message: 'The workspace creator cannot be removed',
      });
      expect(deletes()).toEqual([]);
      expect(rpcCalls).toEqual([]);
    }

    // An email on the same request does not get an invitation cancelled either.
    const { access, deletes } = createAccess();
    const response = await remove(access, `id=${CREATOR}&email=a@example.com`);
    expect(response.status).toBe(403);
    expect(deletes()).toEqual([]);
    error.mockRestore();
  });

  it('removes nothing when the creator cannot be read', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    for (const workspace of [
      null,
      { creator_id: null },
      { error: { code: 'PGRST301' } },
    ]) {
      const { access, deletes, rpcCalls } = createAccess(workspace);
      const response = await remove(access, `id=${MEMBER}`);

      expect(response.status).toBe(500);
      expect(deletes()).toEqual([]);
      expect(rpcCalls).toEqual([]);
    }

    expect(error).toHaveBeenCalledTimes(3);
    error.mockRestore();
  });

  it('removes another member through the guarded function, then their invitation in this workspace only', async () => {
    for (const data of ['removed', 'not_found']) {
      const { access, deletes, rpcCalls } = createAccess(undefined, {
        data,
        error: null,
      });
      const response = await remove(access, `id=${MEMBER}&email=m@example.com`);

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        message: 'success',
        workspace_deleted: false,
      });
      expect(rpcCalls).toEqual([guardedCall(MEMBER)]);
      expect(deletes()).toEqual([
        {
          filters: [
            ['eq', 'ws_id', WS],
            ['eq', 'user_id', MEMBER],
          ],
          table: 'workspace_invites',
        },
        {
          filters: [
            ['eq', 'ws_id', WS],
            ['eq', 'email', 'm@example.com'],
          ],
          table: 'workspace_email_invites',
        },
      ]);
    }
  });

  it('cancels no invitation when the guarded function refuses or fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const cases = [
      {
        body: {
          code: WORKSPACE_CREATOR_PROTECTED,
          message: 'The workspace creator cannot be removed',
        },
        result: { data: 'creator_protected', error: null },
        status: 403,
      },
      {
        body: {
          code: WORKSPACE_LAST_MANAGER,
          message: 'At least one member must be able to manage members',
        },
        result: { data: 'last_manager', error: null },
        status: 409,
      },
      {
        body: { error: 'Forbidden' },
        result: { data: 'forbidden', error: null },
        status: 403,
      },
      {
        body: { message: 'Error removing team member' },
        result: { data: null, error: { code: '42501' } },
        status: 500,
      },
      {
        body: { message: 'Error removing team member' },
        result: { data: 'REMOVED', error: null },
        status: 500,
      },
      {
        body: { message: 'Error removing team member' },
        result: { data: 'removed', error: { code: 'P0001' } },
        status: 500,
      },
    ];

    for (const { body, result, status } of cases) {
      const { access, deletes, rpcCalls } = createAccess(undefined, result);
      const response = await remove(access, `id=${MEMBER}&email=m@example.com`);

      expect(response.status).toBe(status);
      await expect(response.json()).resolves.toEqual(body);
      expect(rpcCalls).toEqual([guardedCall(MEMBER)]);
      expect(deletes()).toEqual([]);
    }

    expect(error).toHaveBeenCalledTimes(3);
    error.mockRestore();
  });

  it('cancels an invitation by email without touching a membership', async () => {
    const { access, deletes, rpcCalls } = createAccess();
    const response = await remove(access, 'email=invited@example.com');

    expect(response.status).toBe(200);
    expect(rpcCalls).toEqual([]);
    expect(deletes()).toEqual([
      {
        filters: [
          ['eq', 'ws_id', WS],
          ['in', 'user_id', ['invited-user']],
        ],
        table: 'workspace_invites',
      },
      {
        filters: [
          ['eq', 'ws_id', WS],
          ['eq', 'email', 'invited@example.com'],
        ],
        table: 'workspace_email_invites',
      },
    ]);
  });

  it('accepts only the canonical uuid spelling, so no other spelling of the creator gets through', async () => {
    const hex = CREATOR.replaceAll('-', '');
    const spellings = [
      hex,
      `{${CREATOR}}`,
      `%7B${CREATOR}%7D`,
      hex.match(/.{4}/g)?.join('-') ?? '',
      `urn:uuid:${CREATOR}`,
      'not-a-uuid',
    ];

    for (const id of spellings) {
      const { access, deletes, rpcCalls } = createAccess();
      const response = await remove(access, `id=${id}`);

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        message: 'Invalid member identifier',
      });
      expect(deletes()).toEqual([]);
      expect(rpcCalls).toEqual([]);
    }
  });

  it('asks for an identifier', async () => {
    const { access, deletes } = createAccess();
    const response = await remove(access, 'id=%20');

    expect(response.status).toBe(400);
    expect(deletes()).toEqual([]);
  });
});
