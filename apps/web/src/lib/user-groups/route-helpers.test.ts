import { describe, expect, it, vi } from 'vitest';
import { hasUserGroupPostInWorkspace } from './route-helpers';

function createPostAccessClient(result: { data: unknown; error: unknown }) {
  const eqCalls: Array<[string, unknown]> = [];
  const query = {
    eq: vi.fn((column: string, value: unknown) => {
      eqCalls.push([column, value]);
      return query;
    }),
    maybeSingle: vi.fn(async () => result),
    select: vi.fn(() => query),
  };
  const from = vi.fn(() => query);
  const schema = vi.fn(() => ({ from }));

  return {
    client: { schema },
    eqCalls,
    from,
    query,
    schema,
  };
}

describe('user group route helpers', () => {
  it('binds post access checks to the route workspace and group', async () => {
    const mocks = createPostAccessClient({
      data: { id: 'post-1' },
      error: null,
    });

    await expect(
      hasUserGroupPostInWorkspace({
        sbAdmin: mocks.client as never,
        wsId: 'ws-1',
        groupId: 'group-1',
        postId: 'post-1',
      })
    ).resolves.toBe(true);

    expect(mocks.schema).toHaveBeenCalledWith('private');
    expect(mocks.from).toHaveBeenCalledWith('user_group_posts');
    expect(mocks.query.select).toHaveBeenCalledWith(
      expect.stringContaining('workspace_user_groups!inner(ws_id)')
    );
    expect(mocks.eqCalls).toEqual([
      ['id', 'post-1'],
      ['workspace_user_groups.ws_id', 'ws-1'],
      ['group_id', 'group-1'],
    ]);
  });

  it('does not authorize posts outside the requested group or workspace', async () => {
    const mocks = createPostAccessClient({
      data: null,
      error: null,
    });

    await expect(
      hasUserGroupPostInWorkspace({
        sbAdmin: mocks.client as never,
        wsId: 'ws-1',
        groupId: 'group-1',
        postId: 'post-1',
      })
    ).resolves.toBe(false);
  });
});
