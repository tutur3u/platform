import { randomUUID } from 'node:crypto';
import { type APIRequestContext, expect, test } from '@playwright/test';
import { TEST_USER } from './helpers/constants';
import {
  assertSafeE2EEnvironment,
  LOCAL_E2E_SUPABASE_PUBLISHABLE_KEY,
  LOCAL_E2E_SUPABASE_SECRET_KEY,
  LOCAL_E2E_SUPABASE_URL,
  SAFE_LOCAL_SUPABASE_ORIGINS,
} from './helpers/environment';

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? LOCAL_E2E_SUPABASE_URL;
const SUPABASE_SECRET_KEY =
  process.env.SUPABASE_SECRET_KEY ?? LOCAL_E2E_SUPABASE_SECRET_KEY;
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  LOCAL_E2E_SUPABASE_PUBLISHABLE_KEY;

function assertLocalSupabase() {
  try {
    if (!SAFE_LOCAL_SUPABASE_ORIGINS.has(new URL(SUPABASE_URL).origin)) {
      throw new Error('non-local');
    }
  } catch {
    throw new Error(`Refusing to run E2E with non-local Supabase URL.`);
  }
}

function serviceHeaders(prefer?: string) {
  return {
    apikey: SUPABASE_SECRET_KEY,
    authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
    'content-type': 'application/json',
    ...(prefer ? { prefer } : {}),
  };
}

function anonHeaders() {
  return {
    apikey: SUPABASE_ANON_KEY,
    authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    'content-type': 'application/json',
  };
}

async function createWorkspace(
  request: APIRequestContext,
  workspaceId: string
) {
  const response = await request.post(`${SUPABASE_URL}/rest/v1/workspaces`, {
    data: {
      creator_id: TEST_USER.id,
      handle: `e2e-upl-${workspaceId.slice(0, 8)}`,
      id: workspaceId,
      name: 'E2E Profile Links',
      personal: false,
    },
    failOnStatusCode: false,
    headers: serviceHeaders('return=minimal'),
  });
  expect(response.status()).toBe(201);
}

async function createWorkspaceUser(
  request: APIRequestContext,
  workspaceId: string,
  userId: string
) {
  const response = await request.post(
    `${SUPABASE_URL}/rest/v1/workspace_users`,
    {
      data: { id: userId, ws_id: workspaceId, display_name: '' },
      failOnStatusCode: false,
      headers: serviceHeaders('return=minimal'),
    }
  );
  expect(response.status()).toBe(201);
}

async function cleanup(request: APIRequestContext, workspaceId: string) {
  // Links cascade to submissions; workspace_users and the workspace go last.
  await request.delete(
    `${SUPABASE_URL}/rest/v1/workspace_user_profile_links?ws_id=eq.${workspaceId}`,
    { failOnStatusCode: false, headers: serviceHeaders('return=minimal') }
  );
  await request.delete(
    `${SUPABASE_URL}/rest/v1/workspace_users?ws_id=eq.${workspaceId}`,
    { failOnStatusCode: false, headers: serviceHeaders('return=minimal') }
  );
  await request.delete(
    `${SUPABASE_URL}/rest/v1/workspaces?id=eq.${workspaceId}`,
    { failOnStatusCode: false, headers: serviceHeaders('return=minimal') }
  );
}

