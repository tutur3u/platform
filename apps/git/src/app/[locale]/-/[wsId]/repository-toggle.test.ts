import { beforeEach, describe, expect, it, vi } from 'vitest';

const REDIRECT_SENTINEL = new Error('NEXT_REDIRECT');

const mocks = vi.hoisted(() => ({
  privateDb: vi.fn(),
  recordGitAuditEvent: vi.fn(),
  redirect: vi.fn(),
  revalidateTag: vi.fn(),
  requireGitAdmin: vi.fn(),
}));

vi.mock('@/constants/common', () => ({
  GITHUB_API_VERSION: 'test-version',
}));

vi.mock('next/cache', () => ({
  revalidateTag: mocks.revalidateTag,
}));

vi.mock('next/navigation', () => ({
  redirect: mocks.redirect,
}));

vi.mock('@/lib/admin-access', () => ({
  requireGitAdmin: mocks.requireGitAdmin,
}));

vi.mock('@/lib/github/credentials', () => ({
  getGitAppConfigurationStatus: vi.fn(),
  getInstallationToken: vi.fn(),
  recordGitAuditEvent: mocks.recordGitAuditEvent,
  saveGitAppConfiguration: vi.fn(),
  updateGitAppValidation: vi.fn(),
}));

vi.mock('@/lib/github/errors', () => ({
  getSafeGitHubErrorMessage: vi.fn(() => 'safe error'),
}));

vi.mock('@/lib/github/private-db', () => ({
  privateDb: mocks.privateDb,
}));

vi.mock('@/lib/github/repository-input', () => ({
  normalizeRepositoryInput: vi.fn(),
}));

import { toggleRepositoryAction } from './admin-actions';

function createRepositoryUpdate(result: {
  data: { id: string; name: string; owner_login: string } | null;
  error: unknown;
}) {
  const query = {
    eq: vi.fn(() => query),
    select: vi.fn(() => query),
    single: vi.fn().mockResolvedValue(result),
    update: vi.fn(() => query),
  };
  const from = vi.fn(() => query);
  mocks.privateDb.mockReturnValue({ from });
  return { from, query };
}

async function expectRedirect(
  operation: Promise<unknown>,
  destination: string
) {
  await expect(operation).rejects.toBe(REDIRECT_SENTINEL);
  expect(mocks.redirect).toHaveBeenLastCalledWith(destination);
}

describe('toggleRepositoryAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.redirect.mockImplementation(() => {
      throw REDIRECT_SENTINEL;
    });
    mocks.requireGitAdmin.mockResolvedValue({
      db: { schema: vi.fn() },
      user: { id: 'admin-1' },
    });
    mocks.recordGitAuditEvent.mockResolvedValue(undefined);
  });

  it('redirects unauthorized callers before accessing the registry', async () => {
    mocks.requireGitAdmin.mockResolvedValue(null);

    await expectRedirect(
      toggleRepositoryAction('workspace-1', 'repository-1', true),
      '/login'
    );

    expect(mocks.privateDb).not.toHaveBeenCalled();
  });

  it.each([
    { enabled: true, eventType: 'repository.enabled' },
    { enabled: false, eventType: 'repository.disabled' },
  ])('records and revalidates $eventType', async ({ enabled, eventType }) => {
    const { query } = createRepositoryUpdate({
      data: {
        id: 'repository-1',
        name: 'Platform',
        owner_login: 'Tutur3u',
      },
      error: null,
    });

    await expectRedirect(
      toggleRepositoryAction('workspace-1', 'repository-1', enabled),
      '/-/workspace-1/repositories?updated=1'
    );

    expect(query.update).toHaveBeenCalledWith({
      enabled,
      updated_at: expect.any(String),
      updated_by: 'admin-1',
    });
    expect(query.eq).toHaveBeenCalledWith('id', 'repository-1');
    expect(mocks.recordGitAuditEvent).toHaveBeenCalledWith({
      eventType,
      repositoryId: 'repository-1',
      userId: 'admin-1',
    });
    expect(mocks.revalidateTag).toHaveBeenCalledWith(
      'git:tutur3u/platform',
      'max'
    );
  });

  it.each([
    [{ message: 'private detail' }, null],
    [null, null],
  ])(
    'surfaces a sanitized failure for an unsuccessful update',
    async (error, data) => {
      createRepositoryUpdate({ data, error });

      await expectRedirect(
        toggleRepositoryAction('workspace-1', 'repository-1', true),
        '/-/workspace-1/repositories?error=Unable+to+update+repository'
      );

      expect(mocks.recordGitAuditEvent).not.toHaveBeenCalled();
      expect(mocks.revalidateTag).not.toHaveBeenCalled();
    }
  );

  it('keeps a successful toggle successful when audit recording fails', async () => {
    createRepositoryUpdate({
      data: {
        id: 'repository-1',
        name: 'platform',
        owner_login: 'tutur3u',
      },
      error: null,
    });
    mocks.recordGitAuditEvent.mockRejectedValue(new Error('audit unavailable'));

    await expectRedirect(
      toggleRepositoryAction('workspace-1', 'repository-1', true),
      '/-/workspace-1/repositories?updated=1'
    );

    expect(mocks.revalidateTag).toHaveBeenCalledOnce();
  });
});
