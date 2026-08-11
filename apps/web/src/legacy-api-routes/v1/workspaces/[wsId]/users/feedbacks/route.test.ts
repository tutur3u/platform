import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ACTOR_AUTH_ID = '11111111-1111-4111-8111-111111111111';
const CREATOR_ID = '22222222-2222-4222-8222-222222222222';
const FEEDBACK_ID = '33333333-3333-4333-8333-333333333333';
const GROUP_ID = '44444444-4444-4444-8444-444444444444';
const USER_ID = '55555555-5555-4555-8555-555555555555';
const WORKSPACE_ID = '66666666-6666-4666-8666-666666666666';

const mocks = vi.hoisted(() => ({
  actorLinkEq: vi.fn(),
  actorLinkResult: vi.fn(),
  containsPermission: vi.fn(),
  createAdminClient: vi.fn(),
  createClient: vi.fn(),
  deleteFeedback: vi.fn(),
  deleteFeedbackEq: vi.fn(),
  feedbackLookupEq: vi.fn(),
  feedbackLookupResult: vi.fn(),
  groupEq: vi.fn(),
  groupResult: vi.fn(),
  insertFeedback: vi.fn(),
  getPermissions: vi.fn(),
  resolveAuthenticatedSessionUser: vi.fn(),
  targetUserEq: vi.fn(),
  targetUserResult: vi.fn(),
  updateFeedback: vi.fn(),
  updateFeedbackEq: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: mocks.resolveAuthenticatedSessionUser,
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
  createClient: mocks.createClient,
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: mocks.getPermissions,
}));

function lookupQuery(
  eqMock: (column: string, value: unknown) => unknown,
  resultMock: () => unknown
) {
  const query = {
    eq: vi.fn((column: string, value: unknown) => {
      eqMock(column, value);
      return query;
    }),
    maybeSingle: vi.fn(resultMock),
    select: vi.fn(() => query),
  };
  return query;
}

