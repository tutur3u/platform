import { expect, test } from '@playwright/test';
import { assertSafeE2EEnvironment } from './helpers/environment';

const ROOT_WORKSPACE_ID = '00000000-0000-0000-0000-000000000000';

type MigrationListResponse = {
  count?: number;
  data?: unknown[];
};

test.describe('External user monthly reports private schema APIs', () => {
  test.beforeAll(() => {
    assertSafeE2EEnvironment();
  });

  test('serves monthly reports through the app infrastructure API', async ({
    request,
  }) => {
    const response = await request.get(
      `/api/v1/infrastructure/user-monthly-reports?ws_id=${ROOT_WORKSPACE_ID}&limit=1`,
      { failOnStatusCode: false }
    );

    expect(response.status()).toBe(200);

    const body = (await response.json()) as MigrationListResponse;
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.count).toEqual(expect.any(Number));
  });

  test('serves monthly report logs through the app infrastructure API', async ({
    request,
  }) => {
    const response = await request.get(
      `/api/v1/infrastructure/user-monthly-report-logs?ws_id=${ROOT_WORKSPACE_ID}&limit=1`,
      { failOnStatusCode: false }
    );

    expect(response.status()).toBe(200);

    const body = (await response.json()) as MigrationListResponse;
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.count).toEqual(expect.any(Number));
  });
});
