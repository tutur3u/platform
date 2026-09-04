import { beforeEach, describe, expect, it, vi } from 'vitest';

const AUTHORIZATION_ERROR = new Error('authorization unavailable');
const REDIRECT_SENTINEL = new Error('NEXT_REDIRECT');
const USER_ID = '11111111-1111-4111-8111-111111111111';
const WORKSPACE_ID = '22222222-2222-4222-8222-222222222222';

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  getGitAppConfigurationStatus: vi.fn(),
  getInstallationToken: vi.fn(),
  getSafeGitHubErrorMessage: vi.fn(() => 'GitHub is temporarily unavailable'),
  recordGitAuditEvent: vi.fn(),
  redirect: vi.fn(),
  requireGitAdmin: vi.fn(),
  revalidateTag: vi.fn(),
  saveGitAppConfiguration: vi.fn(),
  updateGitAppValidation: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidateTag: mocks.revalidateTag,
}));

vi.mock('next/navigation', () => ({
  redirect: mocks.redirect,
}));

vi.mock('@/constants/common', () => ({
  GITHUB_API_VERSION: 'test-version',
}));

vi.mock('@/lib/admin-access', () => ({
  requireGitAdmin: mocks.requireGitAdmin,
}));

vi.mock('@/lib/github/credentials', () => ({
  getGitAppConfigurationStatus: mocks.getGitAppConfigurationStatus,
  getInstallationToken: mocks.getInstallationToken,
  recordGitAuditEvent: mocks.recordGitAuditEvent,
  saveGitAppConfiguration: mocks.saveGitAppConfiguration,
  updateGitAppValidation: mocks.updateGitAppValidation,
}));

vi.mock('@/lib/github/errors', () => ({
  getSafeGitHubErrorMessage: mocks.getSafeGitHubErrorMessage,
}));

vi.mock('@/lib/github/private-db', () => ({
  privateDb: vi.fn(),
}));

vi.mock('@/lib/github/repository-input', () => ({
  normalizeRepositoryInput: vi.fn(),
}));

async function validateConfiguration() {
  const { validateConfigurationAction } = await import('./admin-actions');
  return validateConfigurationAction(WORKSPACE_ID);
}

function expectNoPrivilegedValidationCalls() {
  expect(mocks.getInstallationToken).not.toHaveBeenCalled();
  expect(mocks.fetch).not.toHaveBeenCalled();
  expect(mocks.updateGitAppValidation).not.toHaveBeenCalled();
  expect(mocks.recordGitAuditEvent).not.toHaveBeenCalled();
}

describe('validateConfigurationAction authorization', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubGlobal('fetch', mocks.fetch);
    mocks.redirect.mockImplementation(() => {
      throw REDIRECT_SENTINEL;
    });
    mocks.requireGitAdmin.mockResolvedValue({
      db: {},
      user: { id: USER_ID },
    });
    mocks.getInstallationToken.mockResolvedValue('placeholder');
    mocks.fetch.mockResolvedValue({
      json: vi.fn(async () => ({})),
      ok: true,
      status: 200,
    });
    mocks.updateGitAppValidation.mockResolvedValue(undefined);
    mocks.recordGitAuditEvent.mockResolvedValue(undefined);
  });

  it.each(['unauthenticated', 'permission denied'])(
    'redirects a null %s result without privileged work',
    async () => {
      mocks.requireGitAdmin.mockResolvedValue(null);

      await expect(validateConfiguration()).rejects.toBe(REDIRECT_SENTINEL);

      expect(mocks.redirect).toHaveBeenCalledWith('/login');
      expectNoPrivilegedValidationCalls();
    }
  );

  it('propagates a rejected authorization lookup without privileged work', async () => {
    mocks.requireGitAdmin.mockRejectedValue(AUTHORIZATION_ERROR);

    await expect(validateConfiguration()).rejects.toBe(AUTHORIZATION_ERROR);

    expect(mocks.redirect).not.toHaveBeenCalled();
    expectNoPrivilegedValidationCalls();
  });
});

