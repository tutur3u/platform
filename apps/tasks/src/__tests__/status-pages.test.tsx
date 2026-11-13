import type { ReactElement, ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', async (load) => ({
  ...(await load<typeof import('next-intl')>()),
  useLocale: () => 'vi',
}));
vi.mock('@tanstack/react-router', async (load) => ({
  ...(await load<typeof import('@tanstack/react-router')>()),
  useRouterState: ({ select }: { select: (state: unknown) => unknown }) =>
    select({ matches: [{ routeId: '__root__', context: { locale: 'vi' } }] }),
}));
vi.mock('../runtime/app-providers', () => ({
  AppProviders: ({ children }: { children: ReactNode }) => children,
}));

import NotFound from '../app/[locale]/not-found';
import ErrorBoundary from '../app/[locale]/error';
import { TasksError, TasksNotFound } from '../runtime/router-shell';

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

describe('Tasks status pages', () => {
  it('Next not-found renders the shared page in the request locale', () => {
    const html = render(<NotFound />);
    expect(statusProblems(html, 'not-found')).toEqual([]);
    expect(html).toContain('Mở Tasks');
  });

  it('Next error renders the shared page with Try again', () => {
    const html = render(
      <ErrorBoundary
        error={new Error('sensitive-provider-detail')}
        reset={() => undefined}
      />
    );
    expect(statusProblems(html, 'error')).toEqual([]);
    expect(html).not.toContain('sensitive-provider-detail');
  });

  it('Start root not-found and error render the shared page', () => {
    const notFound = render(<TasksNotFound />);
    expect(statusProblems(notFound, 'not-found')).toEqual([]);
    expect(notFound).toContain('lang="vi"');
    const error = render(
      <TasksError
        error={new Error('sensitive-provider-detail')}
        info={{ componentStack: '' }}
        reset={() => undefined}
      />
    );
    expect(statusProblems(error, 'error')).toEqual([]);
    expect(error).toContain('Thử lại');
  });

  it('rejects the bare 404 the root route used to render', () => {
    expect(
      statusProblems(
        '<main class="grid min-h-dvh place-items-center"><h1>404</h1></main>',
        'not-found'
      )
    ).toEqual(['shared page', 'chrome', 'home']);
  });
});
