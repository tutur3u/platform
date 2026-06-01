import { expect, test } from '@playwright/test';
import {
  assertSafeE2EEnvironment,
  LOCAL_E2E_SUPABASE_PUBLISHABLE_KEY,
  LOCAL_E2E_SUPABASE_SECRET_KEY,
  LOCAL_E2E_SUPABASE_URL,
} from './helpers/environment';

const ROOT_WORKSPACE_ID = '00000000-0000-0000-0000-000000000000';
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? LOCAL_E2E_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  LOCAL_E2E_SUPABASE_PUBLISHABLE_KEY;
const SUPABASE_SECRET_KEY =
  process.env.SUPABASE_SECRET_KEY ?? LOCAL_E2E_SUPABASE_SECRET_KEY;

const PUBLIC_POST_RPCS = [
  {
    name: 'get_workspace_post_review_rows',
    payload: {
      p_limit: 1,
      p_offset: 0,
      p_ws_id: ROOT_WORKSPACE_ID,
    },
  },
  {
    name: 'get_workspace_post_review_summary',
    payload: {
      p_ws_id: ROOT_WORKSPACE_ID,
    },
  },
  {
    name: 'get_workspace_post_email_rows',
    payload: {
      p_limit: 1,
      p_offset: 0,
      p_ws_id: ROOT_WORKSPACE_ID,
    },
  },
  {
    name: 'get_workspace_post_email_status_summary',
    payload: {
      p_ws_id: ROOT_WORKSPACE_ID,
    },
  },
] as const;

function publicRpcHeaders() {
  return {
    apikey: SUPABASE_PUBLISHABLE_KEY,
    authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
    'content-type': 'application/json',
  };
}

function privateServiceRpcHeaders() {
  return {
    apikey: SUPABASE_SECRET_KEY,
    authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
    'accept-profile': 'private',
    'content-profile': 'private',
    'content-type': 'application/json',
  };
}

test.describe('User group post RPC exposure', () => {
  test.beforeAll(() => {
    assertSafeE2EEnvironment();
  });

  test('keeps post dashboard RPCs private while the authenticated app API still works', async ({
    request,
  }) => {
    for (const rpc of PUBLIC_POST_RPCS) {
      const response = await request.post(
        `${SUPABASE_URL}/rest/v1/rpc/${rpc.name}`,
        {
          data: rpc.payload,
          failOnStatusCode: false,
          headers: publicRpcHeaders(),
        }
      );

      expect(response.status()).not.toBe(200);
    }

    const appResponse = await request.get(
      `/api/v1/workspaces/${ROOT_WORKSPACE_ID}/posts?pageSize=1`,
      { failOnStatusCode: false }
    );
    test.skip(
      appResponse.status() === 401 || appResponse.status() === 403,
      'Seed user does not have post dashboard access in this local database'
    );
    expect(appResponse.status()).toBe(200);
    const appBody = (await appResponse.json()) as {
      count?: number;
      data?: unknown[];
      summary?: Record<string, unknown>;
    };
    expect(appBody).toEqual(
      expect.objectContaining({
        count: expect.any(Number),
        data: expect.any(Array),
        summary: expect.any(Object),
      })
    );

    const privateSummaryResponse = await request.post(
      `${SUPABASE_URL}/rest/v1/rpc/get_workspace_post_review_summary`,
      {
        data: {
          p_ws_id: ROOT_WORKSPACE_ID,
        },
        failOnStatusCode: false,
        headers: privateServiceRpcHeaders(),
      }
    );
    expect(privateSummaryResponse.status()).toBe(200);
  });
});