test.describe('External profile-completion links — public surface', () => {
  test.beforeAll(() => {
    assertSafeE2EEnvironment();
    assertLocalSupabase();
  });

  test('auth-required links reject unauthenticated submit and avatar', async ({
    request,
  }) => {
    const workspaceId = randomUUID();
    const workspaceUserId = randomUUID();
    const code = `authreq-${workspaceId.slice(0, 8)}`;
    try {
      await createWorkspace(request, workspaceId);
      await createWorkspaceUser(request, workspaceId, workspaceUserId);

      // requires_auth defaults to true.
      const created = await request.post(
        `${SUPABASE_URL}/rest/v1/workspace_user_profile_links`,
        {
          data: {
            ws_id: workspaceId,
            creator_id: TEST_USER.id,
            code,
            mode: 'per_user',
            target_user_id: workspaceUserId,
            allowed_fields: ['display_name', 'avatar_url'],
          },
          failOnStatusCode: false,
          headers: serviceHeaders('return=minimal'),
        }
      );
      expect(created.status()).toBe(201);

      const submit = await request.post(
        `/api/v1/public/user-profile-links/${code}/submit`,
        {
          data: { fields: { display_name: 'Anon' } },
          failOnStatusCode: false,
        }
      );
      expect(submit.status()).toBe(401);

      const avatar = await request.post(
        `/api/v1/public/user-profile-links/${code}/avatar`,
        { data: { contentType: 'image/jpeg' }, failOnStatusCode: false }
      );
      expect(avatar.status()).toBe(401);
    } finally {
      await cleanup(request, workspaceId);
    }
  });

  test('unknown link codes return 404, not 401', async ({ request }) => {
    const submit = await request.post(
      '/api/v1/public/user-profile-links/nonexistent-code/submit',
      {
        data: { fields: { display_name: 'Anon' } },
        failOnStatusCode: false,
      }
    );
    expect(submit.status()).toBe(404);

    const avatar = await request.post(
      '/api/v1/public/user-profile-links/nonexistent-code/avatar',
      {
        data: { contentType: 'image/jpeg' },
        failOnStatusCode: false,
      }
    );
    expect(avatar.status()).toBe(404);
  });

  test('no-auth links accept anonymous submissions with a null actor', async ({
    request,
  }) => {
    const workspaceId = randomUUID();
    const workspaceUserId = randomUUID();
    const code = `noauth-${workspaceId.slice(0, 8)}`;
    try {
      await createWorkspace(request, workspaceId);
      await createWorkspaceUser(request, workspaceId, workspaceUserId);

      const created = await request.post(
        `${SUPABASE_URL}/rest/v1/workspace_user_profile_links`,
        {
          data: {
            ws_id: workspaceId,
            creator_id: TEST_USER.id,
            code,
            mode: 'per_user',
            target_user_id: workspaceUserId,
            allowed_fields: ['display_name'],
            requires_auth: false,
          },
          failOnStatusCode: false,
          headers: serviceHeaders('return=minimal'),
        }
      );
      expect(created.status()).toBe(201);

      const submit = await request.post(
        `/api/v1/public/user-profile-links/${code}/submit`,
        {
          data: { fields: { display_name: 'Anon Filled' } },
          failOnStatusCode: false,
        }
      );
      expect(submit.status()).toBe(200);

      const subs = await request.get(
        `${SUPABASE_URL}/rest/v1/workspace_user_profile_link_submissions?ws_id=eq.${workspaceId}`,
        { failOnStatusCode: false, headers: serviceHeaders() }
      );
      expect(subs.ok()).toBe(true);
      const rows = (await subs.json()) as Array<{
        actor_auth_uid: string | null;
      }>;
      expect(rows.length).toBe(1);
      expect(rows[0]?.actor_auth_uid).toBeNull();
    } finally {
      await cleanup(request, workspaceId);
    }
  });

  test('workspace profile-link management requires authentication', async ({
    request,
  }) => {
    const workspaceId = randomUUID();

    const list = await request.get(
      `/api/v1/workspaces/${workspaceId}/user-profile-links`,
      { failOnStatusCode: false }
    );
    expect([401, 403, 404]).toContain(list.status());

    const create = await request.post(
      `/api/v1/workspaces/${workspaceId}/user-profile-links`,
      {
        data: { mode: 'generic', allowed_fields: ['display_name'] },
        failOnStatusCode: false,
      }
    );
    expect([401, 403, 404]).toContain(create.status());
  });

  test('anonymous PostgREST cannot read profile links', async ({ request }) => {
    const workspaceId = randomUUID();
    try {
      await createWorkspace(request, workspaceId);
      const insert = await request.post(
        `${SUPABASE_URL}/rest/v1/workspace_user_profile_links`,
        {
          data: {
            ws_id: workspaceId,
            code: `anon-${workspaceId.slice(0, 8)}`,
            creator_id: TEST_USER.id,
            mode: 'generic',
            allowed_fields: ['display_name'],
          },
          failOnStatusCode: false,
          headers: serviceHeaders('return=minimal'),
        }
      );
      expect(insert.status()).toBe(201);

      const anon = await request.get(
        `${SUPABASE_URL}/rest/v1/workspace_user_profile_links?ws_id=eq.${workspaceId}`,
        { failOnStatusCode: false, headers: anonHeaders() }
      );
      if (anon.ok()) {
        // RLS may allow the query but must filter out rows for non-members.
        expect(await anon.json()).toEqual([]);
      } else {
        expect(anon.status()).toBeGreaterThanOrEqual(400);
      }

      const service = await request.get(
        `${SUPABASE_URL}/rest/v1/workspace_user_profile_links?ws_id=eq.${workspaceId}`,
        { failOnStatusCode: false, headers: serviceHeaders() }
      );
      expect(service.ok()).toBe(true);
      expect((await service.json()).length).toBe(1);
    } finally {
      await cleanup(request, workspaceId);
    }
  });

  test('database constraints reject invalid profile links', async ({
    request,
  }) => {
    const workspaceId = randomUUID();
    const workspaceUserId = randomUUID();
    try {
      await createWorkspace(request, workspaceId);
      await createWorkspaceUser(request, workspaceId, workspaceUserId);

      const base = {
        ws_id: workspaceId,
        creator_id: TEST_USER.id,
      };

      const emptyFields = await request.post(
        `${SUPABASE_URL}/rest/v1/workspace_user_profile_links`,
        {
          data: {
            ...base,
            code: randomUUID(),
            mode: 'generic',
            allowed_fields: [],
          },
          failOnStatusCode: false,
          headers: serviceHeaders('return=minimal'),
        }
      );
      expect(emptyFields.status()).toBe(400);

      const perUserNoTarget = await request.post(
        `${SUPABASE_URL}/rest/v1/workspace_user_profile_links`,
        {
          data: {
            ...base,
            code: randomUUID(),
            mode: 'per_user',
            allowed_fields: ['display_name'],
          },
          failOnStatusCode: false,
          headers: serviceHeaders('return=minimal'),
        }
      );
      expect(perUserNoTarget.status()).toBe(400);

      const invalidField = await request.post(
        `${SUPABASE_URL}/rest/v1/workspace_user_profile_links`,
        {
          data: {
            ...base,
            code: randomUUID(),
            mode: 'generic',
            allowed_fields: ['not_a_field'],
          },
          failOnStatusCode: false,
          headers: serviceHeaders('return=minimal'),
        }
      );
      expect(invalidField.status()).toBe(400);

      const validGeneric = await request.post(
        `${SUPABASE_URL}/rest/v1/workspace_user_profile_links`,
        {
          data: {
            ...base,
            code: randomUUID(),
            mode: 'generic',
            allowed_fields: ['display_name', 'email', 'phone'],
            prefill_existing_values: false,
          },
          failOnStatusCode: false,
          headers: serviceHeaders('return=minimal'),
        }
      );
      expect(validGeneric.status()).toBe(201);
    } finally {
      await cleanup(request, workspaceId);
    }
  });

  test('stats view reports usage, limits, and revocation', async ({
    request,
  }) => {
    const workspaceId = randomUUID();
    const workspaceUserId = randomUUID();
    const code = `stats-${workspaceId.slice(0, 8)}`;
    try {
      await createWorkspace(request, workspaceId);
      await createWorkspaceUser(request, workspaceId, workspaceUserId);

      const created = await request.post(
        `${SUPABASE_URL}/rest/v1/workspace_user_profile_links`,
        {
          data: {
            ws_id: workspaceId,
            creator_id: TEST_USER.id,
            code,
            mode: 'per_user',
            target_user_id: workspaceUserId,
            allowed_fields: ['display_name'],
            max_uses: 1,
          },
          failOnStatusCode: false,
          headers: serviceHeaders('return=representation'),
        }
      );
      expect(created.status()).toBe(201);
      const [link] = (await created.json()) as Array<{ id: string }>;

      const readStats = async () => {
        const res = await request.get(
          `${SUPABASE_URL}/rest/v1/workspace_user_profile_links_with_stats?code=eq.${code}`,
          { failOnStatusCode: false, headers: serviceHeaders() }
        );
        expect(res.ok()).toBe(true);
        const [row] = (await res.json()) as Array<{
          current_uses: number | string;
          is_full: boolean;
          is_revoked: boolean;
          prefill_existing_values: boolean;
        }>;
        return row;
      };

      let stats = await readStats();
      expect(Number(stats.current_uses)).toBe(0);
      expect(stats.is_full).toBe(false);
      expect(stats.is_revoked).toBe(false);
      expect(stats.prefill_existing_values).toBe(true);

      const submission = await request.post(
        `${SUPABASE_URL}/rest/v1/workspace_user_profile_link_submissions`,
        {
          data: {
            profile_link_id: link.id,
            ws_id: workspaceId,
            workspace_user_id: workspaceUserId,
            actor_auth_uid: TEST_USER.id,
            submitted_fields: ['display_name'],
          },
          failOnStatusCode: false,
          headers: serviceHeaders('return=minimal'),
        }
      );
      expect(submission.status()).toBe(201);

      stats = await readStats();
      expect(Number(stats.current_uses)).toBe(1);
      expect(stats.is_full).toBe(true);

      const revoke = await request.patch(
        `${SUPABASE_URL}/rest/v1/workspace_user_profile_links?id=eq.${link.id}`,
        {
          data: { revoked_at: new Date().toISOString() },
          failOnStatusCode: false,
          headers: serviceHeaders('return=minimal'),
        }
      );
      expect(revoke.ok()).toBe(true);

      stats = await readStats();
      expect(stats.is_revoked).toBe(true);
    } finally {
      await cleanup(request, workspaceId);
    }
  });
});
