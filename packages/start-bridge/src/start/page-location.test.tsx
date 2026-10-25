import { isNotFound, isRedirect } from '@tanstack/router-core';
import type { NextRequest } from 'next/dist/server/web/spec-extension/request';
import { NextResponse } from 'next/dist/server/web/spec-extension/response';
import { describe, expect, it } from 'vitest';
import { dispatchThroughProxy, type NextProxy } from '../next/proxy-bridge';
import { withBridgeRequest } from '../server/request-context';
import { resolvePageLocation } from './page-location';
import { resolveBridgePage } from './page-render';

const pages = [
  {
    pattern: '/',
    file: 'src/app/[locale]/page.tsx',
    defaults: { locale: 'en' },
  },
  {
    pattern: '/[wsId]/tasks',
    file: 'src/app/[locale]/[wsId]/tasks/page.tsx',
    defaults: { locale: 'en' },
  },
] as const;

const modules = {
  'src/app/[locale]/page.tsx': {
    page: async () => ({ default: () => <main>root</main> }),
    layouts: [],
  },
  'src/app/[locale]/[wsId]/tasks/page.tsx': {
    page: async () => ({
      default: () => <main>tasks</main>,
      generateMetadata: async ({ params }: { params: Promise<unknown> }) => ({
        title: `Tasks ${((await params) as { wsId: string }).wsId}`,
      }),
    }),
    layouts: [],
  },
};

// The root fallback of Tasks: `/` renders the default workspace's tasks.
const rewriteRoot: NextProxy = async (request: NextRequest) =>
  request.nextUrl.pathname === '/'
    ? NextResponse.rewrite(new URL('/en/personal/tasks', request.url))
    : NextResponse.next();

