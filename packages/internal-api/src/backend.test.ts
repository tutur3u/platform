import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  checkBackendWorkspacePermission,
  createBackendApiClient,
  createBackendSupportInquiry,
  getBackendAiWhitelistMe,
  getBackendAuthMe,
  getBackendAuthMfaAssuranceLevel,
  getBackendCalendarMock,
  getBackendCurrentUserProfile,
  getBackendHiveAccess,
  getBackendLegacyHealth,
  getBackendMigrationCutoverGates,
  getBackendMigrationManifest,
  getBackendMigrationProgress,
  getBackendMigrationStatus,
  getBackendNovaCurrentTeam,
  getBackendTaskBoardStatusTemplates,
  getBackendUserFieldTypes,
  getBackendWorkspaceCrawlerStatus,
  getBackendWorkspaceLimits,
  getBackendWorkspacePostPermissions,
  getConfiguredBackendApiBaseUrl,
  withBackendServiceBinding,
  withForwardedBackendApiAuth,
} from './backend';

const EMPTY_METHOD_COUNTS = {
  DELETE: 0,
  GET: 0,
  HEAD: 0,
  OPTIONS: 0,
  PATCH: 0,
  POST: 0,
  PUT: 0,
};

const ROUTE_METHOD_COUNTS = {
  DELETE: 193,
  GET: 634,
  HEAD: 1,
  OPTIONS: 16,
  PATCH: 122,
  POST: 504,
  PUT: 173,
};

function getFetchHeaders(fetchMock: ReturnType<typeof vi.fn>) {
  const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
  return new Headers(init?.headers);
}

function getServiceBindingRequest(fetchMock: ReturnType<typeof vi.fn>) {
  const input = fetchMock.mock.calls[0]?.[0];

  if (!(input instanceof Request)) {
    throw new Error('Expected service binding fetch to receive a Request.');
  }

  return input;
}