function createAdminClientDouble() {
  return {
    from: vi.fn((table: string) => {
      if (table === 'workspace_user_linked_users') {
        return lookupQuery(mocks.actorLinkEq, mocks.actorLinkResult);
      }
      if (table === 'workspace_users') {
        return lookupQuery(mocks.targetUserEq, mocks.targetUserResult);
      }
      if (table === 'workspace_user_groups') {
        return lookupQuery(mocks.groupEq, mocks.groupResult);
      }
      if (table === 'user_feedbacks') {
        return {
          delete: mocks.deleteFeedback,
          insert: mocks.insertFeedback,
          select: vi.fn(() =>
            lookupQuery(mocks.feedbackLookupEq, mocks.feedbackLookupResult)
          ),
          update: mocks.updateFeedback,
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    }),
  };
}

function request(
  method: 'DELETE' | 'POST' | 'PUT',
  body?: unknown,
  feedbackId?: string
) {
  const url = new URL(
    `http://localhost/api/v1/workspaces/${WORKSPACE_ID}/users/feedbacks`
  );
  if (feedbackId) url.searchParams.set('feedbackId', feedbackId);
  return new NextRequest(url, {
    body: body === undefined ? undefined : JSON.stringify(body),
    method,
  });
}

function params() {
  return { params: Promise.resolve({ wsId: WORKSPACE_ID }) };
}

function validCreateBody() {
  return {
    content: '  Helpful feedback  ',
    groupId: GROUP_ID,
    require_attention: true,
    userId: USER_ID,
  };
}

function expectNoMutation() {
  expect(mocks.insertFeedback).not.toHaveBeenCalled();
  expect(mocks.updateFeedback).not.toHaveBeenCalled();
  expect(mocks.deleteFeedback).not.toHaveBeenCalled();
}

describe('workspace feedback mutation authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.containsPermission.mockImplementation(
      (permission: string) => permission === 'update_user_groups_scores'
    );
    mocks.getPermissions.mockResolvedValue({
      containsPermission: mocks.containsPermission,
    });
    mocks.createClient.mockResolvedValue({ auth: {} });
    mocks.createAdminClient.mockResolvedValue(createAdminClientDouble());
    mocks.resolveAuthenticatedSessionUser.mockResolvedValue({
      user: { id: ACTOR_AUTH_ID },
    });
    mocks.actorLinkResult.mockResolvedValue({
      data: { virtual_user_id: CREATOR_ID },
      error: null,
    });
    mocks.targetUserResult.mockResolvedValue({
      data: { id: USER_ID },
      error: null,
    });
    mocks.groupResult.mockResolvedValue({
      data: { id: GROUP_ID },
      error: null,
    });
    mocks.feedbackLookupResult.mockResolvedValue({
      data: { id: FEEDBACK_ID },
      error: null,
    });
    mocks.insertFeedback.mockResolvedValue({ error: null });
    mocks.updateFeedbackEq.mockResolvedValue({ error: null });
    mocks.updateFeedback.mockReturnValue({ eq: mocks.updateFeedbackEq });
    mocks.deleteFeedbackEq.mockResolvedValue({ error: null });
    mocks.deleteFeedback.mockReturnValue({ eq: mocks.deleteFeedbackEq });
  });

  describe('POST', () => {
    it('returns 404 without workspace access', async () => {
      mocks.getPermissions.mockResolvedValue(null);
      const { POST } = await import('./route');
      const input = request('POST', validCreateBody());

      const response = await POST(input, params());

      expect(response.status).toBe(404);
      expect(mocks.getPermissions).toHaveBeenCalledWith({
        request: input,
        wsId: WORKSPACE_ID,
      });
      expectNoMutation();
    });

    it('returns 403 without score-update permission', async () => {
      mocks.containsPermission.mockReturnValue(false);
      const { POST } = await import('./route');

      const response = await POST(request('POST', validCreateBody()), params());

      expect(response.status).toBe(403);
      expect(mocks.containsPermission).toHaveBeenCalledWith(
        'update_user_groups_scores'
      );
      expectNoMutation();
    });

    it('rejects a schema-invalid JSON body', async () => {
      const { POST } = await import('./route');

      const response = await POST(
        request('POST', { content: '', groupId: 'bad', userId: 'bad' }),
        params()
      );

      expect(response.status).toBe(400);
      expectNoMutation();
    });

    it('returns 401 when the platform session actor is absent', async () => {
      mocks.resolveAuthenticatedSessionUser.mockResolvedValue({ user: null });
      const { POST } = await import('./route');

      const response = await POST(request('POST', validCreateBody()), params());

      expect(response.status).toBe(401);
      expectNoMutation();
    });

    it('returns 403 when the actor has no workspace-user link', async () => {
      mocks.actorLinkResult.mockResolvedValue({ data: null, error: null });
      const { POST } = await import('./route');

      const response = await POST(request('POST', validCreateBody()), params());

      expect(response.status).toBe(403);
      expect(mocks.actorLinkEq.mock.calls).toEqual([
        ['platform_user_id', ACTOR_AUTH_ID],
        ['ws_id', WORKSPACE_ID],
      ]);
      expectNoMutation();
    });

    it('returns 404 for a missing or foreign-workspace target user', async () => {
      mocks.targetUserResult.mockResolvedValue({ data: null, error: null });
      const { POST } = await import('./route');

      const response = await POST(request('POST', validCreateBody()), params());

      expect(response.status).toBe(404);
      expect(mocks.targetUserEq.mock.calls).toEqual([
        ['id', USER_ID],
        ['ws_id', WORKSPACE_ID],
      ]);
      expectNoMutation();
    });

    it('returns 404 for a missing or foreign-workspace group', async () => {
      mocks.groupResult.mockResolvedValue({ data: null, error: null });
      const { POST } = await import('./route');

      const response = await POST(request('POST', validCreateBody()), params());

      expect(response.status).toBe(404);
      expect(mocks.groupEq.mock.calls).toEqual([
        ['id', GROUP_ID],
        ['ws_id', WORKSPACE_ID],
      ]);
      expectNoMutation();
    });

    it('inserts feedback with the linked workspace creator', async () => {
      const { POST } = await import('./route');
      const input = request('POST', validCreateBody());

      const response = await POST(input, params());

      expect(response.status).toBe(200);
      expect(mocks.createClient).toHaveBeenCalledWith(input);
      expect(mocks.insertFeedback).toHaveBeenCalledWith({
        content: 'Helpful feedback',
        creator_id: CREATOR_ID,
        group_id: GROUP_ID,
        require_attention: true,
        user_id: USER_ID,
      });
    });

    it('preserves the PostgREST rate-limit response contract', async () => {
      mocks.insertFeedback.mockResolvedValue({
        error: {
          code: 'RATE_LIMITED',
          details: 'Retry after 11 seconds',
          message: 'Rate limit exceeded',
        },
      });
      const { POST } = await import('./route');

      const response = await POST(request('POST', validCreateBody()), params());

      expect(response.status).toBe(429);
      expect(response.headers.get('Retry-After')).toBe('11');
      await expect(response.json()).resolves.toEqual({
        code: 'RATE_LIMIT_EXCEEDED',
        error: 'Too Many Requests',
        message: 'Rate limit exceeded',
      });
    });

    it('returns the generic database failure envelope', async () => {
      mocks.insertFeedback.mockResolvedValue({
        error: { code: 'PGRST500' },
      });
      const consoleError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);
      const { POST } = await import('./route');

      const response = await POST(request('POST', validCreateBody()), params());

      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toEqual({
        message: 'Error creating feedback',
      });
      expect(consoleError).toHaveBeenCalled();
      consoleError.mockRestore();
    });
  });

  describe('PUT', () => {
    it('denies callers without permission before mutation', async () => {
      mocks.containsPermission.mockReturnValue(false);
      const { PUT } = await import('./route');

      const response = await PUT(
        request('PUT', { content: 'Updated' }, FEEDBACK_ID),
        params()
      );

      expect(response.status).toBe(403);
      expectNoMutation();
    });

    it('requires a feedback ID', async () => {
      const { PUT } = await import('./route');

      const response = await PUT(
        request('PUT', { content: 'Updated' }),
        params()
      );

      expect(response.status).toBe(400);
      expectNoMutation();
    });

    it('rejects malformed update content', async () => {
      const { PUT } = await import('./route');

      const response = await PUT(
        request('PUT', { content: '' }, FEEDBACK_ID),
        params()
      );

      expect(response.status).toBe(400);
      expectNoMutation();
    });

    it('rejects missing or foreign-workspace feedback', async () => {
      mocks.feedbackLookupResult.mockResolvedValue({
        data: null,
        error: null,
      });
      const { PUT } = await import('./route');

      const response = await PUT(
        request('PUT', { content: 'Updated' }, FEEDBACK_ID),
        params()
      );

      expect(response.status).toBe(404);
      expect(mocks.feedbackLookupEq.mock.calls).toEqual([
        ['id', FEEDBACK_ID],
        ['user.ws_id', WORKSPACE_ID],
      ]);
      expectNoMutation();
    });

    it('updates contained feedback with validated fields', async () => {
      const { PUT } = await import('./route');

      const response = await PUT(
        request(
          'PUT',
          { content: '  Updated  ', require_attention: true },
          FEEDBACK_ID
        ),
        params()
      );

      expect(response.status).toBe(200);
      expect(mocks.feedbackLookupEq.mock.calls).toEqual([
        ['id', FEEDBACK_ID],
        ['user.ws_id', WORKSPACE_ID],
      ]);
      expect(mocks.updateFeedback).toHaveBeenCalledWith({
        content: 'Updated',
        require_attention: true,
      });
      expect(mocks.updateFeedbackEq).toHaveBeenCalledWith('id', FEEDBACK_ID);
    });

    it('returns the generic update failure envelope', async () => {
      mocks.updateFeedbackEq.mockResolvedValue({
        error: { code: 'PGRST500' },
      });
      const consoleError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);
      const { PUT } = await import('./route');

      const response = await PUT(
        request('PUT', { content: 'Updated' }, FEEDBACK_ID),
        params()
      );

      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toEqual({
        message: 'Error updating feedback',
      });
      expect(consoleError).toHaveBeenCalled();
      consoleError.mockRestore();
    });
  });

  describe('DELETE', () => {
    it('denies callers without permission before mutation', async () => {
      mocks.containsPermission.mockReturnValue(false);
      const { DELETE } = await import('./route');

      const response = await DELETE(
        request('DELETE', undefined, FEEDBACK_ID),
        params()
      );

      expect(response.status).toBe(403);
      expectNoMutation();
    });

    it('requires a feedback ID', async () => {
      const { DELETE } = await import('./route');

      const response = await DELETE(request('DELETE'), params());

      expect(response.status).toBe(400);
      expectNoMutation();
    });

    it('rejects missing or foreign-workspace feedback', async () => {
      mocks.feedbackLookupResult.mockResolvedValue({
        data: null,
        error: null,
      });
      const { DELETE } = await import('./route');

      const response = await DELETE(
        request('DELETE', undefined, FEEDBACK_ID),
        params()
      );

      expect(response.status).toBe(404);
      expect(mocks.feedbackLookupEq.mock.calls).toEqual([
        ['id', FEEDBACK_ID],
        ['user.ws_id', WORKSPACE_ID],
      ]);
      expectNoMutation();
    });

    it('deletes contained feedback', async () => {
      const { DELETE } = await import('./route');

      const response = await DELETE(
        request('DELETE', undefined, FEEDBACK_ID),
        params()
      );

      expect(response.status).toBe(200);
      expect(mocks.feedbackLookupEq.mock.calls).toEqual([
        ['id', FEEDBACK_ID],
        ['user.ws_id', WORKSPACE_ID],
      ]);
      expect(mocks.deleteFeedback).toHaveBeenCalledOnce();
      expect(mocks.deleteFeedbackEq).toHaveBeenCalledWith('id', FEEDBACK_ID);
    });

    it('returns the generic delete failure envelope', async () => {
      mocks.deleteFeedbackEq.mockResolvedValue({
        error: { code: 'PGRST500' },
      });
      const consoleError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);
      const { DELETE } = await import('./route');

      const response = await DELETE(
        request('DELETE', undefined, FEEDBACK_ID),
        params()
      );

      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toEqual({
        message: 'Error deleting feedback',
      });
      expect(consoleError).toHaveBeenCalled();
      consoleError.mockRestore();
    });
  });
});
