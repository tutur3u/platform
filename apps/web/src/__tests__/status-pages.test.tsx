import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const intl = vi.hoisted(() => ({ locale: 'en' }));
vi.mock('next-intl', async (load) => ({
  ...(await load<typeof import('next-intl')>()),
  useLocale: () => intl.locale,
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
  it.each(['en', 'vi'])('not-found renders the shared page (%s)', (locale) => {
    intl.locale = locale;
    const html = render(<NotFound />);
    expect(statusProblems(html, 'not-found')).toEqual([]);
    expect(html).toContain(`lang="${locale}"`);
    expect(html).toContain('href="/contact"');
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
