import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  bulkImportBackendInternalHolidays,
  checkBackendWorkspacePermission,
  createBackendApiClient,
  createBackendInfrastructureEmailBlacklistEntry,
  createBackendInfrastructureTimezone,
  createBackendInternalHoliday,
  createBackendSupportInquiry,
  deleteBackendInfrastructureEmailBlacklistEntry,
  deleteBackendInfrastructureTimezone,
  deleteBackendInternalHoliday,
  getBackendAiWhitelistMe,
  getBackendAuthMe,
  getBackendAuthMfaAssuranceLevel,
  getBackendAuthMfaTotpFactors,
  getBackendCalendarMock,
  getBackendCurrentUserDefaultWorkspace,
  getBackendCurrentUserProfile,
  getBackendHiveAccess,
  getBackendInfrastructureAbuseEvents,
  getBackendInfrastructureChangelogEntries,
  getBackendInfrastructureEmailBlacklistEntries,
  getBackendInfrastructureEmailBlacklistEntry,
  getBackendInfrastructurePostEmailQueue,
  getBackendInfrastructureTimezones,
  getBackendInternalHolidays,
  getBackendLegacyHealth,
  getBackendMigrationCutoverGates,
  getBackendMigrationManifest,
  getBackendMigrationProgress,
  getBackendMigrationStatus,
  getBackendNovaCurrentTeam,
  getBackendOnboardingProgress,
  getBackendOtpSettings,
  getBackendTaskBoardStatusTemplates,
  getBackendUserFieldTypes,
  getBackendWorkspaceAiCredits,
  getBackendWorkspaceBilling,
  getBackendWorkspaceCrawlerDomains,
  getBackendWorkspaceCrawlerList,
  getBackendWorkspaceCrawlerStatus,
  getBackendWorkspaceCrawlerUncrawled,
  getBackendWorkspaceLimits,
  getBackendWorkspacePostPermissions,
  getConfiguredBackendApiBaseUrl,
  runBackendInfrastructurePostEmailQueue,
  updateBackendInfrastructureEmailBlacklistEntry,
  updateBackendInfrastructureTimezone,
  updateBackendInternalHoliday,
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

