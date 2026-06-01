import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { DEFAULT_LOCALE } from './helpers/constants';
import {
  assertSafeE2EEnvironment,
  LOCAL_E2E_SUPABASE_SECRET_KEY,
  LOCAL_E2E_SUPABASE_URL,
} from './helpers/environment';
import {
  e2eClientHeaders,
  e2eClientIpForTest,
  resetAppRateLimitStateForTests,
  resetDbRateLimits,
} from './helpers/rate-limits';

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

test.describe('Meet stream route boundaries', () => {
  test.beforeAll(() => {
    assertSafeE2EEnvironment();
  });

  test('keeps publish URLs host-only and rejects non-host stream creation', async ({
    baseURL,
    browser,
    request,
  }, testInfo) => {
    const origin = baseURL ?? 'https://tuturuuu.localhost';
    const headers = e2eClientHeaders(e2eClientIpForTest(testInfo, 283));
    const hostEmail = `e2e-meet-stream-host-${Date.now()}@tuturuuu.com`;
    const viewerEmail = `e2e-meet-stream-viewer-${Date.now()}@tuturuuu.com`;
    const meetingId = randomUUID();
    const streamId = randomUUID();
    const workspaceId = randomUUID();
    const hostContext = await browser.newContext({
      extraHTTPHeaders: headers,
    });
    const viewerContext = await browser.newContext({
      extraHTTPHeaders: headers,
    });
    const hostPage = await hostContext.newPage();
    const viewerPage = await viewerContext.newPage();
    let hostUserId: string | null = null;
    let viewerUserId: string | null = null;

    try {
      await resetDbRateLimits();
      await resetAppRateLimitStateForTests(request, {
        completeOnboarding: true,
        email: hostEmail,
        headers,
        locale: DEFAULT_LOCALE,
      });
      await resetAppRateLimitStateForTests(request, {
        completeOnboarding: true,
        email: viewerEmail,
        headers,
        locale: DEFAULT_LOCALE,
      });

      const hostSessionResponse = await hostPage.request.post(
        `${origin}/api/auth/dev-session`,
        {
          data: {
            completeOnboarding: true,
            email: hostEmail,
            locale: DEFAULT_LOCALE,
          },
          headers,
        }
      );
      expect(hostSessionResponse.status()).toBe(200);

      const viewerSessionResponse = await viewerPage.request.post(
        `${origin}/api/auth/dev-session`,
        {
          data: {
            completeOnboarding: true,
            email: viewerEmail,
            locale: DEFAULT_LOCALE,
          },
          headers,
        }
      );
      expect(viewerSessionResponse.status()).toBe(200);

      const hostProfileResponse = await hostPage.request.get(
        `${origin}/api/v1/users/me/profile`,
        { headers }
      );
      expect(hostProfileResponse.status()).toBe(200);
      const hostProfile = (await hostProfileResponse.json()) as { id?: string };
      expect(hostProfile.id).toEqual(expect.any(String));
      hostUserId = hostProfile.id ?? null;

      const viewerProfileResponse = await viewerPage.request.get(
        `${origin}/api/v1/users/me/profile`,
        { headers }
      );
      expect(viewerProfileResponse.status()).toBe(200);
      const viewerProfile = (await viewerProfileResponse.json()) as {
        id?: string;
      };
      expect(viewerProfile.id).toEqual(expect.any(String));
      viewerUserId = viewerProfile.id ?? null;

      const workspaceResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/workspaces`,
        {
          data: {
            creator_id: hostUserId,
            handle: `e2e-meet-stream-${workspaceId.slice(0, 8)}`,
            id: workspaceId,
            name: 'E2E Meet Stream Workspace',
            personal: false,
          },
          failOnStatusCode: false,
          headers: serviceHeaders({ prefer: 'return=minimal' }),
        }
      );
      expect(workspaceResponse.status()).toBe(201);

      const hostMembershipResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/workspace_members`,
        {
          data: {
            type: 'MEMBER',
            user_id: hostUserId,
            ws_id: workspaceId,
          },
          failOnStatusCode: false,
          headers: serviceHeaders({ prefer: 'return=minimal' }),
        }
      );
      expect(hostMembershipResponse.status()).toBe(201);

      const viewerMembershipResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/workspace_members`,
        {
          data: {
            type: 'MEMBER',
            user_id: viewerUserId,
            ws_id: workspaceId,
          },
          failOnStatusCode: false,
          headers: serviceHeaders({ prefer: 'return=minimal' }),
        }
      );
      expect(viewerMembershipResponse.status()).toBe(201);

      const meetingResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/workspace_meetings`,
        {
          data: {
            creator_id: hostUserId,
            id: meetingId,
            name: 'E2E Meet stream route',
            time: new Date().toISOString(),
            ws_id: workspaceId,
          },
          failOnStatusCode: false,
          headers: serviceHeaders({ prefer: 'return=minimal' }),
        }
      );
      expect(meetingResponse.status()).toBe(201);

      const streamResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/meet_stream_live_inputs`,
        {
          data: {
            cloudflare_live_input_enabled: true,
            cloudflare_live_input_uid: `e2e-${streamId}`,
            created_by: hostUserId,
            id: streamId,
            meeting_id: meetingId,
            status: 'ready',
            whep_url: 'https://customer.example/webRTC/play/e2e',
            whip_url: 'https://customer.example/webRTC/publish/e2e',
            ws_id: workspaceId,
          },
          failOnStatusCode: false,
          headers: serviceHeaders({
            prefer: 'return=minimal',
            schema: 'private',
          }),
        }
      );
      expect(streamResponse.status()).toBe(201);

      const viewerGetResponse = await viewerPage.request.get(
        `${origin}/api/v1/workspaces/${workspaceId}/meetings/${meetingId}/stream`,
        { failOnStatusCode: false, headers }
      );
      expect(viewerGetResponse.status()).toBe(200);
      const viewerGetBody = (await viewerGetResponse.json()) as {
        stream: { playbackUrl: string; publishUrl?: string } | null;
      };
      expect(viewerGetBody.stream).toEqual(
        expect.objectContaining({
          playbackUrl: 'https://customer.example/webRTC/play/e2e',
        })
      );
      expect(viewerGetBody.stream).not.toHaveProperty('publishUrl');

      const viewerPostResponse = await viewerPage.request.post(
        `${origin}/api/v1/workspaces/${workspaceId}/meetings/${meetingId}/stream`,
        { failOnStatusCode: false, headers }
      );
      expect(viewerPostResponse.status()).toBe(403);

      const hostPostResponse = await hostPage.request.post(
        `${origin}/api/v1/workspaces/${workspaceId}/meetings/${meetingId}/stream`,
        { failOnStatusCode: false, headers }
      );
      expect(hostPostResponse.status()).toBe(200);
      const hostPostBody = (await hostPostResponse.json()) as {
        created: boolean;
        stream: { playbackUrl: string; publishUrl?: string };
      };
      expect(hostPostBody).toEqual(
        expect.objectContaining({
          created: false,
          stream: expect.objectContaining({
            playbackUrl: 'https://customer.example/webRTC/play/e2e',
            publishUrl: 'https://customer.example/webRTC/publish/e2e',
          }),
        })
      );
    } finally {
      await request.delete(
        `${SUPABASE_URL}/rest/v1/meet_stream_live_inputs?id=eq.${streamId}`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders({ schema: 'private' }),
        }
      );
      await request.delete(
        `${SUPABASE_URL}/rest/v1/workspace_meetings?id=eq.${meetingId}`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders(),
        }
      );

      if (hostUserId) {
        await request.delete(
          `${SUPABASE_URL}/rest/v1/workspace_members?ws_id=eq.${workspaceId}&user_id=eq.${hostUserId}`,
          {
            failOnStatusCode: false,
            headers: serviceHeaders(),
          }
        );
      }

      if (viewerUserId) {
        await request.delete(
          `${SUPABASE_URL}/rest/v1/workspace_members?ws_id=eq.${workspaceId}&user_id=eq.${viewerUserId}`,
          {
            failOnStatusCode: false,
            headers: serviceHeaders(),
          }
        );
      }

      await request.delete(
        `${SUPABASE_URL}/rest/v1/workspaces?id=eq.${workspaceId}`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders(),
        }
      );
      await hostContext.close();
      await viewerContext.close();
    }
  });
});