describe('validateConfigurationAction authorized validation', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubGlobal('fetch', mocks.fetch);
    mocks.redirect.mockImplementation(() => {
      throw REDIRECT_SENTINEL;
    });
    mocks.requireGitAdmin.mockResolvedValue({
      db: {},
      user: { id: USER_ID },
    });
    mocks.getInstallationToken.mockResolvedValue('placeholder');
    mocks.fetch.mockResolvedValue({
      json: vi.fn(async () => ({})),
      ok: true,
      status: 200,
    });
    mocks.updateGitAppValidation.mockResolvedValue(undefined);
    mocks.recordGitAuditEvent.mockResolvedValue(undefined);
  });

  it('stores successful validation, audits the actor, and redirects', async () => {
    await expect(validateConfiguration()).rejects.toBe(REDIRECT_SENTINEL);

    expect(mocks.getInstallationToken).toHaveBeenCalledWith(536896722);
    expect(mocks.fetch).toHaveBeenCalledOnce();
    expect(mocks.updateGitAppValidation).toHaveBeenCalledWith({
      errorMessage: null,
      validatedAt: expect.any(String),
    });
    const validatedAt = mocks.updateGitAppValidation.mock.calls[0]?.[0]
      .validatedAt as string;
    expect(mocks.recordGitAuditEvent).toHaveBeenCalledWith({
      eventType: 'configuration.validated',
      metadata: {
        repository: 'tutur3u/platform',
        validatedAt,
      },
      userId: USER_ID,
    });
    expect(mocks.redirect).toHaveBeenCalledWith(
      `/-/${WORKSPACE_ID}/github-app?validated=1`
    );
  });

  it('stores one sanitized failure when configuration has no token', async () => {
    mocks.getInstallationToken.mockResolvedValue(null);

    await expect(validateConfiguration()).rejects.toBe(REDIRECT_SENTINEL);

    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.updateGitAppValidation).toHaveBeenCalledOnce();
    expect(mocks.updateGitAppValidation).toHaveBeenCalledWith({
      errorMessage: 'GitHub is temporarily unavailable',
      validatedAt: null,
    });
    expect(mocks.recordGitAuditEvent).not.toHaveBeenCalled();
    expect(mocks.redirect).toHaveBeenCalledWith(
      `/-/${WORKSPACE_ID}/github-app?error=GitHub+is+temporarily+unavailable`
    );
  });

  it('stores one sanitized failure when GitHub rejects validation', async () => {
    mocks.fetch.mockResolvedValue({
      json: vi.fn(),
      ok: false,
      status: 401,
    });

    await expect(validateConfiguration()).rejects.toBe(REDIRECT_SENTINEL);

    expect(mocks.updateGitAppValidation).toHaveBeenCalledOnce();
    expect(mocks.updateGitAppValidation).toHaveBeenCalledWith({
      errorMessage: 'GitHub is temporarily unavailable',
      validatedAt: null,
    });
    expect(mocks.recordGitAuditEvent).not.toHaveBeenCalled();
    expect(mocks.redirect).toHaveBeenCalledWith(
      `/-/${WORKSPACE_ID}/github-app?error=GitHub+is+temporarily+unavailable`
    );
  });

  it('keeps validation-state writer failure best-effort and sanitized', async () => {
    mocks.updateGitAppValidation.mockRejectedValue(
      new Error('database detail must not be exposed')
    );

    await expect(validateConfiguration()).rejects.toBe(REDIRECT_SENTINEL);

    expect(mocks.updateGitAppValidation).toHaveBeenCalledTimes(2);
    expect(mocks.updateGitAppValidation).toHaveBeenNthCalledWith(1, {
      errorMessage: null,
      validatedAt: expect.any(String),
    });
    expect(mocks.updateGitAppValidation).toHaveBeenNthCalledWith(2, {
      errorMessage: 'GitHub is temporarily unavailable',
      validatedAt: null,
    });
    expect(mocks.recordGitAuditEvent).not.toHaveBeenCalled();
    expect(mocks.redirect).toHaveBeenCalledWith(
      `/-/${WORKSPACE_ID}/github-app?error=GitHub+is+temporarily+unavailable`
    );
  });
});
