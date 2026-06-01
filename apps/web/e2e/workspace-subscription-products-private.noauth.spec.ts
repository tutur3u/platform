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

test.describe('Workspace subscription products private schema API', () => {
  test.beforeAll(() => {
    assertSafeE2EEnvironment();
  });

  test('manages subscription product rows through private REST only', async ({
    request,
  }) => {
    const productId = randomUUID();
    const productName = `Private subscription product ${Date.now()}`;

    try {
      const createResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/workspace_subscription_products`,
        {
          data: {
            id: productId,
            name: productName,
            price: 0,
            pricing_model: 'free',
            tier: 'FREE',
          },
          failOnStatusCode: false,
          headers: serviceHeaders('return=minimal'),
        }
      );

      expect(createResponse.status()).toBe(201);

      const updateResponse = await request.patch(
        `${SUPABASE_URL}/rest/v1/workspace_subscription_products?id=eq.${productId}`,
        {
          data: {
            description: 'Private schema E2E product',
          },
          failOnStatusCode: false,
          headers: serviceHeaders('return=minimal'),
        }
      );

      expect(updateResponse.status()).toBe(204);

      const readResponse = await request.get(
        `${SUPABASE_URL}/rest/v1/workspace_subscription_products?id=eq.${productId}&select=id,name,description,pricing_model,tier`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders(),
        }
      );

      expect(readResponse.status()).toBe(200);

      const products = (await readResponse.json()) as Array<{
        description: string | null;
        id: string;
        name: string | null;
        pricing_model: string;
        tier: string;
      }>;

      expect(products).toEqual([
        expect.objectContaining({
          description: 'Private schema E2E product',
          id: productId,
          name: productName,
          pricing_model: 'free',
          tier: 'FREE',
        }),
      ]);
    } finally {
      await request.delete(
        `${SUPABASE_URL}/rest/v1/workspace_subscription_products?id=eq.${productId}`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders(),
        }
      );
    }
  });
});
