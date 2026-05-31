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

function serviceHeaders(profile?: 'private') {
  return {
    apikey: SUPABASE_SECRET_KEY,
    authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
    'content-type': 'application/json',
    ...(profile
      ? {
          'accept-profile': profile,
          'content-profile': profile,
        }
      : {}),
  };
}

test.describe('User linked promotions private schema API', () => {
  test.beforeAll(() => {
    assertSafeE2EEnvironment();
  });

  test('manages user promotion links through private REST only', async ({
    request,
  }) => {
    const workspaceUserResponse = await request.get(
      `${SUPABASE_URL}/rest/v1/workspace_users?select=id,ws_id&limit=1`,
      {
        failOnStatusCode: false,
        headers: serviceHeaders(),
      }
    );

    expect(workspaceUserResponse.status()).toBe(200);

    const [workspaceUser] = (await workspaceUserResponse.json()) as Array<{
      id: string;
      ws_id: string;
    }>;

    expect(workspaceUser?.id).toBeTruthy();
    expect(workspaceUser?.ws_id).toBeTruthy();

    if (!workspaceUser) {
      throw new Error(
        'Expected at least one workspace user in local seed data'
      );
    }

    const promoId = randomUUID();
    const promoName = `Private user link promo ${Date.now()}`;

    try {
      const createPromoResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/workspace_promotions`,
        {
          data: {
            code: `E2E-${promoId.slice(0, 8)}`,
            creator_id: workspaceUser.id,
            id: promoId,
            name: promoName,
            value: 15,
            ws_id: workspaceUser.ws_id,
          },
          failOnStatusCode: false,
          headers: {
            ...serviceHeaders(),
            prefer: 'return=minimal',
          },
        }
      );

      expect(createPromoResponse.status()).toBe(201);

      const createLinkResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/user_linked_promotions`,
        {
          data: {
            promo_id: promoId,
            user_id: workspaceUser.id,
          },
          failOnStatusCode: false,
          headers: {
            ...serviceHeaders('private'),
            prefer: 'return=minimal',
          },
        }
      );

      expect(createLinkResponse.status()).toBe(201);

      const readLinkResponse = await request.get(
        `${SUPABASE_URL}/rest/v1/user_linked_promotions?user_id=eq.${workspaceUser.id}&promo_id=eq.${promoId}&select=user_id,promo_id`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders('private'),
        }
      );

      expect(readLinkResponse.status()).toBe(200);

      const links = (await readLinkResponse.json()) as Array<{
        promo_id: string;
        user_id: string;
      }>;

      expect(links).toEqual([
        {
          promo_id: promoId,
          user_id: workspaceUser.id,
        },
      ]);
    } finally {
      await request.delete(
        `${SUPABASE_URL}/rest/v1/user_linked_promotions?user_id=eq.${workspaceUser.id}&promo_id=eq.${promoId}`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders('private'),
        }
      );

      await request.delete(
        `${SUPABASE_URL}/rest/v1/workspace_promotions?id=eq.${promoId}`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders(),
        }
      );
    }
  });
});
