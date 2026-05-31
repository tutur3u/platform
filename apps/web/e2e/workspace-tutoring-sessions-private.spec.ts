import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import {
  assertSafeE2EEnvironment,
  LOCAL_E2E_SUPABASE_SECRET_KEY,
  LOCAL_E2E_SUPABASE_URL,
} from './helpers/environment';

const ROOT_WORKSPACE_ID = '00000000-0000-0000-0000-000000000000';
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? LOCAL_E2E_SUPABASE_URL;
const SUPABASE_SECRET_KEY =
  process.env.SUPABASE_SECRET_KEY ?? LOCAL_E2E_SUPABASE_SECRET_KEY;

function serviceHeaders({
  prefer,
  schema,
}: {
  prefer?: string;
  schema?: 'private' | 'public';
} = {}) {
  return {
    apikey: SUPABASE_SECRET_KEY,
    authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
    'content-type': 'application/json',
    ...(prefer ? { prefer } : {}),
    ...(schema
      ? {
          'accept-profile': schema,
          'content-profile': schema,
        }
      : {}),
  };
}

test.describe('Workspace tutoring sessions private schema API', () => {
  test.beforeAll(() => {
    assertSafeE2EEnvironment();
  });

  test('lists and updates tutoring sessions through authenticated app APIs', async ({
    request,
  }) => {
    const groupId = randomUUID();
    const sessionId = randomUUID();
    let studentUserId: string | undefined;

    try {
      const usersResponse = await request.get(
        `${SUPABASE_URL}/rest/v1/workspace_users?ws_id=eq.${ROOT_WORKSPACE_ID}&select=id,email&order=email.asc&limit=1`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders(),
        }
      );

      expect(usersResponse.status()).toBe(200);
      const users = (await usersResponse.json()) as {
        email: string | null;
        id: string;
      }[];
      expect(users.length).toBeGreaterThan(0);
      studentUserId = users[0]?.id;
      expect(studentUserId).toBeTruthy();

      const groupResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/workspace_user_groups`,
        {
          data: {
            id: groupId,
            name: 'Private tutoring E2E group',
            ws_id: ROOT_WORKSPACE_ID,
          },
          failOnStatusCode: false,
          headers: serviceHeaders({ prefer: 'return=minimal' }),
        }
      );

      expect(groupResponse.status()).toBe(201);

      const seedResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/workspace_tutoring_sessions`,
        {
          data: {
            attendance_status: 'PENDING',
            content: 'Seeded through private REST for app API coverage',
            created_by: '00000000-0000-0000-0000-000000000001',
            duration_minutes: 45,
            group_id: groupId,
            id: sessionId,
            reason_detail: 'Private schema move',
            reason_type: 'CUSTOM',
            session_date: '2030-01-15',
            start_time: '09:00',
            student_user_id: studentUserId,
            ws_id: ROOT_WORKSPACE_ID,
          },
          failOnStatusCode: false,
          headers: serviceHeaders({
            prefer: 'return=minimal',
            schema: 'private',
          }),
        }
      );

      expect(seedResponse.status()).toBe(201);

      const listResponse = await request.get(
        `/api/v1/workspaces/${ROOT_WORKSPACE_ID}/tutoring/sessions?groupId=${groupId}&pageSize=5`,
        { failOnStatusCode: false }
      );

      expect(listResponse.status()).toBe(200);
      const listBody = (await listResponse.json()) as {
        count: number;
        data: {
          attendance_status: string;
          content: string;
          group_id: string;
          id: string;
          student_user_id: string;
        }[];
      };

      expect(listBody.count).toBeGreaterThanOrEqual(1);
      expect(listBody.data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            attendance_status: 'PENDING',
            content: 'Seeded through private REST for app API coverage',
            group_id: groupId,
            id: sessionId,
            student_user_id: studentUserId,
          }),
        ])
      );

      const updateResponse = await request.put(
        `/api/v1/workspaces/${ROOT_WORKSPACE_ID}/tutoring/sessions/${sessionId}`,
        {
          data: {
            attendanceStatus: 'DONE',
            content: 'Updated through app API after private schema move',
          },
          failOnStatusCode: false,
        }
      );

      expect(updateResponse.status()).toBe(200);
      await expect(updateResponse.json()).resolves.toEqual({
        message: 'success',
      });

      const updatedListResponse = await request.get(
        `/api/v1/workspaces/${ROOT_WORKSPACE_ID}/tutoring/sessions?groupId=${groupId}&attendanceStatus=DONE&pageSize=5`,
        { failOnStatusCode: false }
      );

      expect(updatedListResponse.status()).toBe(200);
      const updatedListBody = (await updatedListResponse.json()) as {
        data: { attendance_status: string; content: string; id: string }[];
      };

      expect(updatedListBody.data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            attendance_status: 'DONE',
            content: 'Updated through app API after private schema move',
            id: sessionId,
          }),
        ])
      );
    } finally {
      await request.delete(
        `${SUPABASE_URL}/rest/v1/workspace_tutoring_sessions?id=eq.${sessionId}`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders({ schema: 'private' }),
        }
      );

      await request.delete(
        `${SUPABASE_URL}/rest/v1/workspace_user_groups?id=eq.${groupId}`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders(),
        }
      );
    }
  });
});
