import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { TEST_USER } from './helpers/constants';
import {
  assertSafeE2EEnvironment,
  LOCAL_E2E_SUPABASE_SECRET_KEY,
  LOCAL_E2E_SUPABASE_URL,
} from './helpers/environment';

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? LOCAL_E2E_SUPABASE_URL;
const SUPABASE_SECRET_KEY =
  process.env.SUPABASE_SECRET_KEY ?? LOCAL_E2E_SUPABASE_SECRET_KEY;

type SchemaName = 'private' | 'public';

function serviceHeaders({
  prefer,
  schema,
}: {
  prefer?: string;
  schema?: SchemaName;
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

test.describe('Referral rewards and invoice discounts', () => {
  test.beforeAll(() => {
    assertSafeE2EEnvironment();
  });

  test('assigns receiver rewards and applies dynamic referral invoice discounts', async ({
    request,
  }) => {
    const workspaceId = randomUUID();
    const categoryId = randomUUID();
    const ownerId = randomUUID();
    const productId = randomUUID();
    const receiverPromotionId = randomUUID();
    const referrerUserId = randomUUID();
    const referredUserId = randomUUID();
    const unitId = randomUUID();
    const warehouseId = randomUUID();
    const slugSuffix = workspaceId.slice(0, 8);

    let referralPromotionId: string | null = null;

    try {
      const workspaceResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/workspaces`,
        {
          data: {
            creator_id: TEST_USER.id,
            handle: `e2e-referral-${slugSuffix}`,
            id: workspaceId,
            name: 'E2E Referral Rewards',
            personal: false,
          },
          failOnStatusCode: false,
          headers: serviceHeaders({ prefer: 'return=minimal' }),
        }
      );
      expect(workspaceResponse.status()).toBe(201);

      const usersResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/workspace_users`,
        {
          data: [
            {
              email: 'e2e-referrer@example.test',
              full_name: 'E2E Referrer',
              id: referrerUserId,
              ws_id: workspaceId,
            },
            {
              email: 'e2e-receiver@example.test',
              full_name: 'E2E Receiver',
              id: referredUserId,
              ws_id: workspaceId,
            },
          ],
          failOnStatusCode: false,
          headers: serviceHeaders({ prefer: 'return=minimal' }),
        }
      );
      expect(usersResponse.status()).toBe(201);

      const categoryResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/product_categories`,
        {
          data: {
            id: categoryId,
            name: 'E2E Referral Category',
            ws_id: workspaceId,
          },
          failOnStatusCode: false,
          headers: serviceHeaders({ prefer: 'return=minimal' }),
        }
      );
      expect(categoryResponse.status()).toBe(201);

      const ownerResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/inventory_owners`,
        {
          data: {
            id: ownerId,
            name: 'E2E Referral Owner',
            ws_id: workspaceId,
          },
          failOnStatusCode: false,
          headers: serviceHeaders({
            prefer: 'return=minimal',
            schema: 'private',
          }),
        }
      );
      expect(ownerResponse.status()).toBe(201);

      const productResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/workspace_products`,
        {
          data: {
            category_id: categoryId,
            id: productId,
            name: 'E2E Referral Product',
            owner_id: ownerId,
            ws_id: workspaceId,
          },
          failOnStatusCode: false,
          headers: serviceHeaders({ prefer: 'return=minimal' }),
        }
      );
      expect(productResponse.status()).toBe(201);

      const unitResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/inventory_units`,
        {
          data: {
            id: unitId,
            name: 'E2E Unit',
            ws_id: workspaceId,
          },
          failOnStatusCode: false,
          headers: serviceHeaders({
            prefer: 'return=minimal',
            schema: 'private',
          }),
        }
      );
      expect(unitResponse.status()).toBe(201);

      const warehouseResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/inventory_warehouses`,
        {
          data: {
            id: warehouseId,
            name: 'E2E Warehouse',
            ws_id: workspaceId,
          },
          failOnStatusCode: false,
          headers: serviceHeaders({
            prefer: 'return=minimal',
            schema: 'private',
          }),
        }
      );
      expect(warehouseResponse.status()).toBe(201);

      const stockResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/inventory_products`,
        {
          data: {
            amount: 10,
            price: 100,
            product_id: productId,
            unit_id: unitId,
            warehouse_id: warehouseId,
          },
          failOnStatusCode: false,
          headers: serviceHeaders({
            prefer: 'return=minimal',
            schema: 'private',
          }),
        }
      );
      expect(stockResponse.status()).toBe(201);

      const receiverPromotionResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/workspace_promotions`,
        {
          data: {
            code: `RECEIVER-${slugSuffix}`,
            id: receiverPromotionId,
            name: 'E2E Receiver Reward',
            use_ratio: true,
            value: 25,
            ws_id: workspaceId,
          },
          failOnStatusCode: false,
          headers: serviceHeaders({
            prefer: 'return=minimal',
            schema: 'private',
          }),
        }
      );
      expect(receiverPromotionResponse.status()).toBe(201);

      const settingsResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/workspace_settings`,
        {
          data: {
            referral_count_cap: 2,
            referral_increment_percent: 10,
            referral_promotion_id: receiverPromotionId,
            referral_reward_type: 'BOTH',
            ws_id: workspaceId,
          },
          failOnStatusCode: false,
          headers: serviceHeaders({ prefer: 'return=minimal' }),
        }
      );
      expect(settingsResponse.status()).toBe(201);

      const assignResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/rpc/assign_workspace_user_referral`,
        {
          data: {
            p_actor_user_id: referrerUserId,
            p_referred_user_id: referredUserId,
            p_referrer_user_id: referrerUserId,
            p_ws_id: workspaceId,
          },
          failOnStatusCode: false,
          headers: serviceHeaders({ schema: 'private' }),
        }
      );
      expect(assignResponse.status()).toBe(200);

      const [assignResult] = (await assignResponse.json()) as Array<{
        linked_promotion_id: string | null;
        referral_promotion_id: string | null;
        status: string;
      }>;
      expect(assignResult).toEqual(
        expect.objectContaining({
          linked_promotion_id: receiverPromotionId,
          status: 'success',
        })
      );
      expect(assignResult?.referral_promotion_id).toBeTruthy();
      referralPromotionId = assignResult.referral_promotion_id;

      const referredUserResponse = await request.get(
        `${SUPABASE_URL}/rest/v1/workspace_users?id=eq.${referredUserId}&select=referred_by`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders(),
        }
      );
      expect(referredUserResponse.status()).toBe(200);
      await expect(referredUserResponse.json()).resolves.toEqual([
        { referred_by: referrerUserId },
      ]);

      const receiverLinkResponse = await request.get(
        `${SUPABASE_URL}/rest/v1/user_linked_promotions?user_id=eq.${referredUserId}&promo_id=eq.${receiverPromotionId}&select=promo_id,user_id`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders({ schema: 'private' }),
        }
      );
      expect(receiverLinkResponse.status()).toBe(200);
      await expect(receiverLinkResponse.json()).resolves.toEqual([
        {
          promo_id: receiverPromotionId,
          user_id: referredUserId,
        },
      ]);

      const referralPromotionResponse = await request.get(
        `${SUPABASE_URL}/rest/v1/workspace_promotions?id=eq.${referralPromotionId}&select=id,owner_id,promo_type,use_ratio,value`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders({ schema: 'private' }),
        }
      );
      expect(referralPromotionResponse.status()).toBe(200);
      await expect(referralPromotionResponse.json()).resolves.toEqual([
        expect.objectContaining({
          id: referralPromotionId,
          owner_id: referrerUserId,
          promo_type: 'REFERRAL',
          use_ratio: true,
          value: 0,
        }),
      ]);

      const calculateResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/rpc/calculate_invoice_values`,
        {
          data: {
            p_frontend_discount_amount: null,
            p_frontend_subtotal: null,
            p_frontend_total: null,
            p_is_subscription_invoice: false,
            p_products: [
              {
                product_id: productId,
                quantity: 1,
                unit_id: unitId,
                warehouse_id: warehouseId,
              },
            ],
            p_promotion_id: referralPromotionId,
            p_ws_id: workspaceId,
          },
          failOnStatusCode: false,
          headers: serviceHeaders({ schema: 'private' }),
        }
      );
      expect(calculateResponse.status()).toBe(200);
      await expect(calculateResponse.json()).resolves.toEqual([
        expect.objectContaining({
          discount_amount: 10,
          promotion_id: referralPromotionId,
          promotion_use_ratio: true,
          promotion_value: 10,
          subtotal: 100,
          total: 90,
        }),
      ]);

      const removeResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/rpc/remove_workspace_user_referral`,
        {
          data: {
            p_actor_user_id: referrerUserId,
            p_referred_user_id: referredUserId,
            p_referrer_user_id: referrerUserId,
            p_ws_id: workspaceId,
          },
          failOnStatusCode: false,
          headers: serviceHeaders({ schema: 'private' }),
        }
      );
      expect(removeResponse.status()).toBe(200);
      await expect(removeResponse.json()).resolves.toEqual([
        {
          removed_promotion_id: receiverPromotionId,
          status: 'success',
        },
      ]);

      const removedUserResponse = await request.get(
        `${SUPABASE_URL}/rest/v1/workspace_users?id=eq.${referredUserId}&select=referred_by`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders(),
        }
      );
      expect(removedUserResponse.status()).toBe(200);
      await expect(removedUserResponse.json()).resolves.toEqual([
        { referred_by: null },
      ]);

      const removedLinkResponse = await request.get(
        `${SUPABASE_URL}/rest/v1/user_linked_promotions?user_id=eq.${referredUserId}&promo_id=eq.${receiverPromotionId}&select=promo_id,user_id`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders({ schema: 'private' }),
        }
      );
      expect(removedLinkResponse.status()).toBe(200);
      await expect(removedLinkResponse.json()).resolves.toEqual([]);
    } finally {
      await request.delete(
        `${SUPABASE_URL}/rest/v1/user_linked_promotions?user_id=in.(${referrerUserId},${referredUserId})`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders({
            prefer: 'return=minimal',
            schema: 'private',
          }),
        }
      );
      await request.delete(
        `${SUPABASE_URL}/rest/v1/workspace_promotions?ws_id=eq.${workspaceId}`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders({
            prefer: 'return=minimal',
            schema: 'private',
          }),
        }
      );
      await request.delete(
        `${SUPABASE_URL}/rest/v1/inventory_products?product_id=eq.${productId}`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders({
            prefer: 'return=minimal',
            schema: 'private',
          }),
        }
      );
      await request.delete(
        `${SUPABASE_URL}/rest/v1/workspace_products?id=eq.${productId}`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders({ prefer: 'return=minimal' }),
        }
      );
      await request.delete(
        `${SUPABASE_URL}/rest/v1/inventory_units?id=eq.${unitId}`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders({
            prefer: 'return=minimal',
            schema: 'private',
          }),
        }
      );
      await request.delete(
        `${SUPABASE_URL}/rest/v1/inventory_warehouses?id=eq.${warehouseId}`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders({
            prefer: 'return=minimal',
            schema: 'private',
          }),
        }
      );
      await request.delete(
        `${SUPABASE_URL}/rest/v1/inventory_owners?id=eq.${ownerId}`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders({
            prefer: 'return=minimal',
            schema: 'private',
          }),
        }
      );
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
