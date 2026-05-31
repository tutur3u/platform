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

test.describe('Workspace credit packs private schema API', () => {
  test.beforeAll(() => {
    assertSafeE2EEnvironment();
  });

  test('manages credit-pack catalog rows through private REST only', async ({
    request,
  }) => {
    const creditPackId = randomUUID();
    const name = `Private credit pack ${Date.now()}`;

    try {
      const createResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/workspace_credit_packs`,
        {
          data: {
            currency: 'usd',
            description: 'Created by private schema E2E coverage',
            expiry_days: 60,
            id: creditPackId,
            name,
            price: 9900,
            tokens: 5000,
          },
          failOnStatusCode: false,
          headers: serviceHeaders('return=minimal'),
        }
      );

      expect(createResponse.status()).toBe(201);

      const readResponse = await request.get(
        `${SUPABASE_URL}/rest/v1/workspace_credit_packs?id=eq.${creditPackId}&select=id,name,price,tokens,archived`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders(),
        }
      );

      expect(readResponse.status()).toBe(200);

      const creditPacks = (await readResponse.json()) as Array<{
        archived: boolean;
        id: string;
        name: string;
        price: number;
        tokens: number;
      }>;

      expect(creditPacks).toEqual([
        expect.objectContaining({
          archived: false,
          id: creditPackId,
          name,
          price: 9900,
          tokens: 5000,
        }),
      ]);
    } finally {
      await request.delete(
        `${SUPABASE_URL}/rest/v1/workspace_credit_packs?id=eq.${creditPackId}`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders(),
        }
      );
    }
  });
});
