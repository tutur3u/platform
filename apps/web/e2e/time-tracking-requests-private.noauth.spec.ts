import { randomUUID } from 'node:crypto';
import { type APIRequestContext, expect, test } from '@playwright/test';
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

async function firstWorkspaceUserId(request: APIRequestContext) {
  const response = await request.get(
    `${SUPABASE_URL}/rest/v1/workspace_members?ws_id=eq.${ROOT_WORKSPACE_ID}&select=user_id&limit=1`,
    {
      failOnStatusCode: false,
      headers: serviceHeaders(),
    }
  );

  expect(response.status()).toBe(200);

  const members = (await response.json()) as Array<{ user_id: string }>;
  expect(members.length).toBeGreaterThan(0);
  expect(members[0]?.user_id).toEqual(expect.any(String));

  return members[0].user_id;
}

test.describe('Time-tracking requests private schema APIs', () => {
  test.beforeAll(() => {
    assertSafeE2EEnvironment();
  });

  test('manages request rows, comments, activity, and RPCs in private', async ({
    request,
  }) => {
    const requestId = randomUUID();
    const commentContent = `Private schema comment ${Date.now()}`;
    const ownerUserId = await firstWorkspaceUserId(request);

    try {
      const createResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/time_tracking_requests`,
        {
          data: {
            description: 'Created through private schema E2E coverage',
            end_time: '2026-01-15T08:30:00.000Z',
            id: requestId,
            start_time: '2026-01-15T07:30:00.000Z',
            title: 'Private time-tracking request',
            user_id: ownerUserId,
            workspace_id: ROOT_WORKSPACE_ID,
          },
          failOnStatusCode: false,
          headers: serviceHeaders({
            prefer: 'return=representation',
            schema: 'private',
          }),
        }
      );

      expect(createResponse.status()).toBe(201);

      const updateResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/rpc/update_time_tracking_request_content`,
        {
          data: {
            p_actor_auth_uid: ownerUserId,
            p_description: 'Updated through private RPC',
            p_end_time: '2026-01-15T09:00:00.000Z',
            p_images: [],
            p_request_id: requestId,
            p_start_time: '2026-01-15T08:00:00.000Z',
            p_title: 'Updated private time-tracking request',
            p_workspace_id: ROOT_WORKSPACE_ID,
          },
          failOnStatusCode: false,
          headers: serviceHeaders({ schema: 'private' }),
        }
      );

      expect(updateResponse.status()).toBe(200);

      const updatedBody = await updateResponse.json();
      const updatedRequest = Array.isArray(updatedBody)
        ? updatedBody[0]
        : updatedBody;
      expect(updatedRequest).toEqual(
        expect.objectContaining({
          id: requestId,
          title: 'Updated private time-tracking request',
        })
      );

      const commentResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/time_tracking_request_comments`,
        {
          data: {
            content: commentContent,
            request_id: requestId,
            user_id: ownerUserId,
          },
          failOnStatusCode: false,
          headers: serviceHeaders({
            prefer: 'return=representation',
            schema: 'private',
          }),
        }
      );

      expect(commentResponse.status()).toBe(201);

      const detailResponse = await request.get(
        `${SUPABASE_URL}/rest/v1/time_tracking_requests_with_details?id=eq.${requestId}&select=id,title,user`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders({ schema: 'private' }),
        }
      );

      expect(detailResponse.status()).toBe(200);

      const details = (await detailResponse.json()) as Array<{
        id: string;
        title: string;
        user: { id: string } | null;
      }>;

      expect(details).toEqual([
        expect.objectContaining({
          id: requestId,
          title: 'Updated private time-tracking request',
          user: expect.objectContaining({ id: ownerUserId }),
        }),
      ]);

      const commentsResponse = await request.get(
        `${SUPABASE_URL}/rest/v1/time_tracking_request_comments_with_users?request_id=eq.${requestId}&select=id,content,user`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders({ schema: 'private' }),
        }
      );

      expect(commentsResponse.status()).toBe(200);

      const comments = (await commentsResponse.json()) as Array<{
        content: string;
        user: { id: string } | null;
      }>;

      expect(comments).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            content: commentContent,
            user: expect.objectContaining({ id: ownerUserId }),
          }),
        ])
      );

      const activityResponse = await request.get(
        `${SUPABASE_URL}/rest/v1/time_tracking_request_activity?request_id=eq.${requestId}&select=action_type`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders({ schema: 'private' }),
        }
      );

      expect(activityResponse.status()).toBe(200);

      const activityRows = (await activityResponse.json()) as Array<{
        action_type: string;
      }>;
      const activityTypes = activityRows.map(
        (activity) => activity.action_type
      );

      expect(activityTypes).toEqual(
        expect.arrayContaining(['COMMENT_ADDED', 'CONTENT_UPDATED', 'CREATED'])
      );

      const activityViewResponse = await request.get(
        `${SUPABASE_URL}/rest/v1/time_tracking_request_activity_with_users?request_id=eq.${requestId}&select=action_type,actor_id,actor_display_name`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders({ schema: 'private' }),
        }
      );

      expect(activityViewResponse.status()).toBe(200);
      const activityViewRows = (await activityViewResponse.json()) as Array<{
        action_type: string;
      }>;
      expect(activityViewRows.length).toBeGreaterThanOrEqual(3);
    } finally {
      await request.delete(
        `${SUPABASE_URL}/rest/v1/notifications?entity_type=eq.time_tracking_request&entity_id=eq.${requestId}`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders(),
        }
      );
      await request.delete(
        `${SUPABASE_URL}/rest/v1/time_tracking_requests?id=eq.${requestId}`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders({ schema: 'private' }),
        }
      );
    }
  });
});
