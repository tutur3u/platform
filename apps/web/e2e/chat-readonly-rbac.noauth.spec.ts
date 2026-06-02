import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { DEFAULT_LOCALE, TEST_USER } from './helpers/constants';
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

test.describe('Chat read-only RBAC', () => {
  test.beforeAll(() => {
    assertSafeE2EEnvironment();
  });

  test('allows reading but blocks messages and attachment uploads without create_chat', async ({
    baseURL,
    browser,
    request,
  }, testInfo) => {
    const origin = baseURL ?? 'https://tuturuuu.localhost';
    const headers = e2eClientHeaders(e2eClientIpForTest(testInfo, 284));
    const conversationId = randomUUID();
    const messageId = randomUUID();
    const roleId = randomUUID();
    const workspaceId = randomUUID();
    const readOnlyEmail = `e2e-chat-readonly-${Date.now()}@tuturuuu.com`;
    const context = await browser.newContext({
      extraHTTPHeaders: headers,
    });
    const page = await context.newPage();
    let readOnlyUserId: string | null = null;

    try {
      await resetDbRateLimits();
      await resetAppRateLimitStateForTests(request, {
        completeOnboarding: true,
        email: readOnlyEmail,
        headers,
        locale: DEFAULT_LOCALE,
      });

      const sessionResponse = await page.request.post(
        `${origin}/api/auth/dev-session`,
        {
          data: {
            completeOnboarding: true,
            email: readOnlyEmail,
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
      readOnlyUserId = profile.id ?? null;

      const workspaceResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/workspaces`,
        {
          data: {
            creator_id: TEST_USER.id,
            handle: `e2e-chat-readonly-${workspaceId.slice(0, 8)}`,
            id: workspaceId,
            name: 'E2E Chat Read Only Workspace',
            personal: false,
          },
          failOnStatusCode: false,
          headers: serviceHeaders({ prefer: 'return=minimal' }),
        }
      );
      expect(workspaceResponse.status()).toBe(201);

      const defaultsResponse = await request.delete(
        `${SUPABASE_URL}/rest/v1/workspace_default_permissions?ws_id=eq.${workspaceId}`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders({ prefer: 'return=minimal' }),
        }
      );
      expect(defaultsResponse.status()).toBe(204);

      const membershipResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/workspace_members`,
        {
          data: {
            type: 'MEMBER',
            user_id: readOnlyUserId,
            ws_id: workspaceId,
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
            name: 'Chat read only',
            ws_id: workspaceId,
          },
          failOnStatusCode: false,
          headers: serviceHeaders({ prefer: 'return=minimal' }),
        }
      );
      expect(roleResponse.status()).toBe(201);

      const viewPermissionResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/workspace_role_permissions`,
        {
          data: {
            enabled: true,
            permission: 'view_chat',
            role_id: roleId,
            ws_id: workspaceId,
          },
          failOnStatusCode: false,
          headers: serviceHeaders({ prefer: 'return=minimal' }),
        }
      );
      expect(viewPermissionResponse.status()).toBe(201);

      const roleMemberResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/workspace_role_members`,
        {
          data: {
            role_id: roleId,
            user_id: readOnlyUserId,
          },
          failOnStatusCode: false,
          headers: serviceHeaders({ prefer: 'return=minimal' }),
        }
      );
      expect(roleMemberResponse.status()).toBe(201);

      const conversationResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/chat_conversations`,
        {
          data: {
            created_by: TEST_USER.id,
            id: conversationId,
            title: 'Read-only channel',
            type: 'channel',
            ws_id: workspaceId,
          },
          failOnStatusCode: false,
          headers: serviceHeaders({
            prefer: 'return=minimal',
            schema: 'private',
          }),
        }
      );
      expect(conversationResponse.status()).toBe(201);

      const messageResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/chat_messages`,
        {
          data: {
            content: 'Visible read-only channel message',
            conversation_id: conversationId,
            id: messageId,
            kind: 'user',
            sender_id: TEST_USER.id,
          },
          failOnStatusCode: false,
          headers: serviceHeaders({
            prefer: 'return=minimal',
            schema: 'private',
          }),
        }
      );
      expect(messageResponse.status()).toBe(201);

      const readResponse = await page.request.get(
        `${origin}/api/v1/workspaces/${workspaceId}/chat/conversations/${conversationId}/messages`,
        { failOnStatusCode: false, headers }
      );
      expect(readResponse.status()).toBe(200);
      const readBody = (await readResponse.json()) as {
        messages: Array<{ content: string; id: string }>;
      };
      expect(readBody.messages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            content: 'Visible read-only channel message',
            id: messageId,
          }),
        ])
      );

      const deniedMessageResponse = await page.request.post(
        `${origin}/api/v1/workspaces/${workspaceId}/chat/conversations/${conversationId}/messages`,
        {
          data: { content: 'should not be sent' },
          failOnStatusCode: false,
          headers,
        }
      );
      expect(deniedMessageResponse.status()).toBe(403);

      const deniedUploadResponse = await page.request.post(
        `${origin}/api/v1/workspaces/${workspaceId}/chat/conversations/${conversationId}/attachments/upload-url`,
        {
          data: {
            contentType: 'text/plain',
            filename: 'readonly.txt',
            sizeBytes: 16,
          },
          failOnStatusCode: false,
          headers,
        }
      );
      expect(deniedUploadResponse.status()).toBe(403);

      const createPermissionResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/workspace_role_permissions`,
        {
          data: {
            enabled: true,
            permission: 'create_chat',
            role_id: roleId,
            ws_id: workspaceId,
          },
          failOnStatusCode: false,
          headers: serviceHeaders({ prefer: 'return=minimal' }),
        }
      );
      expect(createPermissionResponse.status()).toBe(201);

      const allowedMessageResponse = await page.request.post(
        `${origin}/api/v1/workspaces/${workspaceId}/chat/conversations/${conversationId}/messages`,
        {
          data: { content: 'write allowed after create_chat grant' },
          failOnStatusCode: false,
          headers,
        }
      );
      expect(allowedMessageResponse.status()).toBe(201);
      await expect(allowedMessageResponse.json()).resolves.toMatchObject({
        message: {
          content: 'write allowed after create_chat grant',
          senderId: readOnlyUserId,
        },
      });
    } finally {
      await request.delete(
        `${SUPABASE_URL}/rest/v1/chat_messages?conversation_id=eq.${conversationId}`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders({ schema: 'private' }),
        }
      );
      await request.delete(
        `${SUPABASE_URL}/rest/v1/chat_conversation_members?conversation_id=eq.${conversationId}`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders({ schema: 'private' }),
        }
      );
      await request.delete(
        `${SUPABASE_URL}/rest/v1/chat_conversations?id=eq.${conversationId}`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders({ schema: 'private' }),
        }
      );
      await request.delete(
        `${SUPABASE_URL}/rest/v1/workspace_role_members?role_id=eq.${roleId}`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders(),
        }
      );
      await request.delete(
        `${SUPABASE_URL}/rest/v1/workspace_role_permissions?role_id=eq.${roleId}`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders(),
        }
      );
      await request.delete(
        `${SUPABASE_URL}/rest/v1/workspace_roles?id=eq.${roleId}`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders(),
        }
      );

      if (readOnlyUserId) {
        await request.delete(
          `${SUPABASE_URL}/rest/v1/workspace_members?ws_id=eq.${workspaceId}&user_id=eq.${readOnlyUserId}`,
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
      await context.close();
    }
  });
});
