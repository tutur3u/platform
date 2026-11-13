import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const router = vi.hoisted(() => ({ pathname: '/' }));
vi.mock('@tanstack/react-router', async (load) => ({
  ...(await load<typeof import('@tanstack/react-router')>()),
  useLocation: ({ select }: { select: (l: { pathname: string }) => string }) =>
    select({ pathname: router.pathname }),
  useRouter: () => ({ invalidate: async () => undefined }),
}));

import { createBridgeRootRoute } from './page-route';
import { bridgeStatusLocale } from './status-route';

/** What a branded status page must contain; empty when it does. */
function problems(html: string, variant: 'not-found' | 'error') {
  const found: string[] = [];
  if (!html.includes(`data-status-page="${variant}"`))
    found.push('shared page');
  if ((html.match(/<h1[\s>]/g) ?? []).length !== 1) found.push('one h1');
  if (!html.includes('href="https://tuturuuu.com"')) found.push('home link');
  if (!html.includes('<header') || !html.includes('<footer'))
    found.push('chrome');
  if (html.includes('<script')) found.push('script');
  return found;
}

function render(component: unknown, props: object = {}) {
  return renderToStaticMarkup(
    createElement(component as ComponentType<object>, props)
  );
}

describe('bridge root status pages', () => {
  const route = createBridgeRootRoute({
    appName: 'Tools',
    searchPath: '/search',
  });

  it('renders the shared not-found page with app links', () => {
    router.pathname = '/vi/missing';
    const html = render(route.notFoundComponent);
    expect(problems(html, 'not-found')).toEqual([]);
    expect(html).toContain('lang="vi"');
    expect(html).toContain('Mở Tools');
    expect(html).toContain('href="/search"');
  });

  it('renders the shared error page with Try again', () => {
    router.pathname = '/missing';
    const html = render(route.errorComponent, {
      error: new Error('boom'),
      reset: () => undefined,
      info: { componentStack: '' },
    });
    expect(problems(html, 'error')).toEqual([]);
    expect(html).toContain('Try again');
    expect(html).not.toContain('boom');
  });

  it('rejects the bare 404 markup the shared page replaces', () => {
    expect(
      problems('<main style="padding:2rem"><h1>404</h1></main>', 'not-found')
    ).toEqual(['shared page', 'home link', 'chrome']);
  });

  it('reads the locale after the mount base', () => {
    expect(bridgeStatusLocale('/tasks/vi/x', '/tasks')).toBe('vi');
    expect(bridgeStatusLocale('/vi', '')).toBe('vi');
    expect(bridgeStatusLocale('/tasks/x', '/tasks')).toBe('en');
  });
});
