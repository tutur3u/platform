import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import {
  assertSafeE2EEnvironment,
  LOCAL_E2E_SUPABASE_SECRET_KEY,
  LOCAL_E2E_SUPABASE_URL,
} from './helpers/environment';

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? LOCAL_E2E_SUPABASE_URL;
const SUPABASE_SECRET_KEY =
  process.env.SUPABASE_SECRET_KEY ?? LOCAL_E2E_SUPABASE_SECRET_KEY;

function serviceHeaders(prefer?: string) {
  return {
    apikey: SUPABASE_SECRET_KEY,
    authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
    'content-type': 'application/json',
    'accept-profile': 'private',
    'content-profile': 'private',
    ...(prefer ? { prefer } : {}),
  };
}

test.describe('Nova teams private schema API', () => {
  test.beforeAll(() => {
    assertSafeE2EEnvironment();
  });

  test('manages Nova team metadata through private REST only', async ({
    request,
  }) => {
    const teamId = randomUUID();
    const teamName = `Private Nova team ${Date.now()}`;

    try {
      const createResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/nova_teams`,
        {
          data: {
            description: 'Created by private schema E2E coverage',
            goals: 'Keep Nova team metadata private',
            id: teamId,
            name: teamName,
          },
          failOnStatusCode: false,
          headers: serviceHeaders('return=minimal'),
        }
      );

      expect(createResponse.status()).toBe(201);

      const updateResponse = await request.patch(
        `${SUPABASE_URL}/rest/v1/nova_teams?id=eq.${teamId}`,
        {
          data: {
            goals: 'Validate private updates',
          },
          failOnStatusCode: false,
          headers: serviceHeaders('return=minimal'),
        }
      );

      expect(updateResponse.status()).toBe(204);

      const readResponse = await request.get(
        `${SUPABASE_URL}/rest/v1/nova_teams?id=eq.${teamId}&select=id,name,description,goals`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders(),
        }
      );

      expect(readResponse.status()).toBe(200);

      await expect(readResponse.json()).resolves.toEqual([
        expect.objectContaining({
          description: 'Created by private schema E2E coverage',
          goals: 'Validate private updates',
          id: teamId,
          name: teamName,
        }),
      ]);
    } finally {
      await request.delete(
        `${SUPABASE_URL}/rest/v1/nova_teams?id=eq.${teamId}`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders(),
        }
      );
    }
  });
});