describe('resolvePageLocation', () => {
  it('routes SSR on the proxy rewrite while the visible URL stays', async () => {
    const resolved: {
      page?: Awaited<ReturnType<typeof resolveBridgePage>>;
    } = {};
    const response = await dispatchThroughProxy({
      request: new Request('https://tasks.tuturuuu.com/?view=board'),
      proxy: rewriteRoot,
      dispatch: async () => {
        const href = await resolvePageLocation('/?view=board');
        expect(href).toBe('/en/personal/tasks?view=board');
        resolved.page = await resolveBridgePage({ href, pages, modules });
        return new Response('ok');
      },
    });
    expect(response.status).toBe(200);
    expect(resolved.page?.pattern).toBe('/[wsId]/tasks');
    expect(resolved.page?.head.meta).toContainEqual({
      title: 'Tasks personal',
    });
  });

  it('keeps a mounted visible URL app-relative', async () => {
    const response = await dispatchThroughProxy({
      request: new Request('https://tuturuuu.com/tasks'),
      basePath: '/tasks',
      proxy: rewriteRoot,
      dispatch: async () => {
        expect(await resolvePageLocation('/tasks')).toBe('/en/personal/tasks');
        return new Response('ok');
      },
    });
    expect(response.status).toBe(200);
  });

  const navigation = (
    proxy: NextProxy,
    href: string,
    cookie = '',
    mount?: { origin: string; base: string }
  ) => {
    const origin = mount?.origin ?? 'https://tasks.tuturuuu.com';
    const request = new Request(
      `${origin}${mount?.base ?? ''}/_serverFn/abc?payload=1`,
      { headers: { cookie, 'x-tss-serialized': 'true' } }
    );
    return withBridgeRequest({ request, appBase: mount?.base }, async () => {
      try {
        return { href: await resolvePageLocation(href, { proxy }) };
      } catch (error) {
        return { error };
      }
    });
  };

  it('runs the proxy for client navigation and honours its rewrite', async () => {
    const seen: string[] = [];
    const result = await navigation(async (request) => {
      seen.push(request.headers.get('accept') ?? '');
      expect(request.headers.has('x-tss-serialized')).toBe(false);
      return rewriteRoot(request);
    }, '/');
    expect(result).toEqual({ href: '/en/personal/tasks' });
    expect(seen).toEqual(['text/html']);
  });

  it('turns a proxy redirect into a document redirect', async () => {
    const result = await navigation(
      async (request) =>
        NextResponse.redirect(new URL('/login?next=%2Ftasks', request.url)),
      '/tasks'
    );
    expect(isRedirect(result.error)).toBe(true);
    expect(
      (result.error as { options: { href: string; reloadDocument: boolean } })
        .options
    ).toMatchObject({
      href: 'https://tasks.tuturuuu.com/login?next=%2Ftasks',
      reloadDocument: true,
    });
  });

  it('reloads the document for other terminal responses; 404 is notFound', async () => {
    const forbidden = await navigation(
      async () => NextResponse.json({ error: 'MFA required' }, { status: 403 }),
      '/x'
    );
    expect(isRedirect(forbidden.error)).toBe(true);
    const missing = await navigation(
      async () => new NextResponse(null, { status: 404 }),
      '/x'
    );
    expect(isNotFound(missing.error)).toBe(true);
  });

  it('carries proxy cookies onto the navigation response', async () => {
    const outer = new Headers();
    await withBridgeRequest(
      {
        request: new Request('https://tasks.tuturuuu.com/_serverFn/abc'),
        responseHeaders: outer,
      },
      () =>
        resolvePageLocation('/', {
          proxy: async (request) => {
            const response = await rewriteRoot(request);
            response.cookies.set('session', 'fresh');
            return response;
          },
        })
    );
    expect(outer.getSetCookie().join(';')).toMatch(/session=fresh/u);
  });

  it('returns the href unchanged outside a bridge request', async () => {
    expect(await resolvePageLocation('/x?y=1')).toBe('/x?y=1');
  });

  const redirectHref = (result: { error?: unknown }) =>
    (result.error as { options: { href: string } }).options.href;
  const MOUNT = { origin: 'https://tuturuuu.com', base: '/tasks' };
  // Forms that a URL parser could read as another origin.
  const HOSTILE = [
    'https://ignored.invalid//attacker.test/private',
    'http://attacker.test/private',
    '//attacker.test/private',
    '/\\attacker.test/private',
    '\\\\attacker.test/private',
    '/\t/attacker.test/private',
    '/\n/attacker.test/private',
    '/a/..//attacker.test/private',
    'attacker.test/private',
  ];

  it.each([
    ['root', undefined],
    ['mount', MOUNT],
  ])('rejects hrefs that could name another origin (%s)', async (_, mount) => {
    for (const href of HOSTILE) {
      let proxied = false;
      const result = await navigation(
        async () => {
          proxied = true;
          return NextResponse.json({}, { status: 403 });
        },
        href,
        '',
        mount
      );
      expect(isNotFound(result.error), href).toBe(true);
      expect(proxied, href).toBe(false);
    }
    await expect(resolvePageLocation('//attacker.test/x')).rejects.toSatisfy(
      isNotFound
    );
  });

  it.each([
    ['root', undefined, 'https://tasks.tuturuuu.com/b?q=1'],
    ['mount', MOUNT, 'https://tuturuuu.com/tasks/b?q=1'],
  ])(
    'keeps the 403 and failure fallbacks on the request origin (%s)',
    async (_, mount, expected) => {
      const forbidden = await navigation(
        async () => NextResponse.json({}, { status: 403 }),
        '/a/../b?q=1',
        '',
        mount
      );
      expect(redirectHref(forbidden)).toBe(expected);
      const failed = await navigation(
        async () => {
          throw new Error('proxy failure');
        },
        '/a/../b?q=1',
        '',
        mount
      );
      expect(redirectHref(failed)).toBe(expected);
      expect(new URL(redirectHref(failed)).origin).toBe(
        mount?.origin ?? 'https://tasks.tuturuuu.com'
      );
    }
  );

  it('keeps a configured external redirect from the app proxy', async () => {
    const result = await navigation(
      async () =>
        NextResponse.redirect('https://tuturuuu.com/login?returnUrl=%2Ftasks'),
      '/tasks'
    );
    expect(redirectHref(result)).toBe(
      'https://tuturuuu.com/login?returnUrl=%2Ftasks'
    );
  });
});
