import { beforeEach, expect, it, vi } from 'vitest';
import { StepUpContent } from './page';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  getClaims: vi.fn(),
  client: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: mocks.client,
}));
vi.mock('next/server', () => ({ connection: async () => undefined }));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));
vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string) => key,
}));
vi.mock('./step-up-client', () => ({ StepUpClient: () => null }));

const next = `https://passwords.tuturuuu.com/en/workspace?state=${'a'.repeat(43)}`;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.client.mockResolvedValue({ auth: mocks });
  mocks.getUser.mockResolvedValue({
    data: { user: { id: 'actor', app_metadata: {} } },
    error: null,
  });
  mocks.getClaims.mockResolvedValue({
    data: { claims: { sub: 'actor' } },
    error: null,
  });
});
it.each(['en', 'vi'])(
  'renders the protected %s step-up page',
  async (locale) => {
    const page = await StepUpContent({
      params: Promise.resolve({ locale }),
      searchParams: Promise.resolve({ app: 'passwords', next }),
    });
    expect(page.type).toBe('main');
    expect(mocks.getUser).toHaveBeenCalledTimes(1);
  }
);
it('validates the target before resolving an account', async () => {
  await expect(
    StepUpContent({
      params: Promise.resolve({ locale: 'en' }),
      searchParams: Promise.resolve({
        app: 'passwords',
        next: 'https://evil.test',
      }),
    })
  ).rejects.toThrow('NOT_FOUND');
  expect(mocks.client).not.toHaveBeenCalled();
});
it('redirects an unauthenticated account to login with the same step-up return path', async () => {
  mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
  await expect(
    StepUpContent({
      params: Promise.resolve({ locale: 'vi' }),
      searchParams: Promise.resolve({ app: 'passwords', next }),
    })
  ).rejects.toThrow('REDIRECT:/vi/login?nextUrl=%2Fvi%2Fstep-up');
});
it('refuses mismatched verified claims', async () => {
  mocks.getClaims.mockResolvedValue({
    data: { claims: { sub: 'other' } },
    error: null,
  });
  await expect(
    StepUpContent({
      params: Promise.resolve({ locale: 'en' }),
      searchParams: Promise.resolve({ app: 'passwords', next }),
    })
  ).rejects.toThrow('REDIRECT:/en/login');
});
