import { beforeEach, describe, expect, it, vi } from 'vitest';

const WS_ID = '11111111-1111-4111-8111-111111111111';
const GROUP_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';
const CREATOR_ID = '44444444-4444-4444-8444-444444444444';

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  admin: vi.fn(),
  insert: vi.fn(),
  groupLookup: vi.fn(),
  userLookup: vi.fn(),
  can: vi.fn(),
  feedbackLookup: vi.fn(),
  feedbackLookupEq: vi.fn(),
  listResult: vi.fn(),
  listEq: vi.fn(),
  update: vi.fn(),
}));

vi.mock('./workspace', () => ({ getContactsWorkspaceAccess: mocks.access }));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.admin,
}));

import {
  changeFeedback,
  createFeedback,
  listFeedbacks,
} from './user-feedbacks';

function lookup(result: () => unknown) {
  const query = {
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(result),
    select: vi.fn(() => query),
  };
  return query;
}

function request(requireAttention = true) {
  return new Request(
    `https://contacts.tuturuuu.com/api/v1/workspaces/${WS_ID}/users/feedbacks`,
    {
      method: 'POST',
      body: JSON.stringify({
        userId: USER_ID,
        groupId: GROUP_ID,
        content: '  Needs follow-up  ',
        require_attention: requireAttention,
      }),
    }
  );
}

describe('Contacts feedback creation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.can.mockReturnValue(true);
    mocks.access.mockResolvedValue({
      permissions: { containsPermission: mocks.can },
      user: { virtual_user_id: CREATOR_ID },
    });
    mocks.groupLookup.mockResolvedValue({
      data: { id: GROUP_ID },
      error: null,
    });
    mocks.userLookup.mockResolvedValue({ data: { id: USER_ID }, error: null });
    mocks.insert.mockResolvedValue({ error: null });
    mocks.feedbackLookup.mockResolvedValue({
      data: { id: 'feedback-1' },
      error: null,
    });
    mocks.listResult.mockResolvedValue({ data: [], count: 0, error: null });
    mocks.update.mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });
    mocks.admin.mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === 'workspace_users') return lookup(mocks.userLookup);
        if (table === 'workspace_user_groups') return lookup(mocks.groupLookup);
        if (table === 'user_feedbacks') {
          const readQuery = {
            eq: vi.fn((column: string, value: unknown) => {
              mocks.listEq(column, value);
              mocks.feedbackLookupEq(column, value);
              return readQuery;
            }),
            maybeSingle: mocks.feedbackLookup,
            order: vi.fn(() => readQuery),
            range: mocks.listResult,
          };
          return {
            insert: mocks.insert,
            select: vi.fn(() => readQuery),
            update: mocks.update,
          };
        }
        throw new Error(`Unexpected table: ${table}`);
      }),
    });
  });

  it('creates attention feedback with the satellite actor linked to the workspace', async () => {
    const response = await createFeedback(request(), {
      wsId: WS_ID,
      groupId: GROUP_ID,
      userId: USER_ID,
    });

    expect(response.status).toBe(200);
    expect(mocks.can).toHaveBeenCalledWith('update_user_groups_scores');
    expect(mocks.insert).toHaveBeenCalledWith({
      user_id: USER_ID,
      group_id: GROUP_ID,
      content: 'Needs follow-up',
      require_attention: true,
      creator_id: CREATOR_ID,
    });
  });

  it('does not write when the Contacts app session has no workspace access', async () => {
    mocks.access.mockResolvedValue(null);

    const response = await createFeedback(request(), { wsId: WS_ID });

    expect(response.status).toBe(404);
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it('does not write without feedback management permission', async () => {
    mocks.can.mockReturnValue(false);

    const response = await createFeedback(request(), { wsId: WS_ID });

    expect(response.status).toBe(403);
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it('does not write a feedback for a user outside the workspace', async () => {
    mocks.userLookup.mockResolvedValue({ data: null, error: null });

    const response = await createFeedback(request(), { wsId: WS_ID });

    expect(response.status).toBe(404);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('lists a group member feedback history within the workspace', async () => {
    const response = await listFeedbacks(
      new Request(
        `https://contacts.tuturuuu.com/api/v1/workspaces/${WS_ID}/user-groups/${GROUP_ID}/members/${USER_ID}/feedbacks?offset=0&limit=3`
      ),
      { wsId: WS_ID, groupId: GROUP_ID, userId: USER_ID }
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: [],
      count: 0,
      hasMore: false,
    });
    expect(mocks.can).toHaveBeenCalledWith('view_user_groups');
    expect(mocks.listEq).toHaveBeenCalledWith('user.ws_id', WS_ID);
    expect(mocks.listEq).toHaveBeenCalledWith('group_id', GROUP_ID);
    expect(mocks.listEq).toHaveBeenCalledWith('user_id', USER_ID);
  });

  it('does not update feedback outside the selected group and workspace', async () => {
    mocks.feedbackLookup.mockResolvedValue({ data: null, error: null });
    const response = await changeFeedback(
      new Request(
        `https://contacts.tuturuuu.com/api/v1/workspaces/${WS_ID}/users/feedbacks?feedbackId=feedback-1`,
        {
          method: 'PUT',
          body: JSON.stringify({
            content: 'Follow-up',
            require_attention: true,
          }),
        }
      ),
      { wsId: WS_ID, groupId: GROUP_ID, userId: USER_ID },
      'PUT'
    );

    expect(response.status).toBe(404);
    expect(mocks.feedbackLookupEq).toHaveBeenCalledWith('user.ws_id', WS_ID);
    expect(mocks.feedbackLookupEq).toHaveBeenCalledWith('group_id', GROUP_ID);
    expect(mocks.feedbackLookupEq).toHaveBeenCalledWith('user_id', USER_ID);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
