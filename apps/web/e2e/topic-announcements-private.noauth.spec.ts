import { createHash, randomUUID } from 'node:crypto';
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

function privateServiceHeaders(prefer?: string) {
  return {
    apikey: SUPABASE_SECRET_KEY,
    authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
    'accept-profile': 'private',
    'content-profile': 'private',
    'content-type': 'application/json',
    ...(prefer ? { prefer } : {}),
  };
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
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
});
