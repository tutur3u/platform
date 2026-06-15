import { randomUUID } from 'node:crypto';
import { type APIRequestContext, expect, test } from '@playwright/test';
import { TEST_USER } from './helpers/constants';
import {
  assertSafeE2EEnvironment,
  LOCAL_E2E_SUPABASE_SECRET_KEY,
  LOCAL_E2E_SUPABASE_URL,
  SAFE_LOCAL_SUPABASE_ORIGINS,
} from './helpers/environment';

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? LOCAL_E2E_SUPABASE_URL;
const SUPABASE_SECRET_KEY =
  process.env.SUPABASE_SECRET_KEY ?? LOCAL_E2E_SUPABASE_SECRET_KEY;

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

async function createWorkspace(
  request: APIRequestContext,
  workspaceId: string
) {
  const response = await request.post(`${SUPABASE_URL}/rest/v1/workspaces`, {
    data: {
      creator_id: TEST_USER.id,
      handle: `e2e-uplh-${workspaceId.slice(0, 8)}`,
      id: workspaceId,
      name: 'E2E Profile Links Happy',
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

async function createLink(
  request: APIRequestContext,
  data: Record<string, unknown>
) {
  const response = await request.post(
    `${SUPABASE_URL}/rest/v1/workspace_user_profile_links`,
    {
      data,
      failOnStatusCode: false,
      headers: serviceHeaders('return=representation'),
    }
  );
  expect(response.status()).toBe(201);
  const [link] = (await response.json()) as Array<{ id: string; code: string }>;
  return link;
}

async function getWorkspaceUser(
  request: APIRequestContext,
  workspaceUserId: string
) {
  const res = await request.get(
    `${SUPABASE_URL}/rest/v1/workspace_users?id=eq.${workspaceUserId}&select=display_name,full_name,birthday,gender,email`,
    { failOnStatusCode: false, headers: serviceHeaders() }
  );
  expect(res.ok()).toBe(true);
  const [row] = (await res.json()) as Array<Record<string, string | null>>;
  return row;
}

async function getSubmissions(request: APIRequestContext, linkId: string) {
  const res = await request.get(
    `${SUPABASE_URL}/rest/v1/workspace_user_profile_link_submissions?profile_link_id=eq.${linkId}&select=workspace_user_id,actor_auth_uid,submitted_fields&order=created_at.asc`,
    { failOnStatusCode: false, headers: serviceHeaders() }
  );
  expect(res.ok()).toBe(true);
  return (await res.json()) as Array<{
    workspace_user_id: string;
    actor_auth_uid: string | null;
    submitted_fields: string[];
  }>;
}

async function cleanup(request: APIRequestContext, workspaceId: string) {
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

test.describe('External profile-completion links — authenticated fill', () => {
  test.beforeAll(() => {
    assertSafeE2EEnvironment();
    assertLocalSupabase();
  });

  test('completes a per-user link and forces the email to the account email', async ({
    request,
  }) => {
    const workspaceId = randomUUID();
    const workspaceUserId = randomUUID();
    try {
      await createWorkspace(request, workspaceId);
      await createWorkspaceUser(request, workspaceId, workspaceUserId);
      const link = await createLink(request, {
        ws_id: workspaceId,
        creator_id: TEST_USER.id,
        code: `pu-${workspaceId.slice(0, 8)}`,
        mode: 'per_user',
        target_user_id: workspaceUserId,
        allowed_fields: ['display_name', 'birthday', 'email'],
      });

      const submit = await request.post(
        `/api/v1/public/user-profile-links/${link.code}/submit`,
        {
          data: {
            fields: {
              display_name: 'E2E Completed Name',
              birthday: '2000-02-02',
              // Attempt to set an arbitrary email — must be ignored.
              email: 'attacker@example.com',
            },
          },
          failOnStatusCode: false,
        }
      );
      expect(submit.status()).toBe(200);

      const profile = await getWorkspaceUser(request, workspaceUserId);
      expect(profile.display_name).toBe('E2E Completed Name');
      expect(profile.birthday).toBe('2000-02-02');
      // Email is locked to the logged-in account email, NOT the submitted value.
      expect(profile.email).toBe(TEST_USER.email);
      expect(profile.email).not.toBe('attacker@example.com');

      const submissions = await getSubmissions(request, link.id);
      expect(submissions.length).toBe(1);
      expect(submissions[0]?.workspace_user_id).toBe(workspaceUserId);
      expect(submissions[0]?.actor_auth_uid).toBe(TEST_USER.id);
    } finally {
      await cleanup(request, workspaceId);
    }
  });

  test('rejects submissions with fields outside the allowlist', async ({
    request,
  }) => {
    const workspaceId = randomUUID();
    const workspaceUserId = randomUUID();
    try {
      await createWorkspace(request, workspaceId);
      await createWorkspaceUser(request, workspaceId, workspaceUserId);
      const link = await createLink(request, {
        ws_id: workspaceId,
        creator_id: TEST_USER.id,
        code: `deny-${workspaceId.slice(0, 8)}`,
        mode: 'per_user',
        target_user_id: workspaceUserId,
        allowed_fields: ['display_name'],
      });

      const submit = await request.post(
        `/api/v1/public/user-profile-links/${link.code}/submit`,
        {
          data: {
            fields: { display_name: 'ok', birthday: '1999-09-09' },
          },
          failOnStatusCode: false,
        }
      );
      expect(submit.status()).toBe(400);
    } finally {
      await cleanup(request, workspaceId);
    }
  });

  test('generic link updates one row per user instead of duplicating', async ({
    request,
  }) => {
    const workspaceId = randomUUID();
    try {
      await createWorkspace(request, workspaceId);
      const link = await createLink(request, {
        ws_id: workspaceId,
        creator_id: TEST_USER.id,
        code: `gen-${workspaceId.slice(0, 8)}`,
        mode: 'generic',
        allowed_fields: ['display_name', 'email'],
      });

      const first = await request.post(
        `/api/v1/public/user-profile-links/${link.code}/submit`,
        {
          data: { fields: { display_name: 'First Pass' } },
          failOnStatusCode: false,
        }
      );
      expect(first.status()).toBe(200);

      const afterFirst = await getSubmissions(request, link.id);
      expect(afterFirst.length).toBe(1);
      const createdUserId = afterFirst[0]?.workspace_user_id;
      expect(createdUserId).toBeTruthy();

      const second = await request.post(
        `/api/v1/public/user-profile-links/${link.code}/submit`,
        {
          data: { fields: { display_name: 'Second Pass' } },
          failOnStatusCode: false,
        }
      );
      expect(second.status()).toBe(200);

      const afterSecond = await getSubmissions(request, link.id);
      expect(afterSecond.length).toBe(2);
      // Same workspace_user updated — no duplicate profile created.
      expect(new Set(afterSecond.map((s) => s.workspace_user_id)).size).toBe(1);

      const profile = await getWorkspaceUser(request, createdUserId as string);
      expect(profile.display_name).toBe('Second Pass');
    } finally {
      await cleanup(request, workspaceId);
    }
  });
});
