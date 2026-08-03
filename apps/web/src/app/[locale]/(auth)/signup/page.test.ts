import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  redirect: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: (...args: Parameters<typeof mocks.redirect>) =>
    mocks.redirect(...args),
}));

describe('signup compatibility page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redirects old signup links to the unified login form', async () => {
    const { default: SignupPage } = await import('./page');

    await SignupPage({
      params: Promise.resolve({ locale: 'en' }),
      searchParams: Promise.resolve({}),
    });

    expect(mocks.redirect).toHaveBeenCalledWith('/login');
  });

  it('preserves return and next parameters', async () => {
    const { default: SignupPage } = await import('./page');

    await SignupPage({
      params: Promise.resolve({ locale: 'vi' }),
      searchParams: Promise.resolve({
        nextUrl: '/personal',
        returnUrl: 'https://tasks.tuturuuu.com/verify-token?nextUrl=/personal',
        scope: ['account', 'workspace'],
      }),
    });

    expect(mocks.redirect).toHaveBeenCalledWith(
      '/vi/login?nextUrl=%2Fpersonal&returnUrl=https%3A%2F%2Ftasks.tuturuuu.com%2Fverify-token%3FnextUrl%3D%2Fpersonal&scope=account&scope=workspace'
    );
  });
});
