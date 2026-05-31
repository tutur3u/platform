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

test.describe('Workspace promotions private schema API', () => {
  test.beforeAll(() => {
    assertSafeE2EEnvironment();
  });

  test('manages promotion rows through private REST only', async ({
    request,
  }) => {
    const workspaceResponse = await request.get(
      `${SUPABASE_URL}/rest/v1/workspaces?select=id&limit=1`,
      {
        failOnStatusCode: false,
        headers: {
          apikey: SUPABASE_SECRET_KEY,
          authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
        },
      }
    );

    expect(workspaceResponse.status()).toBe(200);

    const [workspace] = (await workspaceResponse.json()) as Array<{
      id: string;
    }>;

    expect(workspace?.id).toBeTruthy();

    if (!workspace) {
      throw new Error('Expected at least one workspace in local seed data');
    }

    const promotionId = randomUUID();
    const name = `Private promotion ${Date.now()}`;

    try {
      const createResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/workspace_promotions`,
        {
          data: {
            code: `PROMO-${promotionId.slice(0, 8)}`,
            id: promotionId,
            name,
            use_ratio: false,
            value: 1000,
            ws_id: workspace.id,
          },
          failOnStatusCode: false,
          headers: serviceHeaders('return=minimal'),
        }
      );

      expect(createResponse.status()).toBe(201);

      const updateResponse = await request.patch(
        `${SUPABASE_URL}/rest/v1/workspace_promotions?id=eq.${promotionId}`,
        {
          data: {
            max_uses: 10,
            value: 1500,
          },
          failOnStatusCode: false,
          headers: serviceHeaders('return=minimal'),
        }
      );

      expect(updateResponse.status()).toBe(204);

      const readResponse = await request.get(
        `${SUPABASE_URL}/rest/v1/workspace_promotions?id=eq.${promotionId}&select=id,name,value,max_uses,current_uses,ws_id`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders(),
        }
      );

      expect(readResponse.status()).toBe(200);

      const promotions = (await readResponse.json()) as Array<{
        current_uses: number;
        id: string;
        max_uses: number | null;
        name: string | null;
        value: number;
        ws_id: string;
      }>;

      expect(promotions).toEqual([
        expect.objectContaining({
          current_uses: 0,
          id: promotionId,
          max_uses: 10,
          name,
          value: 1500,
          ws_id: workspace.id,
        }),
      ]);
    } finally {
      await request.delete(
        `${SUPABASE_URL}/rest/v1/workspace_promotions?id=eq.${promotionId}`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders(),
        }
      );
    }
  });
});
