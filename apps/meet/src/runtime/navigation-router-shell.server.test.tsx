// @vitest-environment node

import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  isNotFound,
  isRedirect,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { notFound, permanentRedirect } from './next-navigation';
import { withMeetRequest } from './request-context';
import { Document } from './router-shell';

async function renderDocument({
  pathname,
  parentLocale,
  leafData,
}: {
  pathname: string;
  parentLocale: string;
  leafData: unknown;
}) {
  const root = createRootRoute({
    component: Document,
    head: () => ({ meta: [{ title: 'Tuturuuu Meet' }] }),
  });
  const parent = createRoute({
    getParentRoute: () => root,
    path: '$pathLocale',
    loader: () => ({ locale: parentLocale }),
    component: Outlet,
  });
  const leaf = createRoute({
    getParentRoute: () => parent,
    path: 'page',
    loader: () => leafData,
    component: () => (
      <main>
        <h1>Loaded Meet child</h1>
      </main>
    ),
  });
  const history = createMemoryHistory({ initialEntries: [pathname] });
  const router = createRouter({
    routeTree: root.addChildren([parent.addChildren([leaf])]),
    history,
    isServer: true,
  });
  try {
    await router.load();
    expect(router.state.matches.map((match) => match.status)).toEqual([
      'success',
      'success',
      'success',
    ]);
    return renderToStaticMarkup(<RouterProvider router={router} />);
  } finally {
    history.destroy();
  }
}

function thrownBy(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error('Expected the navigation adapter to throw');
}

function expectDocument(markup: string, locale: string) {
  expect(markup).toContain(`<html lang="${locale}"`);
  expect(markup).toContain('<title>Tuturuuu Meet</title>');
  expect(markup).toContain('<main><h1>Loaded Meet child</h1></main>');
}

describe('Meet Document with loaded server route matches', () => {
  it.each([
    { pathname: '/en/page', parentLocale: 'en', leafLocale: 'vi' },
    { pathname: '/vi/page', parentLocale: 'vi', leafLocale: 'en' },
  ])(
    'lets the valid leaf override $pathname and its parent',
    async ({ pathname, parentLocale, leafLocale }) => {
      const markup = await renderDocument({
        pathname,
        parentLocale,
        leafData: { locale: leafLocale },
      });
      expectDocument(markup, leafLocale);
    }
  );

  describe.each([
    { pathname: '/vi/page', parentLocale: 'en', expected: 'vi' },
    { pathname: '/en/page', parentLocale: 'vi', expected: 'en' },
  ])(
    'path fallback at $pathname ignores the valid opposite parent',
    ({ pathname, parentLocale, expected }) => {
      it.each([
        { label: 'missing loader data', leafData: undefined },
        { label: 'missing locale', leafData: {} },
        { label: 'null loader data', leafData: null },
        { label: 'primitive loader data', leafData: 'vi' },
        { label: 'numeric loader data', leafData: 7 },
        { label: 'unsupported locale', leafData: { locale: 'fr' } },
        { label: 'null locale', leafData: { locale: null } },
      ])('uses the path for $label', async ({ leafData }) => {
        expectDocument(
          await renderDocument({ pathname, parentLocale, leafData }),
          expected
        );
      });
    }
  );
});

describe('Meet terminal navigation responses', () => {
  it('throws the real permanent redirect with exact encoded location and status 308', () => {
    const href =
      '/vi/login?returnUrl=%2Fen%2Froom%3Fa%3D1&tag=one&tag=two#resume';
    const result = thrownBy(() => permanentRedirect(href));
    expect(isRedirect(result)).toBe(true);
    if (!isRedirect(result)) throw new Error('Expected a TanStack redirect');
    expect(result.status).toBe(308);
    expect(result.headers.get('location')).toBe(href);
    expect(result.options.href).toBe(href);
    expect(isNotFound(result)).toBe(false);
  });

  it('keeps permanent redirects outside the ordinary login observer in a real request', () => {
    const observer = vi.fn();
    const href = '/en/login?returnUrl=%2Fvi%2Froom';
    const responseHeaders = new Headers();
    const waitUntil = vi.fn();
    const result = thrownBy(() =>
      withMeetRequest(
        {
          request: new Request('https://meet.invalid/vi/room'),
          responseHeaders,
          waitUntil,
          observeNavigation: observer,
        },
        () => permanentRedirect(href)
      )
    );
    expect(isRedirect(result)).toBe(true);
    if (!isRedirect(result)) throw new Error('Expected a TanStack redirect');
    expect(result.status).toBe(308);
    expect(result.headers.get('location')).toBe(href);
    expect(observer).not.toHaveBeenCalled();
    expect(waitUntil).not.toHaveBeenCalled();
    expect(Array.from(responseHeaders)).toEqual([]);
  });

  it('throws a real TanStack not-found result', () => {
    const result = thrownBy(() => notFound());
    expect(isNotFound(result)).toBe(true);
    expect(isRedirect(result)).toBe(false);
  });
});