function getFetchInit(fetchMock: ReturnType<typeof vi.fn>, index: number) {
  return fetchMock.mock.calls[index]?.[1] as RequestInit | undefined;
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

  it('reads the Rust-owned MFA TOTP factor list', async () => {
    vi.stubEnv('BACKEND_INTERNAL_TOKEN', 'server-token');
    const factor = {
      factor_type: 'totp',
      friendly_name: 'Authenticator',
      id: 'factor-123',
      status: 'verified',
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        all: [factor],
        phone: [],
        totp: [factor],
        webauthn: [],
      }),
    });

    const factors = await getBackendAuthMfaTotpFactors({
      baseUrl: 'http://backend:7820',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(factors.all[0]?.id).toBe('factor-123');
    expect(factors.totp).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://backend:7820/api/auth/mfa/totp/factors',
      expect.objectContaining({
        cache: 'no-store',
        headers: expect.any(Headers),
      })
    );
    expect(getFetchHeaders(fetchMock).has('authorization')).toBe(false);
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

  it('reads the Rust-owned current user default workspace including null fallback', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          id: '00000000-0000-0000-0000-000000000001',
          name: 'Personal',
          personal: true,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => null,
      });

    const workspace = await getBackendCurrentUserDefaultWorkspace({
      baseUrl: 'http://backend:7820',
      fetch: fetchMock as unknown as typeof fetch,
    });
    const missingWorkspace = await getBackendCurrentUserDefaultWorkspace({
      baseUrl: 'http://backend:7820',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(workspace?.name).toBe('Personal');
    expect(missingWorkspace).toBeNull();
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://backend:7820/api/v1/users/me/default-workspace',
      expect.objectContaining({
        cache: 'no-store',
        headers: expect.any(Headers),
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://backend:7820/api/v1/users/me/default-workspace',
      expect.objectContaining({
        cache: 'no-store',
        headers: expect.any(Headers),
      })
    );
  });

  it('reads Rust-owned public OTP settings with exact query parameters', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        otpEnabled: true,
      }),
    });

    const settings = await getBackendOtpSettings(
      { client: 'mobile', platform: 'ios' },
      {
        baseUrl: 'http://backend:7820',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    expect(settings.otpEnabled).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://backend:7820/api/v1/auth/otp/settings?client=mobile&platform=ios',
      expect.objectContaining({
        cache: 'no-store',
        headers: expect.any(Headers),
      })
    );
  });

  it('reads Rust-owned onboarding progress rows', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        completed_steps: ['profile'],
        current_step: 'invite',
        id: 'progress-1',
        notifications_enabled: true,
        user_id: 'user-1',
        workspace_name: 'Core Team',
      }),
    });

    const progress = await getBackendOnboardingProgress({
      baseUrl: 'http://backend:7820',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(progress?.current_step).toBe('invite');
    expect(progress?.completed_steps).toEqual(['profile']);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://backend:7820/api/v1/user/onboarding-progress',
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

  it('reads Rust-owned infrastructure abuse events with legacy-compatible filters', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        count: 1,
        data: [
          {
            created_at: '2026-06-23T07:00:00.000Z',
            email: 'member@example.com',
            event_type: 'otp_verify_failed',
            id: 'event-1',
            ip_address: '203.0.113.10',
            success: false,
          },
        ],
        page: 2,
        pageSize: 50,
        totalPages: 1,
      }),
    });

    const response = await getBackendInfrastructureAbuseEvents(
      {
        page: 2,
        pageSize: 50,
        q: '203.0.113',
        success: 'false',
        type: 'otp_verify_failed',
      },
      {
        baseUrl: 'http://backend:7820',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    expect(response.count).toBe(1);
    expect(response.data[0]?.event_type).toBe('otp_verify_failed');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://backend:7820/api/v1/infrastructure/abuse-events?ip=203.0.113&page=2&pageSize=50&success=false&type=otp_verify_failed',
      expect.objectContaining({
        cache: 'no-store',
        headers: expect.any(Headers),
      })
    );
  });

  it('reads Rust-owned infrastructure timezones as raw private rows', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [
        {
          abbr: 'ICT',
          created_at: '2026-01-01 00:00:00+00',
          id: '8b4cb61f-c41d-455a-8f0a-467f6859b31d',
          isdst: false,
          offset: 7,
          text: '(UTC+07:00) Bangkok, Hanoi, Jakarta',
          utc: ['Asia/Ho_Chi_Minh'],
          value: 'Asia/Ho_Chi_Minh',
        },
      ],
    });

    const timezones = await getBackendInfrastructureTimezones({
      baseUrl: 'http://backend:7820',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(timezones[0]?.value).toBe('Asia/Ho_Chi_Minh');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://backend:7820/api/v1/infrastructure/timezones',
      expect.objectContaining({
        cache: 'no-store',
        headers: expect.any(Headers),
      })
    );
  });

  it('mutates Rust-owned infrastructure timezones with encoded detail paths', async () => {
    const payload = {
      abbr: 'ICT',
      id: null,
      isdst: false,
      offset: 7,
      text: '(UTC+07:00) Bangkok, Hanoi, Jakarta',
      utc: ['Asia/Ho_Chi_Minh'],
      value: 'Asia/Ho_Chi_Minh',
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        message: 'success',
      }),
    });

    await createBackendInfrastructureTimezone(payload, {
      baseUrl: 'http://backend:7820',
      fetch: fetchMock as unknown as typeof fetch,
    });
    await updateBackendInfrastructureTimezone(
      'timezone/id',
      {
        abbr: payload.abbr,
        isdst: payload.isdst,
        offset: payload.offset,
        text: payload.text,
        utc: payload.utc,
        value: payload.value,
      },
      {
        baseUrl: 'http://backend:7820',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );
    await deleteBackendInfrastructureTimezone('timezone/id', {
      baseUrl: 'http://backend:7820',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://backend:7820/api/v1/infrastructure/timezones',
      expect.objectContaining({
        body: JSON.stringify(payload),
        cache: 'no-store',
        headers: expect.any(Headers),
        method: 'POST',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://backend:7820/api/v1/infrastructure/timezones/timezone%2Fid',
      expect.objectContaining({
        cache: 'no-store',
        headers: expect.any(Headers),
        method: 'PUT',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'http://backend:7820/api/v1/infrastructure/timezones/timezone%2Fid',
      expect.objectContaining({
        cache: 'no-store',
        headers: expect.any(Headers),
        method: 'DELETE',
      })
    );

    const postHeaders = new Headers(getFetchInit(fetchMock, 0)?.headers);
    const putHeaders = new Headers(getFetchInit(fetchMock, 1)?.headers);
    const deleteHeaders = new Headers(getFetchInit(fetchMock, 2)?.headers);

    expect(postHeaders.get('content-type')).toBe('application/json');
    expect(postHeaders.get('origin')).toBe('http://backend:7820');
    expect(putHeaders.get('content-type')).toBe('application/json');
    expect(deleteHeaders.get('origin')).toBe('http://backend:7820');
  });

  it('reads and mutates Rust-owned internal holidays with encoded detail paths', async () => {
    const holiday = {
      created_at: '2026-01-01 00:00:00+00',
      date: '2026-01-01',
      id: 'holiday/id',
      name: 'New Year',
      year: 2026,
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => holiday,
    });

    await getBackendInternalHolidays(
      { year: 2026 },
      {
        baseUrl: 'http://backend:7820',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );
    await createBackendInternalHoliday(
      {
        date: '2026-01-01',
        name: 'New Year',
      },
      {
        baseUrl: 'http://backend:7820',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );
    await updateBackendInternalHoliday(
      'holiday/id',
      {
        name: 'Updated New Year',
      },
      {
        baseUrl: 'http://backend:7820',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );
    await deleteBackendInternalHoliday('holiday/id', {
      baseUrl: 'http://backend:7820',
      fetch: fetchMock as unknown as typeof fetch,
    });
    await bulkImportBackendInternalHolidays(
      {
        holidays: [{ date: '2026-01-01', name: 'New Year' }],
        replaceExisting: true,
      },
      {
        baseUrl: 'http://backend:7820',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://backend:7820/api/v1/internal/holidays?year=2026',
      expect.objectContaining({
        cache: 'no-store',
        headers: expect.any(Headers),
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://backend:7820/api/v1/internal/holidays',
      expect.objectContaining({
        body: JSON.stringify({
          date: '2026-01-01',
          name: 'New Year',
        }),
        cache: 'no-store',
        headers: expect.any(Headers),
        method: 'POST',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'http://backend:7820/api/v1/internal/holidays/holiday%2Fid',
      expect.objectContaining({
        body: JSON.stringify({
          name: 'Updated New Year',
        }),
        cache: 'no-store',
        headers: expect.any(Headers),
        method: 'PUT',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      'http://backend:7820/api/v1/internal/holidays/holiday%2Fid',
      expect.objectContaining({
        cache: 'no-store',
        headers: expect.any(Headers),
        method: 'DELETE',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      'http://backend:7820/api/v1/internal/holidays/bulk',
      expect.objectContaining({
        body: JSON.stringify({
          holidays: [{ date: '2026-01-01', name: 'New Year' }],
          replaceExisting: true,
        }),
        cache: 'no-store',
        headers: expect.any(Headers),
        method: 'POST',
      })
    );

    const createHeaders = new Headers(getFetchInit(fetchMock, 1)?.headers);
    const updateHeaders = new Headers(getFetchInit(fetchMock, 2)?.headers);
    const deleteHeaders = new Headers(getFetchInit(fetchMock, 3)?.headers);
    const bulkHeaders = new Headers(getFetchInit(fetchMock, 4)?.headers);

    expect(createHeaders.get('content-type')).toBe('application/json');
    expect(createHeaders.get('origin')).toBe('http://backend:7820');
    expect(updateHeaders.get('content-type')).toBe('application/json');
    expect(deleteHeaders.get('origin')).toBe('http://backend:7820');
    expect(bulkHeaders.get('content-type')).toBe('application/json');
  });

  it('reads and mutates Rust-owned infrastructure email blacklist entries with encoded detail paths', async () => {
    const entry = {
      added_by_user_id: 'user-1',
      created_at: '2026-01-01 00:00:00+00',
      entry_type: 'email' as const,
      id: 'entry/id',
      reason: 'spam',
      updated_at: '2026-01-01 00:00:00+00',
      value: 'blocked@example.com',
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => entry,
    });

    await getBackendInfrastructureEmailBlacklistEntries({
      baseUrl: 'http://backend:7820',
      fetch: fetchMock as unknown as typeof fetch,
    });
    await getBackendInfrastructureEmailBlacklistEntry('entry/id', {
      baseUrl: 'http://backend:7820',
      fetch: fetchMock as unknown as typeof fetch,
    });
    await createBackendInfrastructureEmailBlacklistEntry(
      {
        entry_type: 'email',
        reason: 'spam',
        value: 'blocked@example.com',
      },
      {
        baseUrl: 'http://backend:7820',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );
    await updateBackendInfrastructureEmailBlacklistEntry(
      'entry/id',
      {
        reason: 'policy violation',
      },
      {
        baseUrl: 'http://backend:7820',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );
    await deleteBackendInfrastructureEmailBlacklistEntry('entry/id', {
      baseUrl: 'http://backend:7820',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://backend:7820/api/v1/infrastructure/email-blacklist',
      expect.objectContaining({
        cache: 'no-store',
        headers: expect.any(Headers),
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://backend:7820/api/v1/infrastructure/email-blacklist/entry%2Fid',
      expect.objectContaining({
        cache: 'no-store',
        headers: expect.any(Headers),
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'http://backend:7820/api/v1/infrastructure/email-blacklist',
      expect.objectContaining({
        body: JSON.stringify({
          entry_type: 'email',
          reason: 'spam',
          value: 'blocked@example.com',
        }),
        cache: 'no-store',
        headers: expect.any(Headers),
        method: 'POST',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      'http://backend:7820/api/v1/infrastructure/email-blacklist/entry%2Fid',
      expect.objectContaining({
        body: JSON.stringify({
          reason: 'policy violation',
        }),
        cache: 'no-store',
        headers: expect.any(Headers),
        method: 'PUT',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      'http://backend:7820/api/v1/infrastructure/email-blacklist/entry%2Fid',
      expect.objectContaining({
        cache: 'no-store',
        headers: expect.any(Headers),
        method: 'DELETE',
      })
    );

    const createHeaders = new Headers(getFetchInit(fetchMock, 2)?.headers);
    const updateHeaders = new Headers(getFetchInit(fetchMock, 3)?.headers);
    const deleteHeaders = new Headers(getFetchInit(fetchMock, 4)?.headers);

    expect(createHeaders.get('content-type')).toBe('application/json');
    expect(createHeaders.get('origin')).toBe('http://backend:7820');
    expect(updateHeaders.get('content-type')).toBe('application/json');
    expect(deleteHeaders.get('origin')).toBe('http://backend:7820');
  });

  it('reads the Rust-owned infrastructure changelog list with admin filters', async () => {
    const response = {
      data: [
        {
          category: 'security',
          content: null,
          cover_image_url: null,
          created_at: '2026-06-01T00:00:00.000Z',
          creator_id: 'user-1',
          id: 'entry-1',
          is_published: false,
          published_at: null,
          slug: 'security-draft',
          summary: 'Security draft',
          title: 'Security draft',
          updated_at: '2026-06-01T00:00:00.000Z',
          version: null,
        },
      ],
      pagination: {
        page: 2,
        pageSize: 5,
        total: 6,
        totalPages: 2,
      },
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => response,
    });

    const changelogs = await getBackendInfrastructureChangelogEntries(
      {
        category: 'security',
        page: 2,
        pageSize: 5,
        published: false,
        q: 'security fix',
      },
      {
        baseUrl: 'http://backend:7820',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    expect(changelogs.pagination.total).toBe(6);
    expect(changelogs.data[0]?.slug).toBe('security-draft');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://backend:7820/api/v1/infrastructure/changelog?category=security&page=2&pageSize=5&published=false&q=security+fix',
      expect.objectContaining({
        cache: 'no-store',
        headers: expect.any(Headers),
      })
    );
  });

  it('reads the Rust-owned infrastructure post email queue summary', async () => {
    const response = {
      byWorkspace: [
        {
          blocked: 0,
          cancelled: 0,
          failed: 1,
          processing: 0,
          queued: 2,
          sent: 3,
          skipped: 0,
          staleQueued1h: 1,
          staleQueued24h: 0,
          total: 6,
          ws_id: 'ws-1',
        },
      ],
      recentBatches: [
        {
          batch_id: 'batch-1',
          claimed: 4,
          failed: 1,
          last_attempt_at: '2026-01-01T00:00:00.000Z',
          processing: 0,
          queued: 0,
          sent: 3,
          skipped: 0,
        },
      ],
      summary: {
        blocked: 0,
        cancelled: 0,
        failed: 1,
        processing: 0,
        queued: 2,
        sent: 3,
        skipped: 0,
        total: 6,
      },
      health: {
        activeBacklog: 3,
        generatedAt: '2026-01-01T00:00:00.000Z',
        oldestQueuedAt: '2025-12-31T23:00:00.000Z',
        staleQueued1h: 1,
        staleQueued24h: 0,
        status: 'degraded',
      },
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => response,
    });

    await expect(
      getBackendInfrastructurePostEmailQueue({
        baseUrl: 'http://backend:7820',
        fetch: fetchMock as unknown as typeof fetch,
      })
    ).resolves.toEqual(response);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://backend:7820/api/v1/infrastructure/post-email-queue',
      expect.objectContaining({
        cache: 'no-store',
        headers: expect.any(Headers),
      })
    );
  });

  it('runs the infrastructure post email queue through the protected backend helper', async () => {
    const response = {
      claimed: 10,
      ok: true,
      processed: 10,
      requestId: 'queue-run-1',
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => response,
    });

    await expect(
      runBackendInfrastructurePostEmailQueue(
        { limit: 500, sendLimit: 200 },
        {
          baseUrl: 'http://backend:7820',
          fetch: fetchMock as unknown as typeof fetch,
        }
      )
    ).resolves.toEqual(response);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://backend:7820/api/v1/infrastructure/post-email-queue/run-now',
      expect.objectContaining({
        body: JSON.stringify({ limit: 500, sendLimit: 200 }),
        cache: 'no-store',
        method: 'POST',
      })
    );
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

  it('reads Rust-owned crawler list, domain, and uncrawled legacy routes with encoded inputs', async () => {
    const listResponse = {
      count: 1,
      data: [
        {
          created_at: '2026-06-23T00:00:00.000Z',
          html: '<main>Docs</main>',
          id: 'crawler-1',
          markdown: '# Docs',
          url: 'https://docs.example.com/guide/intro',
        },
      ],
    };
    const domainsResponse = {
      cached: false,
      domains: ['docs.example.com'],
    };
    const uncrawledResponse = {
      groupedUrls: {
        'crawler-1': [
          {
            created_at: '2026-06-23T00:00:00.000Z',
            origin_id: 'crawler-1',
            origin_url: 'https://docs.example.com',
            skipped: false,
            url: 'https://docs.example.com/guide/next',
          },
        ],
      },
      pagination: {
        page: 2,
        pageSize: 25,
        totalItems: 1,
        totalPages: 1,
      },
      uncrawledUrls: [
        {
          created_at: '2026-06-23T00:00:00.000Z',
          origin_id: 'crawler-1',
          origin_url: 'https://docs.example.com',
          skipped: false,
          url: 'https://docs.example.com/guide/next',
        },
      ],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => listResponse,
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => domainsResponse,
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => uncrawledResponse,
      });

    await expect(
      getBackendWorkspaceCrawlerList(
        'personal workspace',
        {
          domain: 'docs.example.com',
          page: 2,
          pageSize: 25,
          search: 'guide/intro',
        },
        {
          baseUrl: 'http://backend:7820',
          fetch: fetchMock as unknown as typeof fetch,
        }
      )
    ).resolves.toEqual(listResponse);
    await expect(
      getBackendWorkspaceCrawlerDomains('personal workspace', {
        baseUrl: 'http://backend:7820',
        fetch: fetchMock as unknown as typeof fetch,
      })
    ).resolves.toEqual(domainsResponse);
    await expect(
      getBackendWorkspaceCrawlerUncrawled(
        'personal workspace',
        {
          domain: 'docs.example.com',
          page: 2,
          pageSize: 25,
          search: 'guide/next',
        },
        {
          baseUrl: 'http://backend:7820',
          fetch: fetchMock as unknown as typeof fetch,
        }
      )
    ).resolves.toEqual(uncrawledResponse);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://backend:7820/api/personal%20workspace/crawlers/list?domain=docs.example.com&page=2&pageSize=25&search=guide%2Fintro',
      expect.objectContaining({
        cache: 'no-store',
        headers: expect.any(Headers),
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://backend:7820/api/personal%20workspace/crawlers/domains',
      expect.objectContaining({
        cache: 'no-store',
        headers: expect.any(Headers),
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'http://backend:7820/api/personal%20workspace/crawlers/uncrawled?domain=docs.example.com&page=2&pageSize=25&search=guide%2Fnext',
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

  it('reads Rust-owned workspace billing details', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        creditPacks: [
          {
            archived: false,
            currency: 'usd',
            expiryDays: 30,
            id: 'pack-1',
            name: 'Starter credits',
            price: 1000,
            tokens: 5000,
          },
        ],
        isPersonalWorkspace: false,
        orders: [
          {
            billingReason: 'subscription_cycle',
            createdAt: '2026-06-01T00:00:00Z',
            currency: 'usd',
            id: 'order-1',
            originalAmount: 2000,
            productName: 'Pro',
            status: 'paid',
            totalAmount: 2000,
          },
        ],
        products: [],
        seatList: [],
        seatStatus: {
          availableSeats: 3,
          canAddMember: true,
          isSeatBased: true,
          memberCount: 2,
          pricePerSeat: 1000,
          seatCount: 5,
        },
        subscription: {
          cancelAtPeriodEnd: false,
          createdAt: '2026-06-01T00:00:00Z',
          currentPeriodEnd: '2026-07-01T00:00:00Z',
          currentPeriodStart: '2026-06-01T00:00:00Z',
          id: 'sub-1',
          product: {
            description: 'Team plan',
            id: 'product-1',
            max_seats: 5,
            name: 'Pro',
            price: 2000,
            price_per_seat: 1000,
            pricing_model: 'seat_based',
            recurring_interval: 'month',
            tier: 'PRO',
          },
          seatCount: 2,
          seatList: [],
          status: 'active',
        },
      }),
    });

    const billing = await getBackendWorkspaceBilling('personal workspace', {
      baseUrl: 'http://backend:7820',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(billing.subscription.product.name).toBe('Pro');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://backend:7820/api/v1/workspaces/personal%20workspace/billing',
      expect.objectContaining({
        cache: 'no-store',
        headers: expect.any(Headers),
      })
    );
  });

  it('reads Rust-owned workspace AI credit status', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        allowedFeatures: ['chat'],
        allowedModels: ['gpt-5-mini'],
        balanceScope: 'workspace',
        bonusCredits: 25,
        dailyLimit: 1000,
        dailyUsed: 42,
        defaultImageModel: 'gpt-image-1',
        defaultLanguageModel: 'gpt-5-mini',
        included: {
          bonusCredits: 25,
          remaining: 983,
          totalAllocated: 1000,
          totalUsed: 42,
        },
        maxOutputTokens: 8192,
        payg: {
          nextExpiry: null,
          remaining: 0,
          totalGranted: 0,
          totalUsed: 0,
        },
        percentUsed: 4.1,
        periodEnd: '2026-07-01T00:00:00Z',
        periodStart: '2026-06-01T00:00:00Z',
        remaining: 983,
        seatCount: 2,
        tier: 'PRO',
        totalAllocated: 1000,
        totalUsed: 42,
      }),
    });

    const credits = await getBackendWorkspaceAiCredits('ws/with slash', {
      baseUrl: 'http://backend:7820',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(credits.balanceScope).toBe('workspace');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://backend:7820/api/v1/workspaces/ws%2Fwith%20slash/ai/credits',
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
