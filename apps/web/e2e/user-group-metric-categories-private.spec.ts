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

test.describe('User group metric categories private schema API', () => {
  test.beforeAll(() => {
    assertSafeE2EEnvironment();
  });

  test('manages metric categories through the authenticated app API', async ({
    request,
  }) => {
    const groupId = randomUUID();
    const categoryName = `Private metric category ${groupId.slice(0, 8)}`;
    let categoryId: string | undefined;

    try {
      const groupResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/workspace_user_groups`,
        {
          data: {
            id: groupId,
            name: 'Private metric category E2E group',
            ws_id: ROOT_WORKSPACE_ID,
          },
          failOnStatusCode: false,
          headers: serviceHeaders({ prefer: 'return=minimal' }),
        }
      );

      expect(groupResponse.status()).toBe(201);

      const createResponse = await request.post(
        `/api/v1/workspaces/${ROOT_WORKSPACE_ID}/user-groups/${groupId}/indicators/categories`,
        {
          data: {
            description: 'Created through app API after private schema move',
            name: categoryName,
          },
          failOnStatusCode: false,
        }
      );

      expect(createResponse.status()).toBe(200);

      const createdCategory = (await createResponse.json()) as {
        description: string | null;
        id: string;
        name: string;
      };
      categoryId = createdCategory.id;

      expect(createdCategory).toEqual(
        expect.objectContaining({
          description: 'Created through app API after private schema move',
          name: categoryName,
        })
      );

      const listResponse = await request.get(
        `/api/v1/workspaces/${ROOT_WORKSPACE_ID}/user-groups/${groupId}/indicators`,
        { failOnStatusCode: false }
      );

      expect(listResponse.status()).toBe(200);

      const listBody = (await listResponse.json()) as {
        metricCategories: {
          description: string | null;
          id: string;
          name: string;
        }[];
      };

      expect(listBody.metricCategories).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            description: 'Created through app API after private schema move',
            id: categoryId,
            name: categoryName,
          }),
        ])
      );

      const deleteResponse = await request.delete(
        `/api/v1/workspaces/${ROOT_WORKSPACE_ID}/user-groups/${groupId}/indicators/categories/${categoryId}`,
        { failOnStatusCode: false }
      );

      expect(deleteResponse.status()).toBe(200);

      const afterDeleteResponse = await request.get(
        `/api/v1/workspaces/${ROOT_WORKSPACE_ID}/user-groups/${groupId}/indicators`,
        { failOnStatusCode: false }
      );

      expect(afterDeleteResponse.status()).toBe(200);

      const afterDeleteBody = (await afterDeleteResponse.json()) as {
        metricCategories: { id: string }[];
      };

      expect(
        afterDeleteBody.metricCategories.some(
          (category) => category.id === categoryId
        )
      ).toBe(false);
    } finally {
      if (categoryId) {
        await request.delete(
          `${SUPABASE_URL}/rest/v1/user_group_metric_category_links?category_id=eq.${categoryId}`,
          {
            failOnStatusCode: false,
            headers: serviceHeaders({ schema: 'private' }),
          }
        );
        await request.delete(
          `${SUPABASE_URL}/rest/v1/user_group_metric_categories?id=eq.${categoryId}`,
          {
            failOnStatusCode: false,
            headers: serviceHeaders({ schema: 'private' }),
          }
        );
      }

      await request.delete(
        `${SUPABASE_URL}/rest/v1/workspace_user_groups?id=eq.${groupId}`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders(),
        }
      );
    }
  });
});
