import { type APIRequestContext, expect, test } from '@playwright/test';
import { TEST_USER } from './helpers/constants';
import {
  assertSafeE2EEnvironment,
  LOCAL_E2E_SUPABASE_PUBLISHABLE_KEY,
  LOCAL_E2E_SUPABASE_URL,
} from './helpers/environment';

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? LOCAL_E2E_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  LOCAL_E2E_SUPABASE_PUBLISHABLE_KEY;

async function createSupabaseAccessToken(request: APIRequestContext) {
  const response = await request.post(
    `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      data: {
        email: TEST_USER.email,
        password: TEST_USER.password,
      },
      failOnStatusCode: false,
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        'content-type': 'application/json',
      },
    }
  );

  expect(response.status()).toBe(200);
  const body = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
  };
  expect(body.access_token).toEqual(expect.any(String));
  expect(body.refresh_token).toEqual(expect.any(String));

  return body.access_token;
}

test.describe('CLI auth start bearer isolation', () => {
  test.beforeAll(() => {
    assertSafeE2EEnvironment();
  });

  test('does not exchange a Supabase bearer token for a CLI copy token', async ({
    request,
  }) => {
    const accessToken = await createSupabaseAccessToken(request);

    const response = await request.get(
      '/api/cli/auth/start?state=e2e-bearer-only&mode=copy',
      {
        failOnStatusCode: false,
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${accessToken}`,
        },
        maxRedirects: 0,
      }
    );

    expect(response.status()).toBe(307);
    expect(response.headers().location).toContain('/login');
    expect(response.headers()['cache-control'] ?? '').not.toContain('no-store');
    expect(await response.text()).not.toContain('cli-token');
  });
});