describe('backend API client', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('prefers the internal backend origin in server runtimes', () => {
    vi.stubEnv('BACKEND_PUBLIC_ORIGIN', 'https://backend.example.com');
    vi.stubEnv('BACKEND_INTERNAL_URL', 'http://backend:7820');

    expect(getConfiguredBackendApiBaseUrl()).toBe('http://backend:7820');
  });

  it('prefers the public backend origin in browser runtimes', () => {
    vi.stubEnv('BACKEND_PUBLIC_ORIGIN', 'https://backend.example.com');
    vi.stubEnv('BACKEND_INTERNAL_URL', 'http://backend:7820');
    vi.stubGlobal('window', {});

    expect(getConfiguredBackendApiBaseUrl()).toBe(
      'https://backend.example.com'
    );
  });

  it('falls back to the internal backend URL for server runtimes', () => {
    vi.stubEnv('BACKEND_INTERNAL_URL', 'http://backend:7820');

    expect(getConfiguredBackendApiBaseUrl()).toBe('http://backend:7820');
  });

  it('normalizes schemeless public backend origins to HTTPS', () => {
    vi.stubEnv('BACKEND_PUBLIC_ORIGIN', 'backend.example.com');
    vi.stubGlobal('window', {});

    expect(getConfiguredBackendApiBaseUrl()).toBe(
      'https://backend.example.com'
    );
  });

  it('rejects remote plaintext public backend origins in browser runtimes', () => {
    vi.stubEnv('BACKEND_PUBLIC_ORIGIN', 'http://backend.example.com');
    vi.stubEnv('NEXT_PUBLIC_BACKEND_URL', 'https://fallback.example.com');
    vi.stubGlobal('window', {});

    expect(getConfiguredBackendApiBaseUrl()).toBe(
      'https://fallback.example.com'
    );
  });

  it('allows localhost plaintext public backend origins for local development', () => {
    vi.stubEnv('BACKEND_PUBLIC_ORIGIN', 'http://localhost:7820');
    vi.stubGlobal('window', {});

    expect(getConfiguredBackendApiBaseUrl()).toBe('http://localhost:7820');
  });

  it('rejects backend origins with embedded credentials', () => {
    vi.stubEnv(
      'BACKEND_PUBLIC_ORIGIN',
      'https://user:pass@backend.example.com'
    );
    vi.stubEnv('NEXT_PUBLIC_BACKEND_URL', 'https://fallback.example.com');

    expect(getConfiguredBackendApiBaseUrl()).toBe(
      'https://fallback.example.com'
    );
  });

  it('rejects backend origin values that include paths or query strings', () => {
    vi.stubEnv(
      'BACKEND_INTERNAL_URL',
      'https://backend.example.com/api?token=secret'
    );
    vi.stubEnv('BACKEND_PUBLIC_ORIGIN', 'https://fallback.example.com');

    expect(getConfiguredBackendApiBaseUrl()).toBe(
      'https://fallback.example.com'
    );
  });

  it('rejects unsupported backend origin protocols', () => {
    vi.stubEnv('BACKEND_INTERNAL_URL', 'ftp://backend.example.com');
    vi.stubEnv('BACKEND_PUBLIC_ORIGIN', 'https://fallback.example.com');

    expect(getConfiguredBackendApiBaseUrl()).toBe(
      'https://fallback.example.com'
    );
  });

  it('reads migration status through the shared internal API client wrapper', async () => {
    vi.stubEnv('BACKEND_INTERNAL_TOKEN', 'server-token');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        backend: {
          deploymentTarget: 'container',
          runtime: 'rust',
          service: 'backend',
          toolchain: 'rustc 1.95.0',
        },
        contactData: {
          configured: false,
          missing: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'],
          supabaseOrigin: null,
        },
        environment: 'test',
        frontendTargets: ['next', 'tanstack-start'],
        ok: true,
        routeOwnership: {
          legacyAllowed: true,
          manifest: 'apps/tanstack-web/migration/route-manifest.json',
          status: 'migration-foundation',
        },
      }),
    });

    const status = await getBackendMigrationStatus({
      baseUrl: 'http://backend:7820',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(status.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://backend:7820/api/migration/status',
      expect.objectContaining({
        headers: expect.any(Headers),
      })
    );
    expect(getFetchHeaders(fetchMock).get('authorization')).toBe(
      'Bearer server-token'
    );
  });

  it('reads the Rust-owned legacy health route', async () => {
    vi.stubEnv('BACKEND_INTERNAL_TOKEN', 'server-token');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'ok',
      }),
    });

    const health = await getBackendLegacyHealth({
      baseUrl: 'http://backend:7820',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(health.status).toBe('ok');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://backend:7820/api/health',
      expect.objectContaining({
        headers: expect.any(Headers),
      })
    );
    expect(getFetchHeaders(fetchMock).has('authorization')).toBe(false);
  });

  it('reads the Rust-owned current Supabase auth user route', async () => {
    vi.stubEnv('BACKEND_INTERNAL_TOKEN', 'server-token');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        user: {
          app_metadata: {
            provider: 'email',
          },
          aud: 'authenticated',
          email: 'ada@example.com',
          id: 'user_123',
          user_metadata: {
            full_name: 'Ada Lovelace',
          },
        },
      }),
    });

    const response = await getBackendAuthMe({
      baseUrl: 'http://backend:7820',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(response.user.email).toBe('ada@example.com');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://backend:7820/api/auth/me',
      expect.objectContaining({
        cache: 'no-store',
        headers: expect.any(Headers),
      })
    );
    expect(getFetchHeaders(fetchMock).has('authorization')).toBe(false);
  });

  it('reads Rust-owned MFA assurance details without losing auth method objects', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        currentAuthenticationMethods: [
          {
            method: 'password',
            timestamp: 1_710_000_000,
          },
        ],
        currentLevel: 'aal1',
        nextLevel: 'aal2',
      }),
    });

    const assuranceLevel = await getBackendAuthMfaAssuranceLevel({
      baseUrl: 'http://backend:7820',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(assuranceLevel.currentLevel).toBe('aal1');
    expect(assuranceLevel.currentAuthenticationMethods[0]?.method).toBe(
      'password'
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'http://backend:7820/api/auth/mfa/totp/assurance-level',
      expect.objectContaining({
        cache: 'no-store',
        headers: expect.any(Headers),
      })
    );
  });

  it('reads the Rust-owned deterministic calendar mock route', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          {
            end_at: '2023-10-01T11:00:00Z',
            id: 1,
            start_at: '2023-10-01T10:00:00Z',
            title: 'Event 1',
          },
        ],
      }),
    });

    const calendar = await getBackendCalendarMock({
      baseUrl: 'http://backend:7820',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(calendar.data[0]?.title).toBe('Event 1');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://backend:7820/api/v1/calendar/mock',
      expect.objectContaining({
        cache: 'no-store',
        headers: expect.any(Headers),
      })
    );
  });

  it('reads the Rust-owned deterministic user field types', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [
        { id: 'TEXT' },
        { id: 'NUMBER' },
        { id: 'BOOLEAN' },
        { id: 'DATE' },
        { id: 'DATETIME' },
      ],
    });

    const fieldTypes = await getBackendUserFieldTypes({
      baseUrl: 'http://backend:7820',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(fieldTypes).toHaveLength(5);
    expect(fieldTypes[0]?.id).toBe('TEXT');
    expect(fieldTypes.at(-1)?.id).toBe('DATETIME');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://backend:7820/api/v1/infrastructure/users/fields/types',
      expect.objectContaining({
        cache: 'no-store',
        headers: expect.any(Headers),
      })
    );
  });

  it('reads the Rust-owned current user AI whitelist status without backend internal auth', async () => {
    vi.stubEnv('BACKEND_INTERNAL_TOKEN', 'server-token');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        email: 'member@example.com',
        enabled: true,
      }),
    });

    const whitelist = await getBackendAiWhitelistMe({
      baseUrl: 'http://backend:7820',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(whitelist.email).toBe('member@example.com');
    expect(whitelist.enabled).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://backend:7820/api/v1/ai/whitelist/me',
      expect.objectContaining({
        cache: 'no-store',
        headers: expect.any(Headers),
      })
    );
    expect(getFetchHeaders(fetchMock).has('authorization')).toBe(false);
  });

  it('reads the Rust-owned current Nova team including null memberships', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          teamId: '6a5cbf77-7d95-427f-a263-9705bd416f3d',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          teamId: null,
        }),
      });

    const team = await getBackendNovaCurrentTeam({
      baseUrl: 'http://backend:7820',
      fetch: fetchMock as unknown as typeof fetch,
    });
    const missingTeam = await getBackendNovaCurrentTeam({
      baseUrl: 'http://backend:7820',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(team.teamId).toBe('6a5cbf77-7d95-427f-a263-9705bd416f3d');
    expect(missingTeam.teamId).toBeNull();
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://backend:7820/api/v1/nova/me/team',
      expect.objectContaining({
        cache: 'no-store',
        headers: expect.any(Headers),
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://backend:7820/api/v1/nova/me/team',
      expect.objectContaining({
        cache: 'no-store',
        headers: expect.any(Headers),
      })
    );
  });

  it('reads the Rust-owned current user Hive access flags', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        hasAccess: true,
        isAdmin: false,
        isMember: true,
      }),
    });

    const access = await getBackendHiveAccess({
      baseUrl: 'http://backend:7820',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(access.hasAccess).toBe(true);
    expect(access.isAdmin).toBe(false);
    expect(access.isMember).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://backend:7820/api/v1/users/me/hive-access',
      expect.objectContaining({
        cache: 'no-store',
        headers: expect.any(Headers),
      })
    );
  });

  it('reads the Rust-owned task board status template catalog', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        templates: [
          {
            created_at: '2026-06-22T00:00:00.000Z',
            description: null,
            id: 'template-1',
            is_default: true,
            name: 'Default',
            statuses: [
              {
                allow_multiple: false,
                color: 'BLUE',
                name: 'Active',
                status: 'active',
              },
            ],
            updated_at: '2026-06-22T00:00:00.000Z',
          },
        ],
      }),
    });

    const catalog = await getBackendTaskBoardStatusTemplates({
      baseUrl: 'http://backend:7820',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(catalog.templates[0]?.id).toBe('template-1');
    expect(catalog.templates[0]?.statuses[0]?.status).toBe('active');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://backend:7820/api/v1/task-board-status-templates',
      expect.objectContaining({
        cache: 'no-store',
        headers: expect.any(Headers),
      })
    );
  });

  it('reads the Rust-owned current user profile route', async () => {
    vi.stubEnv('BACKEND_INTERNAL_TOKEN', 'server-token');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        avatar_url: null,
        created_at: '2026-06-20T00:00:00.000Z',
        default_workspace_id: null,
        display_name: null,
        email: 'ada@example.com',
        full_name: null,
        id: 'user_123',
        new_email: null,
      }),
    });

    const profile = await getBackendCurrentUserProfile({
      baseUrl: 'http://backend:7820',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(profile.email).toBe('ada@example.com');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://backend:7820/api/v1/users/me/profile',
      expect.objectContaining({
        headers: expect.any(Headers),
      })
    );
    expect(getFetchHeaders(fetchMock).has('authorization')).toBe(false);
  });

  it('reads Rust-owned workspace post permission flags', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        canApprovePosts: true,
        canForceSendPosts: false,
      }),
    });

    const permissions = await getBackendWorkspacePostPermissions('ws-1', {
      baseUrl: 'http://backend:7820',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(permissions.canApprovePosts).toBe(true);
    expect(permissions.canForceSendPosts).toBe(false);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://backend:7820/api/v1/workspaces/ws-1/posts/permissions',
      expect.objectContaining({
        cache: 'no-store',
        headers: expect.any(Headers),
      })
    );
  });

  it('checks a Rust-owned workspace setting permission with encoded inputs', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        hasPermission: true,
      }),
    });

    const result = await checkBackendWorkspacePermission(
      'personal workspace',
      'manage workspace settings',
      {
        baseUrl: 'http://backend:7820',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    expect(result.hasPermission).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://backend:7820/api/v1/workspaces/personal%20workspace/settings/permissions/check?permission=manage+workspace+settings',
      expect.objectContaining({
        cache: 'no-store',
        headers: expect.any(Headers),
      })
    );
  });

  it('reads Rust-owned crawler status with an encoded target URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        crawledUrl: {
          status: 'completed',
          url: 'https://example.com/docs?x=1&y=2',
        },
        relatedUrls: [{ url: 'https://example.com/docs/next' }],
      }),
    });

    const status = await getBackendWorkspaceCrawlerStatus(
      'ws-1',
      'https://example.com/docs?x=1&y=2',
      {
        baseUrl: 'http://backend:7820',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    expect(status.crawledUrl?.url).toBe('https://example.com/docs?x=1&y=2');
    expect(status.relatedUrls).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://backend:7820/api/v1/workspaces/ws-1/crawlers/status?url=https%3A%2F%2Fexample.com%2Fdocs%3Fx%3D1%26y%3D2',
      expect.objectContaining({
        cache: 'no-store',
        headers: expect.any(Headers),
      })
    );
  });

  it('reads Rust-owned workspace creation limits', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        canCreate: true,
        currentCount: 0,
        limit: 0,
        remaining: null,
      }),
    });

    const limits = await getBackendWorkspaceLimits({
      baseUrl: 'http://backend:7820',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(limits.remaining).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(
      'http://backend:7820/api/v1/workspaces/limits',
      expect.objectContaining({
        cache: 'no-store',
        headers: expect.any(Headers),
      })
    );
  });

  it('creates Rust-owned support inquiries without backend internal auth', async () => {
    vi.stubEnv('BACKEND_INTERNAL_TOKEN', 'server-token');
    const payload = {
      email: 'ada@example.com',
      message: 'Please help me with this contact request.',
      name: 'Ada Lovelace',
      product: 'web' as const,
      subject: 'Need help',
      type: 'support' as const,
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        inquiryId: 'inquiry_123',
        success: true,
      }),
    });

    const inquiry = await createBackendSupportInquiry(payload, {
      baseUrl: 'http://backend:7820',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(inquiry.inquiryId).toBe('inquiry_123');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://backend:7820/api/v1/inquiries',
      expect.objectContaining({
        body: JSON.stringify(payload),
        headers: expect.any(Headers),
        method: 'POST',
      })
    );

    const headers = getFetchHeaders(fetchMock);
    expect(headers.get('content-type')).toBe('application/json');
    expect(headers.get('origin')).toBe('http://backend:7820');
    expect(headers.get('referer')).toBe(
      'http://backend:7820/tanstack-contact-server-function'
    );
    expect(headers.has('authorization')).toBe(false);
  });

  it('forwards app-session auth to the backend origin', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        avatar_url: null,
        created_at: '2026-06-20T00:00:00.000Z',
        default_workspace_id: null,
        display_name: 'Ada',
        email: 'ada@example.com',
        full_name: null,
        id: 'user_123',
        new_email: null,
      }),
    });

    await getBackendCurrentUserProfile(
      withForwardedBackendApiAuth(
        new Headers({
          authorization: 'Bearer ttr_app_token',
          cookie:
            'tuturuuu_app_session=ttr_app_cookie; sb-localhost-auth-token=secret',
        }),
        {
          baseUrl: 'http://backend:7820',
          fetch: fetchMock as unknown as typeof fetch,
        }
      )
    );

    const headers = getFetchHeaders(fetchMock);
    expect(headers.get('authorization')).toBe('Bearer ttr_app_token');
    expect(headers.get('cookie')).toBe('tuturuuu_app_session=ttr_app_cookie');
  });

  it('does not overwrite explicit migration authorization headers', async () => {
    vi.stubEnv('BACKEND_INTERNAL_TOKEN', 'server-token');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        backend: {
          deploymentTarget: 'container',
          runtime: 'rust',
          service: 'backend',
          toolchain: 'rustc 1.95.0',
        },
        contactData: {
          configured: true,
          missing: [],
          supabaseOrigin: 'https://project-ref.supabase.co',
        },
        environment: 'test',
        frontendTargets: ['next', 'tanstack-start'],
        ok: true,
        routeOwnership: {
          legacyAllowed: true,
          manifest: 'apps/tanstack-web/migration/route-manifest.json',
          status: 'migration-foundation',
        },
      }),
    });

    await getBackendMigrationStatus({
      baseUrl: 'http://backend:7820',
      defaultHeaders: {
        authorization: 'Bearer caller-token',
      },
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(getFetchHeaders(fetchMock).get('authorization')).toBe(
      'Bearer caller-token'
    );
  });

  it('reads the checked migration manifest through the backend facade', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        generatedBy: 'scripts/tanstack-migration-manifest.js',
        progress: {
          byKind: [],
          byOwner: [],
          topLegacyRoutes: [],
          totals: {
            acceptedRemoval: 0,
            key: 'total',
            label: 'All route artifacts',
            legacyNext: 0,
            migrated: 0,
            percentComplete: 100,
            remaining: 0,
            terminal: 0,
            total: 0,
            unknownStatus: 0,
          },
        },
        routes: [],
        summary: {
          apiRoutes: 0,
          cronRoutes: 0,
          layouts: 0,
          methodCounts: EMPTY_METHOD_COUNTS,
          pages: 0,
          routeHandlers: 0,
          total: 0,
        },
      }),
    });

    const manifest = await getBackendMigrationManifest({
      baseUrl: 'http://backend:7820',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(manifest.summary.total).toBe(0);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://backend:7820/api/migration/manifest',
      expect.objectContaining({
        headers: expect.any(Headers),
      })
    );
  });

  it('reads backend-owned migration progress', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        generatedBy: 'scripts/tanstack-migration-manifest.js',
        manifest: 'apps/tanstack-web/migration/route-manifest.json',
        ok: false,
        progress: {
          byKind: [],
          byOwner: [
            {
              acceptedRemoval: 1,
              key: 'rust-backend',
              label: 'Rust backend',
              legacyNext: 1108,
              migrated: 3,
              percentComplete: 0.36,
              remaining: 1108,
              terminal: 4,
              total: 1112,
              unknownStatus: 0,
            },
          ],
          topLegacyRoutes: [],
          totals: {
            acceptedRemoval: 1,
            key: 'total',
            label: 'All route artifacts',
            legacyNext: 1485,
            migrated: 3,
            percentComplete: 0.27,
            remaining: 1485,
            terminal: 4,
            total: 1489,
            unknownStatus: 0,
          },
        },
        summary: {
          apiRoutes: 1089,
          cronRoutes: 19,
          layouts: 67,
          methodCounts: ROUTE_METHOD_COUNTS,
          pages: 305,
          routeHandlers: 1112,
          total: 1489,
        },
      }),
    });

    const progress = await getBackendMigrationProgress({
      baseUrl: 'http://backend:7820',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(progress.progress.byOwner[0]?.key).toBe('rust-backend');
    expect(progress.progress.totals.remaining).toBe(1485);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://backend:7820/api/migration/progress',
      expect.objectContaining({
        headers: expect.any(Headers),
      })
    );
  });

  it('reads backend-owned cutover gates', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        counts: {
          acceptedRemoval: 1,
          backendOwned: 1112,
          backendRouteArtifacts: 1112,
          frontendOwned: 377,
          legacyNext: 1485,
          migrated: 3,
          total: 1489,
          unknownStatus: 0,
          unmapped: 0,
        },
        gates: [
          {
            detail: '1485 route artifacts still have legacy-next status.',
            id: 'no-legacy-routes',
            label: 'No legacy route ownership',
            ok: false,
            status: 'blocked',
          },
        ],
        generatedBy: 'scripts/tanstack-migration-manifest.js',
        manifest: 'apps/tanstack-web/migration/route-manifest.json',
        ok: false,
        summary: {
          apiRoutes: 1089,
          cronRoutes: 19,
          layouts: 67,
          methodCounts: ROUTE_METHOD_COUNTS,
          pages: 305,
          routeHandlers: 1112,
          total: 1489,
        },
      }),
    });

    const gates = await getBackendMigrationCutoverGates({
      baseUrl: 'http://backend:7820',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(gates.ok).toBe(false);
    expect(gates.gates[0]?.id).toBe('no-legacy-routes');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://backend:7820/api/migration/cutover-gates',
      expect.objectContaining({
        headers: expect.any(Headers),
      })
    );
  });

  it('allows callers to create a backend client with custom fetch behavior', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      json: async () => undefined,
    });
    const client = createBackendApiClient({
      baseUrl: 'http://backend:7820',
      fetch: fetchMock as unknown as typeof fetch,
    });

    await client.json('/healthz');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://backend:7820/healthz',
      expect.any(Object)
    );
  });

  it('prefers a Cloudflare backend service binding over configured HTTP origins', async () => {
    vi.stubEnv('BACKEND_INTERNAL_URL', 'http://backend:7820');
    const bindingFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'ok' }), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      })
    );

    const health = await getBackendLegacyHealth(
      withBackendServiceBinding({
        fetch: bindingFetch as unknown as typeof fetch,
      })
    );

    expect(health.status).toBe('ok');
    expect(bindingFetch).toHaveBeenCalledTimes(1);

    const request = getServiceBindingRequest(bindingFetch);
    expect(request.url).toBe(
      'https://backend.service.tuturuuu.internal/api/health'
    );
    expect(request.headers.get('accept')).toBe('application/json');
  });

  it('forwards app-session auth through the Cloudflare backend service binding', async () => {
    const bindingFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          avatar_url: null,
          created_at: '2026-06-20T00:00:00.000Z',
          default_workspace_id: null,
          display_name: 'Ada',
          email: 'ada@example.com',
          full_name: null,
          id: 'user_123',
          new_email: null,
        }),
        {
          headers: { 'content-type': 'application/json' },
          status: 200,
        }
      )
    );

    await getBackendCurrentUserProfile(
      withForwardedBackendApiAuth(
        new Headers({
          authorization: 'Bearer ttr_app_token',
          cookie:
            'tuturuuu_app_session=ttr_app_cookie; sb-localhost-auth-token=secret',
        }),
        withBackendServiceBinding({
          fetch: bindingFetch as unknown as typeof fetch,
        })
      )
    );

    const request = getServiceBindingRequest(bindingFetch);
    expect(request.url).toBe(
      'https://backend.service.tuturuuu.internal/api/v1/users/me/profile'
    );
    expect(request.headers.get('authorization')).toBe('Bearer ttr_app_token');
    expect(request.headers.get('cookie')).toBe(
      'tuturuuu_app_session=ttr_app_cookie'
    );
  });

  it('uses the service-binding origin for backend same-origin mutation headers', async () => {
    const payload = {
      email: 'ada@example.com',
      message: 'Please help me with this contact request.',
      name: 'Ada Lovelace',
      product: 'web' as const,
      subject: 'Need help',
      type: 'support' as const,
    };
    const bindingFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          inquiryId: 'inquiry_123',
          success: true,
        }),
        {
          headers: { 'content-type': 'application/json' },
          status: 200,
        }
      )
    );

    await createBackendSupportInquiry(
      payload,
      withBackendServiceBinding({
        fetch: bindingFetch as unknown as typeof fetch,
      })
    );

    const request = getServiceBindingRequest(bindingFetch);
    expect(request.url).toBe(
      'https://backend.service.tuturuuu.internal/api/v1/inquiries'
    );
    expect(request.headers.get('origin')).toBe(
      'https://backend.service.tuturuuu.internal'
    );
    expect(request.headers.get('referer')).toBe(
      'https://backend.service.tuturuuu.internal/tanstack-contact-server-function'
    );
  });
});
