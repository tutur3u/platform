import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createBackendApiClient,
  getBackendLegacyHealth,
  getBackendMigrationCutoverGates,
  getBackendMigrationManifest,
  getBackendMigrationProgress,
  getBackendMigrationStatus,
  getConfiguredBackendApiBaseUrl,
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
});
