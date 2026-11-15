import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const intl = vi.hoisted(() => ({ locale: 'en' }));
const session = vi.hoisted(() => ({
  pathname: '/acme-handle' as string | null,
  user: null as { id: string } | null,
}));
vi.mock('next-intl', async (load) => ({
  ...(await load<typeof import('next-intl')>()),
  useLocale: () => intl.locale,
}));
vi.mock('next-intl/server', () => ({ getLocale: async () => intl.locale }));
vi.mock('next/navigation', () => ({ usePathname: () => session.pathname }));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: async () => ({}),
}));
vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: async () => ({ user: session.user }),
}));

import ErrorBoundary from '../app/[locale]/error';
import NotFound from '../app/[locale]/not-found';
import GlobalError from '../app/global-error';

/** What the shared status page guarantees; empty when the markup has it. */
function statusProblems(html: string, variant: 'not-found' | 'error') {
  const problems: string[] = [];
  if (!html.includes(`data-status-page="${variant}"`))
    problems.push('shared page');
  if ((html.match(/<h1[\s>]/g) ?? []).length !== 1) problems.push('one h1');
  if (!html.includes('<header') || !html.includes('<footer'))
    problems.push('chrome');
  if (!html.includes('href="https://tuturuuu.com"')) problems.push('home');
  if (html.includes('<script')) problems.push('script');
  return problems;
}

const render = (element: ReactElement) => renderToStaticMarkup(element);
const error = Object.assign(new Error('sensitive-provider-detail'), {
  digest: 'ref-123',
});

describe('web status pages', () => {
  it.each(['en', 'vi'])(
    'not-found renders the shared page (%s)',
    async (locale) => {
      intl.locale = locale;
      const html = render(await NotFound());
      expect(statusProblems(html, 'not-found')).toEqual([]);
      expect(html).toContain(`lang="${locale}"`);
      expect(html).toContain('href="/contact"');
    }
  );

  it('offers signed-out visitors sign-in back to the same path', async () => {
    intl.locale = 'en';
    session.user = null;
    session.pathname = '/vi/acme-handle';
    const html = render(await NotFound());
    expect(statusProblems(html, 'not-found')).toEqual([]);
    expect(html).toContain('href="/login?returnUrl=%2Fvi%2Facme-handle"');
    expect(html).toContain('data-action="sign-in"');
  });

  it('never carries a non-local return path into the sign-in link', async () => {
    session.user = null;
    for (const pathname of ['//evil.example', '/\\evil.example', null]) {
      session.pathname = pathname;
      const html = render(await NotFound());
      expect(html).toContain('href="/login"');
      expect(html).not.toContain('returnUrl');
    }
  });

  it('shows no sign-in link to a signed-in visitor', async () => {
    session.user = { id: 'user-1' };
    session.pathname = '/acme-handle';
    const html = render(await NotFound());
    expect(statusProblems(html, 'not-found')).toEqual([]);
    expect(html).not.toContain('data-action="sign-in"');
    session.user = null;
  });

  it('locale error renders the shared page with Try again', () => {
    const html = render(
      <ErrorBoundary error={error} reset={() => undefined} />
    );
    expect(statusProblems(html, 'error')).toEqual([]);
    expect(html).toContain('Try again');
    expect(html).toContain('ref-123');
    expect(html).not.toContain('sensitive-provider-detail');
  });

  it('global error renders the shared page as a whole document', () => {
    const html = render(<GlobalError error={error} reset={() => undefined} />);
    expect(statusProblems(html, 'error')).toEqual([]);
    expect(html.startsWith('<html')).toBe(true);
  });

  it('rejects the old three-colour 404 heading', () => {
    expect(
      statusProblems(
        '<div><h1><span>4</span><span>0</span><span>4</span></h1><a href="/">Back</a></div>',
        'not-found'
      )
    ).toEqual(['shared page', 'chrome', 'home']);
  });
});
