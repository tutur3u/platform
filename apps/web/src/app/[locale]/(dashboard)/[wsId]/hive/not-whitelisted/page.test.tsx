import { isValidElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  HiveAccessRequestCard: vi.fn(() => null),
  getWebHivePageContext: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error('not-found');
  }),
}));

vi.mock('@tuturuuu/hive-ui/access', () => ({
  HiveAccessRequestCard: mocks.HiveAccessRequestCard,
}));

vi.mock('@/lib/hive-page-context', () => ({
  getWebHivePageContext: mocks.getWebHivePageContext,
}));

vi.mock('next/navigation', () => ({
  notFound: mocks.notFound,
}));

describe('web Hive not-whitelisted page parity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getWebHivePageContext.mockResolvedValue({
      access: null,
      user: {
        email: 'user@example.com',
        id: 'user-1',
      },
      workspace: {
        id: 'workspace-1',
      },
      wsId: 'workspace-1',
    });
  });

  it('renders the shared Hive access request card inside the web dashboard shell', async () => {
    const HiveNotWhitelistedPage = (await import('./page')).default;

    const result = await HiveNotWhitelistedPage({
      params: Promise.resolve({ locale: 'en', wsId: 'personal' }),
    });

    expect(mocks.notFound).not.toHaveBeenCalled();
    expect(isValidElement(result)).toBe(true);
    expect(result.type).toBe(mocks.HiveAccessRequestCard);
    expect(result.props).toMatchObject({
      approvedRedirectPath: '/personal/hive',
      showLogout: false,
    });
  });
});
