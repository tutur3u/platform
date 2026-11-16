import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  connection: vi.fn(),
  resolve: vi.fn(),
  client: {},
  redirect: vi.fn(),
}));
vi.mock('next/server', () => ({ connection: mocks.connection }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: () => mocks.client,
}));
vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: mocks.resolve,
}));
vi.mock('@/constants/common', () => ({ BASE_URL: 'https://tuturuuu.com' }));
vi.mock('./logout-choices', () => ({ LogoutChoices: () => null }));

import LogoutPage from './page';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolve.mockResolvedValue({
    user: { id: 'fixture-current', email: 'fixture@example.test' },
  });
  mocks.redirect.mockImplementation(() => {
    throw new Error('Redirect');
  });
});

describe('request-time logout confirmation', () => {
  it('resolves the verified current user on the server and passes only safe display data', async () => {
    const result = await LogoutPage({
      params: Promise.resolve({ locale: 'vi' }),
      searchParams: Promise.resolve({ appUrl: 'https://tasks.tuturuuu.com' }),
    });
    expect(mocks.connection).toHaveBeenCalledOnce();
    expect(mocks.resolve).toHaveBeenCalledWith(mocks.client);
    expect(result.props).toEqual({
      target: { name: 'Tasks', origin: 'https://tasks.tuturuuu.com' },
      email: 'fixture@example.test',
      locale: 'vi',
      canLogoutBrowser: true,
    });
  });

  it('does not pass an attacker-controlled origin or label into a logout action', async () => {
    const result = await LogoutPage({
      params: Promise.resolve({ locale: 'en' }),
      searchParams: Promise.resolve({ appUrl: 'https://attacker.example' }),
    });
    expect(result.props.target).toBeNull();
  });

  it('can end a remaining app session when the central session has expired', async () => {
    mocks.resolve.mockResolvedValue({ user: null });
    const result = await LogoutPage({
      params: Promise.resolve({ locale: 'en' }),
      searchParams: Promise.resolve({ appUrl: 'https://tasks.tuturuuu.com' }),
    });
    expect(result.props.target?.origin).toBe('https://tasks.tuturuuu.com');
    expect(result.props.canLogoutBrowser).toBe(false);
    expect(result.props.email).toBeNull();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it('sends an unsigned request to the matching-language login without a mutation', async () => {
    mocks.resolve.mockResolvedValue({ user: null });
    await expect(
      LogoutPage({
        params: Promise.resolve({ locale: 'vi' }),
        searchParams: Promise.resolve({}),
      })
    ).rejects.toThrow();
    expect(mocks.redirect).toHaveBeenCalledWith('/vi/login');
  });
});
