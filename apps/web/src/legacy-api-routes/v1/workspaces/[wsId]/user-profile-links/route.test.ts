import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  createClient: vi.fn(),
  getPermissions: vi.fn(),
  resolveAuthenticatedSessionUser: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: (
    ...args: Parameters<typeof mocks.resolveAuthenticatedSessionUser>
  ) => mocks.resolveAuthenticatedSessionUser(...args),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: Parameters<typeof mocks.createAdminClient>) =>
    mocks.createAdminClient(...args),
  createClient: (...args: Parameters<typeof mocks.createClient>) =>
    mocks.createClient(...args),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: (...args: Parameters<typeof mocks.getPermissions>) =>
    mocks.getPermissions(...args),
}));

function createConfigQuery(configRows: { id: string; value: string }[]) {
  const query = {
    eq: vi.fn(() => query),
    in: vi.fn(async () => ({ data: configRows, error: null })),
    select: vi.fn(() => query),
  };

  return query;
}

function createInsertQuery(captured: { payload?: Record<string, unknown> }) {
  const query = {
    insert: vi.fn((payload: Record<string, unknown>) => {
      captured.payload = payload;
      return query;
    }),
    select: vi.fn(() => query),
    single: vi.fn(async () => ({
      data: {
        code: 'profile-link-code',
        id: 'profile-link-id',
      },
      error: null,
    })),
  };

  return query;
}

function setupPost(configRows: { id: string; value: string }[]) {
  const captured: { payload?: Record<string, unknown> } = {};
  const configQuery = createConfigQuery(configRows);
  const insertQuery = createInsertQuery(captured);
  const admin = {
    from: vi.fn((table: string) => {
      if (table === 'workspace_configs') return configQuery;
      if (table === 'workspace_user_profile_links') return insertQuery;
      throw new Error(`Unexpected table ${table}`);
    }),
  };

  mocks.createAdminClient.mockResolvedValue(admin);

  return { admin, captured, configQuery, insertQuery };
}

function createPostRequest(body: Record<string, unknown>) {
  return new Request('https://app.example.test/api/profile-links', {
    body: JSON.stringify(body),
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'POST',
  });
}

describe('workspace user profile links route', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-18T12:00:00.000Z'));
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({});
    mocks.resolveAuthenticatedSessionUser.mockResolvedValue({
      user: { id: 'actor-user-id' },
    });
    mocks.getPermissions.mockResolvedValue({
      containsPermission: (permission: string) =>
        permission === 'manage_user_profile_links',
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fills omitted create values from workspace defaults', async () => {
    const { captured } = setupPost([
      {
        id: 'WORKSPACE_USER_PROFILE_LINK_DEFAULT_REQUIRE_AUTH',
        value: 'false',
      },
      {
        id: 'WORKSPACE_USER_PROFILE_LINK_DEFAULT_EXPIRATION',
        value: '7d',
      },
      {
        id: 'WORKSPACE_USER_PROFILE_LINK_DEFAULT_MAX_USES',
        value: 'unlimited',
      },
      {
        id: 'WORKSPACE_USER_PROFILE_LINK_DEFAULT_PREFILL_EXISTING_VALUES',
        value: 'false',
      },
      {
        id: 'WORKSPACE_USER_PROFILE_LINK_DEFAULT_FIELDS',
        value: 'email,phone,email,unknown',
      },
    ]);

    const response = await POST(createPostRequest({ mode: 'generic' }), {
      params: Promise.resolve({ wsId: 'workspace-id' }),
    });

    expect(response.status).toBe(201);
    expect(captured.payload).toMatchObject({
      allowed_fields: ['email', 'phone'],
      creator_id: 'actor-user-id',
      expires_at: '2026-06-25T12:00:00.000Z',
      max_uses: null,
      mode: 'generic',
      prefill_existing_values: false,
      requires_auth: false,
      target_user_id: null,
      ws_id: 'workspace-id',
    });
  });

  it('keeps explicit create values ahead of workspace defaults', async () => {
    const { captured } = setupPost([
      {
        id: 'WORKSPACE_USER_PROFILE_LINK_DEFAULT_REQUIRE_AUTH',
        value: 'false',
      },
      {
        id: 'WORKSPACE_USER_PROFILE_LINK_DEFAULT_EXPIRATION',
        value: '7d',
      },
      {
        id: 'WORKSPACE_USER_PROFILE_LINK_DEFAULT_MAX_USES',
        value: 'unlimited',
      },
      {
        id: 'WORKSPACE_USER_PROFILE_LINK_DEFAULT_PREFILL_EXISTING_VALUES',
        value: 'false',
      },
      {
        id: 'WORKSPACE_USER_PROFILE_LINK_DEFAULT_FIELDS',
        value: 'email,phone',
      },
    ]);

    const response = await POST(
      createPostRequest({
        allowed_fields: ['full_name'],
        expires_at: null,
        max_uses: 5,
        mode: 'generic',
        prefill_existing_values: true,
        requires_auth: true,
      }),
      {
        params: Promise.resolve({ wsId: 'workspace-id' }),
      }
    );

    expect(response.status).toBe(201);
    expect(captured.payload).toMatchObject({
      allowed_fields: ['full_name'],
      expires_at: null,
      max_uses: 5,
      prefill_existing_values: true,
      requires_auth: true,
    });
  });
});
