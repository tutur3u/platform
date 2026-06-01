import { randomUUID } from 'node:crypto';
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

test.describe('Workspace wallets private schema API', () => {
  test.beforeAll(() => {
    assertSafeE2EEnvironment();
  });

  test('manages wallets through authenticated app APIs', async ({
    request,
  }) => {
    const walletId = randomUUID();
    const walletName = `Private wallet ${Date.now()}`;
    const updatedWalletName = `${walletName} updated`;

    try {
      const createResponse = await request.post(
        `/api/workspaces/${ROOT_WORKSPACE_ID}/wallets`,
        {
          data: {
            balance: 5000,
            currency: 'VND',
            id: walletId,
            name: walletName,
            report_opt_in: true,
            type: 'STANDARD',
          },
          failOnStatusCode: false,
        }
      );

      expect(createResponse.status()).toBe(200);
      await expect(createResponse.json()).resolves.toEqual({
        message: 'success',
      });

      const detailResponse = await request.get(
        `/api/workspaces/${ROOT_WORKSPACE_ID}/wallets/${walletId}`,
        { failOnStatusCode: false }
      );

      expect(detailResponse.status()).toBe(200);
      const detail = (await detailResponse.json()) as {
        balance: number;
        id: string;
        name: string;
        ws_id: string;
      };
      expect(detail).toEqual(
        expect.objectContaining({
          balance: 5000,
          id: walletId,
          name: walletName,
          ws_id: ROOT_WORKSPACE_ID,
        })
      );

      const listResponse = await request.get(
        `/api/workspaces/${ROOT_WORKSPACE_ID}/wallets`,
        { failOnStatusCode: false }
      );

      expect(listResponse.status()).toBe(200);
      const list = (await listResponse.json()) as Array<{
        id: string;
        name: string;
      }>;
      expect(list).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: walletId,
            name: walletName,
          }),
        ])
      );

      const updateResponse = await request.put(
        `/api/workspaces/${ROOT_WORKSPACE_ID}/wallets/${walletId}`,
        {
          data: {
            description: 'Updated through private schema E2E',
            name: updatedWalletName,
          },
          failOnStatusCode: false,
        }
      );

      expect(updateResponse.status()).toBe(200);
      await expect(updateResponse.json()).resolves.toEqual({
        message: 'success',
      });

      const privateReadResponse = await request.get(
        `${SUPABASE_URL}/rest/v1/workspace_wallets?id=eq.${walletId}&select=id,name,description`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders({ schema: 'private' }),
        }
      );

      expect(privateReadResponse.status()).toBe(200);
      await expect(privateReadResponse.json()).resolves.toEqual([
        expect.objectContaining({
          description: 'Updated through private schema E2E',
          id: walletId,
          name: updatedWalletName,
        }),
      ]);

      const deleteResponse = await request.delete(
        `/api/workspaces/${ROOT_WORKSPACE_ID}/wallets/${walletId}`,
        { failOnStatusCode: false }
      );

      expect(deleteResponse.status()).toBe(200);
      await expect(deleteResponse.json()).resolves.toEqual({
        message: 'success',
      });
    } finally {
      await request.delete(
        `${SUPABASE_URL}/rest/v1/workspace_wallets?id=eq.${walletId}`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders({ schema: 'private' }),
        }
      );
    }
  });
});
