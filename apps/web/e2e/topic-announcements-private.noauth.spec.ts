import { createHash, randomUUID } from 'node:crypto';
import type { APIRequestContext } from '@playwright/test';
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

function privateServiceHeaders(prefer?: string) {
  return serviceHeaders({ prefer, schema: 'private' });
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function storageObjectPath(path: string) {
  return path.split('/').map(encodeURIComponent).join('/');
}

async function uploadWorkspaceStorageObject({
  contentType,
  data,
  fullPath,
  request,
}: {
  contentType: string;
  data: Uint8Array;
  fullPath: string;
  request: APIRequestContext;
}) {
  return request.post(
    `${SUPABASE_URL}/storage/v1/object/workspaces/${storageObjectPath(fullPath)}`,
    {
      data: Buffer.from(data),
      failOnStatusCode: false,
      headers: {
        apikey: SUPABASE_SECRET_KEY,
        authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
        'content-type': contentType,
        'x-upsert': 'false',
      },
    }
  );
}

test.describe('Topic announcements private schema APIs', () => {
  test.beforeAll(() => {
    assertSafeE2EEnvironment();
  });

  test('verifies contact email tokens through the private verification table', async ({
    request,
  }) => {
    const contactId = randomUUID();
    const verificationId = randomUUID();
    const token = `topic-e2e-${Date.now()}-${randomUUID()}`;
    const email = `topic-e2e-${Date.now()}@example.com`;

    try {
      const contactResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/topic_announcement_contacts`,
        {
          data: {
            email,
            id: contactId,
            name: 'Topic E2E Contact',
            ws_id: ROOT_WORKSPACE_ID,
          },
          failOnStatusCode: false,
          headers: privateServiceHeaders('return=minimal'),
        }
      );
      expect(contactResponse.status()).toBe(201);

      const verificationResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/topic_announcement_contact_verifications`,
        {
          data: {
            contact_id: contactId,
            email,
            expires_at: new Date(Date.now() + 60_000).toISOString(),
            id: verificationId,
            status: 'pending',
            token_hash: hashToken(token),
            ws_id: ROOT_WORKSPACE_ID,
          },
          failOnStatusCode: false,
          headers: privateServiceHeaders('return=minimal'),
        }
      );
      expect(verificationResponse.status()).toBe(201);

      const response = await request.get(
        `/api/v1/topic-announcement-verifications/${encodeURIComponent(token)}`,
        { failOnStatusCode: false }
      );

      expect(response.status()).toBe(200);
      await expect(response.text()).resolves.toContain('Email verified');

      const statusResponse = await request.get(
        `${SUPABASE_URL}/rest/v1/topic_announcement_contact_verifications?id=eq.${verificationId}&select=status,verified_at`,
        {
          failOnStatusCode: false,
          headers: privateServiceHeaders(),
        }
      );
      expect(statusResponse.status()).toBe(200);
      const [row] = (await statusResponse.json()) as Array<{
        status?: string;
        verified_at?: string | null;
      }>;
      expect(row?.status).toBe('verified');
      expect(row?.verified_at).toEqual(expect.any(String));
    } finally {
      await request.delete(
        `${SUPABASE_URL}/rest/v1/topic_announcement_contact_verifications?id=eq.${verificationId}`,
        {
          failOnStatusCode: false,
          headers: privateServiceHeaders(),
        }
      );
      await request.delete(
        `${SUPABASE_URL}/rest/v1/topic_announcement_contacts?id=eq.${contactId}`,
        {
          failOnStatusCode: false,
          headers: privateServiceHeaders(),
        }
      );
    }
  });

  test('returns the public fallback for missing verification tokens', async ({
    request,
  }) => {
    const response = await request.get(
      '/api/v1/topic-announcement-verifications/e2e-missing-token',
      { failOnStatusCode: false }
    );

    expect(response.status()).toBe(404);
    await expect(response.text()).resolves.toContain(
      'Verification link unavailable'
    );
  });

  test('rejects announcement drafts when attachment claims differ from uploaded storage metadata', async ({
    baseURL,
    browser,
    request,
  }, testInfo) => {
    const origin = baseURL ?? 'https://tuturuuu.localhost';
    const headers = e2eClientHeaders(e2eClientIpForTest(testInfo, 278));
    const contactId = randomUUID();
    const roleId = randomUUID();
    const workspaceId = randomUUID();
    const managerEmail = `e2e-topic-attachment-${Date.now()}@tuturuuu.com`;
    const objectPath = `topic-announcements/attachments/${randomUUID()}-lesson-plan.pdf`;
    const fullObjectPath = `${workspaceId}/${objectPath}`;
    const managerContext = await browser.newContext({
      extraHTTPHeaders: headers,
    });
    const managerPage = await managerContext.newPage();
    let managerUserId: string | null = null;

    try {
      await resetDbRateLimits();
      await resetAppRateLimitStateForTests(request, {
        completeOnboarding: true,
        email: managerEmail,
        headers,
        locale: DEFAULT_LOCALE,
      });

      const sessionResponse = await managerPage.request.post(
        `${origin}/api/auth/dev-session`,
        {
          data: {
            completeOnboarding: true,
            email: managerEmail,
            locale: DEFAULT_LOCALE,
          },
          headers,
        }
      );
      expect(sessionResponse.status()).toBe(200);

      const profileResponse = await managerPage.request.get(
        `${origin}/api/v1/users/me/profile`,
        { headers }
      );
      expect(profileResponse.status()).toBe(200);
      const profile = (await profileResponse.json()) as { id?: string };
      expect(profile.id).toEqual(expect.any(String));
      managerUserId = profile.id ?? null;

      const workspaceResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/workspaces`,
        {
          data: {
            creator_id: TEST_USER.id,
            handle: `e2e-topic-upload-${workspaceId.slice(0, 8)}`,
            id: workspaceId,
            name: 'E2E Topic Upload Metadata Workspace',
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
            user_id: managerUserId,
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
            name: 'Topic Announcement manager',
            ws_id: workspaceId,
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
            permission: 'manage_users',
            role_id: roleId,
            ws_id: workspaceId,
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
            user_id: managerUserId,
          },
          failOnStatusCode: false,
          headers: serviceHeaders({ prefer: 'return=minimal' }),
        }
      );
      expect(roleMemberResponse.status()).toBe(201);

      const secretResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/workspace_secrets`,
        {
          data: {
            name: 'ENABLE_TOPIC_ANNOUNCEMENTS',
            value: 'true',
            ws_id: workspaceId,
          },
          failOnStatusCode: false,
          headers: serviceHeaders({ prefer: 'return=minimal' }),
        }
      );
      expect(secretResponse.status()).toBe(201);

      const contactResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/topic_announcement_contacts`,
        {
          data: {
            email: `topic-attachment-${Date.now()}@example.com`,
            id: contactId,
            name: 'Topic Attachment Contact',
            ws_id: workspaceId,
          },
          failOnStatusCode: false,
          headers: privateServiceHeaders('return=minimal'),
        }
      );
      expect(contactResponse.status()).toBe(201);

      const uploadResponse = await uploadWorkspaceStorageObject({
        contentType: 'application/pdf',
        data: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]),
        fullPath: fullObjectPath,
        request,
      });
      expect(uploadResponse.status()).toBe(200);

      const createResponse = await managerPage.request.post(
        `${origin}/api/v1/workspaces/${workspaceId}/topic-announcements`,
        {
          data: {
            attachmentDrafts: [
              {
                contentType: 'application/pdf',
                fileName: 'lesson-plan.pdf',
                sizeBytes: 5,
                storagePath: objectPath,
                storageProvider: 'supabase',
              },
            ],
            contactIds: [contactId],
            title: 'Unit 3 speaking practice',
            topic: 'Practice speaking about weekend plans.',
          },
          failOnStatusCode: false,
          headers,
        }
      );

      expect(createResponse.status()).toBe(400);
      await expect(createResponse.json()).resolves.toEqual({
        message:
          'Topic Announcement attachment metadata does not match the uploaded file',
      });

      const persistedResponse = await request.get(
        `${SUPABASE_URL}/rest/v1/topic_announcements?ws_id=eq.${workspaceId}&select=id`,
        {
          failOnStatusCode: false,
          headers: privateServiceHeaders(),
        }
      );
      expect(persistedResponse.status()).toBe(200);
      expect(await persistedResponse.json()).toEqual([]);
    } finally {
      await request.delete(
        `${SUPABASE_URL}/storage/v1/object/workspaces/${storageObjectPath(fullObjectPath)}`,
        {
          failOnStatusCode: false,
          headers: {
            apikey: SUPABASE_SECRET_KEY,
            authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
          },
        }
      );
      await managerContext.close();
      await request.delete(
        `${SUPABASE_URL}/rest/v1/workspaces?id=eq.${workspaceId}`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders({ prefer: 'return=minimal' }),
        }
      );
    }
  });
});
