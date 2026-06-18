import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  devMode: false,
  serverLoggerError: vi.fn(),
}));
const LOCAL_E2E_URL_ENV_KEYS = [
  'BASE_URL',
  'DATABASE_URL',
  'DIRECT_URL',
  'DOCKER_INTERNAL_SUPABASE_URL',
  'NEXT_PUBLIC_APP_URL',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_WEB_APP_URL',
  'PORTLESS_URL',
  'POSTGRES_URL',
  'SUPABASE_SERVER_URL',
  'SUPABASE_URL',
  'TUTURUUU_LOCAL_E2E_AUTH_BYPASS',
  'WEB_APP_URL',
];

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@tuturuuu/utils/constants', () => ({
  get DEV_MODE() {
    return mocks.devMode;
  },
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: {
    error: (...args: Parameters<typeof mocks.serverLoggerError>) =>
      mocks.serverLoggerError(...args),
  },
}));

function stubLocalE2EMigrationEnv(overrides: Record<string, string> = {}) {
  for (const key of LOCAL_E2E_URL_ENV_KEYS) {
    vi.stubEnv(key, '');
  }

  const values = {
    BASE_URL: 'https://tuturuuu.localhost:1355',
    DOCKER_INTERNAL_SUPABASE_URL: 'http://host.docker.internal:8001',
    NEXT_PUBLIC_APP_URL: 'https://tuturuuu.localhost:1355',
    NEXT_PUBLIC_WEB_APP_URL: 'https://tuturuuu.localhost:1355',
    NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:8001',
    PORTLESS_URL: 'https://tuturuuu.localhost:1355',
    SUPABASE_SERVER_URL: 'http://host.docker.internal:8001',
    SUPABASE_URL: 'http://host.docker.internal:8001',
    TUTURUUU_LOCAL_E2E_AUTH_BYPASS: 'true',
    WEB_APP_URL: 'https://tuturuuu.localhost:1355',
    ...overrides,
  };

  for (const [key, value] of Object.entries(values)) {
    vi.stubEnv(key, value);
  }
}

describe('requireDevMode', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    mocks.devMode = false;
  });

  it('allows normal development mode', async () => {
    mocks.devMode = true;

    const { requireDevMode } = await import('./batch-upsert');

    expect(requireDevMode()).toBeNull();
    expect(mocks.serverLoggerError).not.toHaveBeenCalled();
  });

  it('allows local Docker E2E migration routes with local targets', async () => {
    stubLocalE2EMigrationEnv();

    const { requireDevMode } = await import('./batch-upsert');

    expect(requireDevMode()).toBeNull();
    expect(mocks.serverLoggerError).not.toHaveBeenCalled();
  });

  it('rejects local E2E bypass when Supabase points at a cloud project', async () => {
    stubLocalE2EMigrationEnv({
      NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
    });

    const { requireDevMode } = await import('./batch-upsert');
    const response = requireDevMode();

    expect(response?.status).toBe(403);
    expect(mocks.serverLoggerError).toHaveBeenCalledWith(
      '[SECURITY] Blocked access to infrastructure migration route in production'
    );
  });

  it('rejects production access without the local E2E bypass', async () => {
    stubLocalE2EMigrationEnv({
      TUTURUUU_LOCAL_E2E_AUTH_BYPASS: 'false',
    });

    const { requireDevMode } = await import('./batch-upsert');

    expect(requireDevMode()?.status).toBe(403);
  });
});
