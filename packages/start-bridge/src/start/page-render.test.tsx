import {
  isNotFound,
  isRedirect,
  notFound,
  redirect,
} from '@tanstack/router-core';
import { createElement, Fragment, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { withBridgeRequest } from '../server/request-context';
import { currentPageParams } from './page-params';
import {
  type BridgePageModules,
  expandServerElements,
  flattenFragments,
  resolveBridgePage,
  searchParamsRecord,
} from './page-render';

describe('page rendering helpers', () => {
  it('collects repeated search params like Next', () => {
    expect(searchParamsRecord(new URLSearchParams('a=1&b=2&a=3'))).toEqual({
      a: ['1', '3'],
      b: '2',
    });
  });

  it('flattens nested fragments and drops empty nodes', () => {
    const inner = createElement(Fragment, null, <em key="e" />, false);
    const nodes = flattenFragments(
      createElement(Fragment, null, <span key="s" />, null, inner)
    );
    expect(nodes.map((node) => (node as { type: string }).type)).toEqual([
      'span',
      'em',
    ]);
  });

  it('expands server components but never client references', async () => {
    const Client = Object.assign(() => <i />, {
      $$typeof: Symbol.for('react.client.reference'),
    });
    const Wrapped = async ({ children }: { children?: ReactNode }) => (
      <html lang="vi">{children}</html>
    );
    const nodes = await expandServerElements(
      <>
        <link rel="stylesheet" />
        <Wrapped>
          <Client />
        </Wrapped>
      </>
    );
    expect(nodes.map((node) => (node as { type: unknown }).type)).toEqual([
      'link',
      'html',
    ]);
  });
});

const pages = [
  {
    pattern: '/',
    file: 'src/app/[locale]/page.tsx',
    defaults: { locale: 'en' },
  },
  {
    pattern: '/notes/[id]',
    file: 'src/app/[locale]/notes/[id]/page.tsx',
    defaults: { locale: 'en' },
  },
] as const;

function RootLayout({ children }: { children?: ReactNode }) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <body className="app">{children}</body>
    </html>
  );
}

const modules = {
  'src/app/[locale]/page.tsx': {
    page: async () => ({
      default: () => <main>home</main>,
      metadata: { title: 'Home' },
    }),
    layouts: [async () => ({ default: RootLayout })],
  },
  'src/app/[locale]/notes/[id]/page.tsx': {
    page: async () => ({
      default: async ({ params }: { params: Promise<{ id: string }> }) => (
        <p>{(await params).id}</p>
      ),
      generateMetadata: async ({ params }: { params: Promise<unknown> }) => ({
        title: `Note ${((await params) as { id: string }).id}`,
      }),
    }),
    layouts: [
      async () => ({ default: RootLayout }),
      async () => ({
        default: ({ children }: { children?: ReactNode }) => (
          <section>{children}</section>
        ),
      }),
    ],
  },
};

function request(path: string, cookie = '') {
  return new Request(`https://tools.test${path}`, { headers: { cookie } });
}

describe('resolveBridgePage', () => {
  it('lifts root html/body attributes and wraps nested layouts', async () => {
    const page = await withBridgeRequest(
      request('/notes/7', 'NEXT_LOCALE=vi'),
      async () => {
        const result = await resolveBridgePage({
          href: '/notes/7?x=1',
          pages,
          modules,
        });
        expect(currentPageParams()).toEqual({ locale: 'vi', id: '7' });
        return result;
      }
    );
    expect(page?.pattern).toBe('/notes/[id]');
    expect(page?.html).toEqual({ lang: 'vi', suppressHydrationWarning: true });
    expect(page?.body).toEqual({ className: 'app' });
    expect(page?.head.meta).toContainEqual({ title: 'Note 7' });
    // The async page is awaited; the sync layout stays an element for RSC.
    expect(renderToStaticMarkup(page?.element)).toBe(
      '<section><p>7</p></section>'
    );
    const [wrapper] = flattenFragments(page?.element);
    expect(typeof (wrapper as { type: unknown }).type).toBe('function');
  });

  it('propagates notFound and redirect from async page bodies before streaming', async () => {
    const throwing = (error: () => never) => ({
      'src/app/[locale]/page.tsx': {
        page: async () => ({
          default: async () => error(),
        }),
        layouts: [async () => ({ default: RootLayout })],
      },
    });
    await withBridgeRequest(request('/'), async () => {
      const missing = await resolveBridgePage({
        href: '/',
        pages,
        modules: throwing(() => {
          throw notFound();
        }) as never,
      }).catch((caught: unknown) => caught);
      expect(isNotFound(missing)).toBe(true);
      const moved = await resolveBridgePage({
        href: '/',
        pages,
        modules: throwing(() => {
          throw redirect({ href: '/elsewhere' });
        }) as never,
      }).catch((caught: unknown) => caught);
      expect(isRedirect(moved)).toBe(true);
    });
  });

  it('types redirect-only pages that return nothing, as Next does', () => {
    const redirectOnly: BridgePageModules = {
      page: async () => ({
        default: async ({ params }: { params: Promise<{ id: string }> }) => {
          await params;
        },
      }),
      layouts: [],
    };
    expect(typeof redirectOnly.page).toBe('function');
  });

  it('keeps per-request page params isolated across concurrent requests', async () => {
    const seen = await Promise.all(
      ['1', '2'].map((id) =>
        withBridgeRequest(request(`/notes/${id}`), async () => {
          await resolveBridgePage({ href: `/notes/${id}`, pages, modules });
          await new Promise((resolve) => setTimeout(resolve, 5));
          return currentPageParams().id;
        })
      )
    );
    expect(seen).toEqual(['1', '2']);
  });

  it('matches app-relative paths under a mount', async () => {
    const mounted = { request: request('/tools/notes/3'), appBase: '/tools' };
    const page = await withBridgeRequest(mounted, () =>
      resolveBridgePage({ href: '/tools/notes/3', pages, modules })
    );
    expect(page?.pattern).toBe('/notes/[id]');
  });

  it('defaults the stripped locale and returns null when unmatched', async () => {
    await withBridgeRequest(request('/'), async () => {
      const page = await resolveBridgePage({ href: '/', pages, modules });
      expect(currentPageParams().locale).toBe('en');
      expect(page?.head.meta).toContainEqual({ title: 'Home' });
      expect(
        await resolveBridgePage({ href: '/missing', pages, modules })
      ).toBeNull();
    });
  });

  it('matches a locale-prefixed (rewritten) location on the stripped manifest', async () => {
    await withBridgeRequest(request('/notes/9', 'NEXT_LOCALE=en'), async () => {
      const page = await resolveBridgePage({
        href: '/vi/notes/9',
        pages,
        modules,
      });
      expect(page?.pattern).toBe('/notes/[id]');
      expect(currentPageParams()).toEqual({ locale: 'vi', id: '9' });
    });
  });
});
