import { randomUUID } from 'node:crypto';
import type { APIRequestContext } from '@playwright/test';
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

const ROOT_WORKSPACE_ID = '00000000-0000-0000-0000-000000000000';
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? LOCAL_E2E_SUPABASE_URL;
const SUPABASE_SECRET_KEY =
  process.env.SUPABASE_SECRET_KEY ?? LOCAL_E2E_SUPABASE_SECRET_KEY;

function serviceHeaders({ prefer }: { prefer?: string } = {}) {
  return {
    apikey: SUPABASE_SECRET_KEY,
    authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
    'content-type': 'application/json',
    ...(prefer ? { prefer } : {}),
  };
}

function eqFilterValue(value: string) {
  return encodeURIComponent(value);
}

async function deleteWorkspaceSecret(request: APIRequestContext, name: string) {
  await request.delete(
    `${SUPABASE_URL}/rest/v1/workspace_secrets?ws_id=eq.${ROOT_WORKSPACE_ID}&name=eq.${eqFilterValue(name)}`,
    {
      failOnStatusCode: false,
      headers: serviceHeaders(),
    }
  );
}

test.describe('AI agent chat discovery metadata', () => {
  test.beforeAll(() => {
    assertSafeE2EEnvironment();
  });

  test('does not expose webhook URLs or raw agent ids to chat viewers', async ({
    baseURL,
    browser,
    request,
  }, testInfo) => {
    const origin = baseURL ?? 'https://tuturuuu.localhost';
    const headers = e2eClientHeaders(e2eClientIpForTest(testInfo, 277));
    const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
    const agentId = `e2e-agent-${suffix}`;
    const channelId = `discord-${suffix}`;
    const agentName = `E2E Agent ${suffix}`;
    const channelName = `E2E Channel ${suffix}`;
    const webhookUrl = `https://secret.example/${suffix}`;
    const roleId = randomUUID();
    const lowPrivEmail = `e2e-ai-agent-discovery-${Date.now()}@tuturuuu.com`;
    const agentMetaName = `AI_AGENT_REGISTRY:${agentId}:meta`;
    const channelMetaName = `AI_AGENT_REGISTRY:${agentId}:channel:${channelId}:meta`;
    const context = await browser.newContext({
      extraHTTPHeaders: headers,
    });
    const page = await context.newPage();
    let lowPrivUserId: string | null = null;

    try {
      await resetDbRateLimits();
      await resetAppRateLimitStateForTests(request, {
        completeOnboarding: true,
        email: lowPrivEmail,
        headers,
        locale: DEFAULT_LOCALE,
      });

      const sessionResponse = await page.request.post(
        `${origin}/api/auth/dev-session`,
        {
          data: {
            completeOnboarding: true,
            email: lowPrivEmail,
            locale: DEFAULT_LOCALE,
          },
          headers,
        }
      );
      expect(sessionResponse.status()).toBe(200);

      const profileResponse = await page.request.get(
        `${origin}/api/v1/users/me/profile`,
        { headers }
      );
      expect(profileResponse.status()).toBe(200);
      const profile = (await profileResponse.json()) as { id?: string };
      expect(profile.id).toEqual(expect.any(String));
      lowPrivUserId = profile.id ?? null;

      const membershipResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/workspace_members`,
        {
          data: {
            type: 'MEMBER',
            user_id: lowPrivUserId,
            ws_id: ROOT_WORKSPACE_ID,
          },
          failOnStatusCode: false,
          headers: serviceHeaders({ prefer: 'return=minimal' }),
        }
      );
      expect(membershipResponse.status()).toBe(201);

      const roleResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/workspace_roles`,
        {
          data: {
            id: roleId,
            name: 'Root chat viewer only',
            ws_id: ROOT_WORKSPACE_ID,
          },
          failOnStatusCode: false,
          headers: serviceHeaders({ prefer: 'return=minimal' }),
        }
      );
      expect(roleResponse.status()).toBe(201);

      const permissionResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/workspace_role_permissions`,
        {
          data: {
            enabled: true,
            permission: 'view_chat',
            role_id: roleId,
            ws_id: ROOT_WORKSPACE_ID,
          },
          failOnStatusCode: false,
          headers: serviceHeaders({ prefer: 'return=minimal' }),
        }
      );
      expect(permissionResponse.status()).toBe(201);

      const roleMemberResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/workspace_role_members`,
        {
          data: {
            role_id: roleId,
            user_id: lowPrivUserId,
          },
          failOnStatusCode: false,
          headers: serviceHeaders({ prefer: 'return=minimal' }),
        }
      );
      expect(roleMemberResponse.status()).toBe(201);

      const secretsResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/workspace_secrets`,
        {
          data: [
            {
              name: agentMetaName,
              value: JSON.stringify({
                enabled: true,
                id: agentId,
                name: agentName,
              }),
              ws_id: ROOT_WORKSPACE_ID,
            },
            {
              name: channelMetaName,
              value: JSON.stringify({
                adapter: 'discord',
                displayName: channelName,
                enabled: true,
                id: channelId,
                lastDeployedAt: '2026-06-01T00:00:00.000Z',
                lastEventAt: '2026-06-01T00:01:00.000Z',
                status: 'deployed',
                webhookUrl,
                workspaceId: ROOT_WORKSPACE_ID,
              }),
              ws_id: ROOT_WORKSPACE_ID,
            },
          ],
          failOnStatusCode: false,
          headers: serviceHeaders({ prefer: 'return=minimal' }),
        }
      );
      expect(secretsResponse.status()).toBe(201);

      const conversationsResponse = await page.request.get(
        `${origin}/api/v1/workspaces/${ROOT_WORKSPACE_ID}/chat/conversations?limit=100`,
        { failOnStatusCode: false, headers }
      );
      expect(conversationsResponse.status()).toBe(200);

      const payload = (await conversationsResponse.json()) as {
        conversations?: Array<{
          id: string;
          latestMessage?: { metadata?: Record<string, unknown> | null } | null;
          metadata?: Record<string, unknown> | null;
          title?: string | null;
        }>;
      };
      const conversation = payload.conversations?.find(
        (item) => item.title === `${agentName} / ${channelName}`
      );

      expect(conversation).toBeDefined();
      expect(conversation?.id).toMatch(/^ai-agent-[a-f0-9]{32}$/u);
      expect(conversation?.id).not.toContain(agentId);
      expect(conversation?.id).not.toContain(channelId);
      expect(conversation?.metadata).toEqual({
        readOnly: true,
        source: 'ai-agent',
      });
      expect(conversation?.latestMessage?.metadata).toEqual({
        readOnly: true,
        source: 'ai-agent',
      });

      const serialized = JSON.stringify(conversation);
      expect(serialized).not.toContain(webhookUrl);
      expect(serialized).not.toContain('webhookUrl');
      expect(serialized).not.toContain('workspaceId');
      expect(serialized).not.toContain(agentId);
      expect(serialized).not.toContain(channelId);
    } finally {
      await deleteWorkspaceSecret(request, agentMetaName);
      await deleteWorkspaceSecret(request, channelMetaName);

      if (lowPrivUserId) {
        await request.delete(
          `${SUPABASE_URL}/rest/v1/workspace_role_members?role_id=eq.${roleId}&user_id=eq.${lowPrivUserId}`,
          {
            failOnStatusCode: false,
            headers: serviceHeaders(),
          }
        );

        await request.delete(
          `${SUPABASE_URL}/rest/v1/workspace_members?user_id=eq.${lowPrivUserId}&ws_id=eq.${ROOT_WORKSPACE_ID}`,
          {
            failOnStatusCode: false,
            headers: serviceHeaders(),
          }
        );
      }

      await request.delete(
        `${SUPABASE_URL}/rest/v1/workspace_roles?id=eq.${roleId}`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders(),
        }
      );

      await context.close();
    }
  });
});
