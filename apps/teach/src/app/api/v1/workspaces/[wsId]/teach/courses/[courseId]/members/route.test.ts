import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  canManageCourses: false,
  validateCourse: vi.fn(),
  rpc: vi.fn(),
  selectContacts: vi.fn(),
}));

vi.mock('@/lib/api-auth', () => ({
  withSessionAuth:
    (
      handler: (
        request: NextRequest,
        context: unknown,
        params: Promise<unknown>
      ) => Promise<Response>
    ) =>
    (request: NextRequest, context: { params: Promise<unknown> }) =>
      handler(request, {}, context.params),
}));

vi.mock('@tuturuuu/education-core/teach/api', () => ({
  requireTeachWorkspaceAccess: async (input: { permission: string }) => {
    if (input.permission === 'manage_courses' && !mocks.canManageCourses) {
      return new NextResponse(null, { status: 403 });
    }
    return {
      normalizedWsId: 'authorized-workspace',
      userId: 'verified-actor',
      sbAdmin: {
        from: mocks.selectContacts,
        schema: () => ({ rpc: mocks.rpc }),
      },
    };
  },
  validateTeachCourse: mocks.validateCourse,
}));

import { DELETE } from './[userId]/route';
import { POST } from './route';

const courseId = 'c1960000-0000-4000-8000-000000000021';
const userId = 'c1960000-0000-4000-8000-000000000022';
const url = `https://tuturuuu.com/teach/api/v1/workspaces/alias/teach/courses/${courseId}/members`;

function addMembership() {
  return POST(
    new NextRequest(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberIds: [userId], role: 'TEACHER' }),
    }),
    { params: Promise.resolve({ wsId: 'alias', courseId }) }
  );
}

function removeMembership() {
  return DELETE(new NextRequest(`${url}/${userId}`, { method: 'DELETE' }), {
    params: Promise.resolve({ wsId: 'alias', courseId, userId }),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.canManageCourses = false;
  mocks.validateCourse.mockResolvedValue({ id: courseId });
  mocks.rpc.mockResolvedValue({ data: null, error: null });
  const contacts = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockResolvedValue({ data: [{ id: userId }], error: null }),
  };
  mocks.selectContacts.mockReturnValue(contacts);
});

it('rejects a default member before reading or writing either enrollment path', async () => {
  const responses = await Promise.all([addMembership(), removeMembership()]);
  expect(responses.map((response) => response.status)).toEqual([403, 403]);
  expect(mocks.validateCourse).not.toHaveBeenCalled();
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it('passes the verified course manager identity through both shared writes', async () => {
  mocks.canManageCourses = true;
  expect((await addMembership()).status).toBe(200);
  expect((await removeMembership()).status).toBe(200);
  expect(mocks.rpc.mock.calls).toEqual([
    [
      'admin_upsert_workspace_user_group_members_with_audit_actor',
      {
        p_ws_id: 'authorized-workspace',
        p_group_id: courseId,
        p_user_ids: [userId],
        p_role: 'TEACHER',
        p_actor_auth_uid: 'verified-actor',
      },
    ],
    [
      'admin_delete_workspace_user_group_member_with_audit_actor',
      {
        p_ws_id: 'authorized-workspace',
        p_group_id: courseId,
        p_user_id: userId,
        p_actor_auth_uid: 'verified-actor',
      },
    ],
  ]);
});
