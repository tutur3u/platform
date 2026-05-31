import { expect, test } from '@playwright/test';
import { assertSafeE2EEnvironment } from './helpers/environment';

type ModelCatalogResponse = {
  data?: Array<{
    id?: string;
    is_enabled?: boolean;
    name?: string | null;
    provider?: string | null;
    type?: string | null;
  }>;
  pagination?: {
    limit: number;
    page: number;
    total: number;
  };
};

test.describe('AI gateway models private schema API', () => {
  test.beforeAll(() => {
    assertSafeE2EEnvironment();
  });

  test('serves the private model catalog through the app API', async ({
    request,
  }) => {
    const response = await request.get(
      '/api/v1/infrastructure/ai/models?enabled=true&format=paginated&limit=5&type=all',
      { failOnStatusCode: false }
    );

    expect(response.status()).toBe(200);

    const body = (await response.json()) as ModelCatalogResponse;
    expect(body.pagination).toEqual(
      expect.objectContaining({
        limit: 5,
        page: 1,
      })
    );
    expect(body.pagination?.total ?? 0).toBeGreaterThan(0);
    expect(body.data?.length ?? 0).toBeGreaterThan(0);

    for (const model of body.data ?? []) {
      expect(model.id).toEqual(expect.any(String));
      expect(model.is_enabled).toBe(true);
      expect(model.provider).toEqual(expect.any(String));
      expect(model.type).toEqual(expect.any(String));
    }
  });
});
