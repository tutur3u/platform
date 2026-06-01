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

test.describe('Workspace debt loans private schema API', () => {
  test.beforeAll(() => {
    assertSafeE2EEnvironment();
  });

  test('manages debt loans through authenticated app APIs', async ({
    request,
  }) => {
    const debtName = `Private debt loan ${Date.now()}`;
    const updatedDebtName = `${debtName} updated`;
    const walletId = randomUUID();
    const transactionId = randomUUID();
    const debtTransactionId = randomUUID();
    let debtId: string | undefined;

    try {
      const createResponse = await request.post(
        `/api/v1/workspaces/${ROOT_WORKSPACE_ID}/finance/debts`,
        {
          data: {
            counterparty: 'Private schema lender',
            currency: 'VND',
            description: 'Created through app API after private schema move',
            name: debtName,
            principal_amount: 10000,
            start_date: '2030-01-15',
            type: 'debt',
          },
          failOnStatusCode: false,
        }
      );

      expect(createResponse.status()).toBe(201);
      const createdDebt = (await createResponse.json()) as {
        counterparty: string | null;
        description: string | null;
        id: string;
        name: string;
        principal_amount: number;
        type: string;
        ws_id: string;
      };
      debtId = createdDebt.id;

      expect(createdDebt).toEqual(
        expect.objectContaining({
          counterparty: 'Private schema lender',
          description: 'Created through app API after private schema move',
          name: debtName,
          principal_amount: 10000,
          type: 'debt',
          ws_id: ROOT_WORKSPACE_ID,
        })
      );

      const walletResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/workspace_wallets`,
        {
          data: {
            currency: 'VND',
            id: walletId,
            name: 'Private debt loan E2E wallet',
            type: 'STANDARD',
            ws_id: ROOT_WORKSPACE_ID,
          },
          failOnStatusCode: false,
          headers: serviceHeaders({
            prefer: 'return=minimal',
            schema: 'private',
          }),
        }
      );

      expect(walletResponse.status()).toBe(201);

      const transactionResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/wallet_transactions`,
        {
          data: {
            amount: 2500,
            description: 'Private debt loan E2E payment',
            id: transactionId,
            wallet_id: walletId,
          },
          failOnStatusCode: false,
          headers: serviceHeaders({ prefer: 'return=minimal' }),
        }
      );

      expect(transactionResponse.status()).toBe(201);

      const debtTransactionResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/workspace_debt_loan_transactions`,
        {
          data: {
            amount: 2500,
            debt_loan_id: debtId,
            id: debtTransactionId,
            is_interest: false,
            note: 'Private debt loan E2E link',
            transaction_id: transactionId,
          },
          failOnStatusCode: false,
          headers: serviceHeaders({
            prefer: 'return=minimal',
            schema: 'private',
          }),
        }
      );

      expect(debtTransactionResponse.status()).toBe(201);

      const detailResponse = await request.get(
        `/api/v1/workspaces/${ROOT_WORKSPACE_ID}/finance/debts/${debtId}`,
        { failOnStatusCode: false }
      );

      expect(detailResponse.status()).toBe(200);
      const detailBody = (await detailResponse.json()) as {
        id: string;
        progress_percentage: number;
        remaining_balance: number;
        total_paid: number;
      };
      expect(detailBody).toEqual(
        expect.objectContaining({
          id: debtId,
          progress_percentage: 25,
          remaining_balance: 7500,
          total_paid: 2500,
        })
      );

      const listResponse = await request.get(
        `/api/v1/workspaces/${ROOT_WORKSPACE_ID}/finance/debts?type=debt&status=active`,
        { failOnStatusCode: false }
      );

      expect(listResponse.status()).toBe(200);
      const listBody = (await listResponse.json()) as {
        id: string;
        name: string;
        remaining_balance: number;
      }[];

      expect(listBody).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: debtId,
            name: debtName,
            remaining_balance: 7500,
          }),
        ])
      );

      const updateResponse = await request.put(
        `/api/v1/workspaces/${ROOT_WORKSPACE_ID}/finance/debts/${debtId}`,
        {
          data: {
            name: updatedDebtName,
            status: 'paid',
          },
          failOnStatusCode: false,
        }
      );

      expect(updateResponse.status()).toBe(200);
      const updatedDebt = (await updateResponse.json()) as {
        id: string;
        name: string;
        status: string;
      };

      expect(updatedDebt).toEqual(
        expect.objectContaining({
          id: debtId,
          name: updatedDebtName,
          status: 'paid',
        })
      );

      const deleteResponse = await request.delete(
        `/api/v1/workspaces/${ROOT_WORKSPACE_ID}/finance/debts/${debtId}`,
        { failOnStatusCode: false }
      );

      expect(deleteResponse.status()).toBe(200);
      await expect(deleteResponse.json()).resolves.toEqual({
        message: 'Deleted successfully',
      });
      debtId = undefined;
    } finally {
      await request.delete(
        `${SUPABASE_URL}/rest/v1/workspace_debt_loan_transactions?id=eq.${debtTransactionId}`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders({ schema: 'private' }),
        }
      );

      if (debtId) {
        await request.delete(
          `${SUPABASE_URL}/rest/v1/workspace_debt_loans?id=eq.${debtId}`,
          {
            failOnStatusCode: false,
            headers: serviceHeaders({ schema: 'private' }),
          }
        );
      }

      await request.delete(
        `${SUPABASE_URL}/rest/v1/wallet_transactions?id=eq.${transactionId}`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders(),
        }
      );

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
