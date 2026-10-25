import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  origin: 'https://app.example.test',
  session: vi.fn(),
  webSession: vi.fn(),
  headers: vi.fn(),
  redirect: vi.fn((target: string) => {
    throw new Error(`fixture-redirect:${target}`);
  }),
}));
export const loginRedirectMocks = mocks;
export { normalizeAuthRedirectPath } from './redirect-path';

const malicious: [string, ...string[]] = [
  '/\\evil.example',
  '//evil.example',
  '/%5cevil.example',
  '/%2f%5cevil.example',
  '/\t/evil.example',
  '/\n/evil.example',
  'https://evil.example',
];

type Page = (props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) => Promise<unknown>;
export function defineLoginRedirectTests({
  app,
  fallback,
  load,
  centralOnly = false,
}: {
  app: string;
  fallback: string;
  load: () => Promise<{ default: Page }>;
  centralOnly?: boolean;
}) {
  async function destination(
    next: string | string[] | undefined,
    signedIn = true
  ) {
    mocks.session.mockResolvedValue(signedIn ? { sub: 'fixture-user' } : null);
    mocks.webSession.mockReturnValue(signedIn);
    const { default: page } = await load();
    await expect(
      page({ searchParams: Promise.resolve({ next }) })
    ).rejects.toThrow(/^fixture-redirect:/u);
    const target = mocks.redirect.mock.calls.at(-1)?.[0];
    if (!target) throw new Error('Missing login redirect');
    const redirect = new URL(target, mocks.origin);
    if (centralOnly || !signedIn) {
      expect(redirect.origin).toBe('https://web.example.test');
      const returned = new URL(redirect.searchParams.get('returnUrl') ?? '');
      expect(returned.origin).toBe(mocks.origin);
      expect(returned.pathname).toBe('/verify-token');
      const path = returned.searchParams.get('nextUrl');
      if (!path) throw new Error('Missing handoff destination');
      expect(new URL(path, mocks.origin).origin).toBe(mocks.origin);
      return path;
    }
    expect(redirect.origin).toBe(mocks.origin);
    return `${redirect.pathname}${redirect.search}`;
  }

  describe(`${app} login destination authority`, () => {
    beforeEach(() => {
      vi.clearAllMocks();
      mocks.origin = `https://${app}.example.test`;
      mocks.headers.mockResolvedValue(new Headers());
    });
    it.each(malicious)(
      'rejects authority-changing destination %j',
      async (next) => {
        expect(await destination(next)).toBe(fallback);
        expect(await destination(next, false)).toBe(fallback);
      }
    );
    it('normalizes the first repeated return parameter', async () => {
      expect(await destination([malicious[0], '/safe'])).toBe(fallback);
    });
    it('preserves valid path and encoded query data', async () => {
      const path =
        '/workspace?label=one%26two%23three&next=https%3A%2F%2Fexternal.example';
      expect(await destination(path)).toBe(path);
      expect(await destination(path, false)).toBe(path);
    });
    it('retains the existing app fallback', async () => {
      expect(await destination(undefined)).toBe(fallback);
    });
  });
}
