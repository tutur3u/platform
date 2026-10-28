// @vitest-environment jsdom
import { getLegalDocument } from '@tuturuuu/legal';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { Fetcher } from './fallback';
import { createWebCandidateHandler } from './handler';
import { stagingProfile } from './profile';
import { LegalPage } from './start/legal-page';

const env = {
  WEB_START_CANDIDATE: 'staging',
  WEB_START_NATIVE_LEGAL: 'on',
  NEXT_FALLBACK_ORIGIN: 'https://tuturuuu-next-fixture.vercel.app',
  NEXT_PUBLIC_SUPABASE_URL: stagingProfile.supabaseUrl,
  AUTH_COOKIE_DOMAIN: stagingProfile.cookieDomain,
  TRUSTED_PROXY_ORIGIN_SECRET: 'disposable-test-origin-proof-key-123456',
};
const pages = [
  { kind: 'privacy', slug: 'privacy', seoKey: 'privacy' },
  { kind: 'terms', slug: 'terms', seoKey: 'terms' },
  { kind: 'acceptable-use', slug: 'acceptable-use', seoKey: 'acceptable_use' },
  { kind: 'dpa', slug: 'legal/dpa', seoKey: 'legal_dpa' },
  { kind: 'sla', slug: 'legal/sla', seoKey: 'legal_sla' },
  {
    kind: 'subprocessors',
    slug: 'legal/subprocessors',
    seoKey: 'legal_subprocessors',
  },
] as const;
const paths = pages.flatMap(({ slug }) => [
  `/${slug}`,
  `/en/${slug}`,
  `/vi/${slug}`,
]);
function setup() {
  const start = vi.fn(async () => new Response('<main>native legal</main>'));
  const fetcher = vi.fn<Fetcher>(
    async () =>
      new Response('Next', {
        headers: {
          [stagingProfile.upstreamProjectHeader]: stagingProfile.supabaseRef,
        },
      })
  );
  return {
    start,
    fetcher,
    handler: createWebCandidateHandler({ start, fetcher }),
  };
}
function request(path: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  headers.set('cf-connecting-ip', '203.0.113.10');
  return new Request(`https://${stagingProfile.host}${path}`, {
    ...init,
    headers,
  });
}

describe('native legal slice dispatch and rollback', () => {
  it.each(paths)(
    'renders GET and HEAD %s through Start without fallback',
    async (path) => {
      const { start, fetcher, handler } = setup();
      for (const method of ['GET', 'HEAD']) {
        const response = await handler(
          request(`${path}?tag=1&tag=2`, { method }),
          env
        );
        expect(response.status).toBe(200);
        expect(response.headers.get('x-tuturuuu-web-renderer')).toBe(
          'native-Start'
        );
        expect(response.headers.get('cache-control')).toBe('no-store');
        expect(response.headers.get('content-security-policy')).toContain(
          "frame-ancestors 'none'"
        );
        expect(await response.text()).toBe(
          method === 'HEAD' ? '' : '<main>native legal</main>'
        );
      }
      expect(start).toHaveBeenCalledTimes(2);
      expect(fetcher).not.toHaveBeenCalled();
    }
  );
  it.each([undefined, '', 'off', 'true', 'unknown'])(
    'rolls back every public route to attested Next for %s',
    async (flag) => {
      const { start, fetcher, handler } = setup();
      for (const path of paths) {
        const response = await handler(request(`${path}?keep=%2f`), {
          ...env,
          WEB_START_NATIVE_LEGAL: flag,
        });
        expect(await response.text()).toBe('Next');
        expect(response.headers.get('x-tuturuuu-web-renderer')).toBe(
          'Next-fallback'
        );
        const forwarded = fetcher.mock.calls.at(-1)?.[0];
        expect(forwarded).toBeInstanceOf(Request);
        expect(forwarded instanceof Request ? forwarded.url : undefined).toBe(
          `${env.NEXT_FALLBACK_ORIGIN}${path}?keep=%2f`
        );
      }
      expect(start).not.toHaveBeenCalled();
      expect(fetcher).toHaveBeenCalledTimes(paths.length);
    }
  );
  it('keeps APIs, satellite routes, unknown locales, RSC and writes on Next', async () => {
    const { start, fetcher, handler } = setup();
    const requests = [
      request('/api/v1/legal'),
      request('/ws/drive'),
      request('/fr/privacy'),
      request('/privacy/child'),
      request('/privacy/'),
      request('/vi/terms', { method: 'POST', body: 'once' }),
      ...[
        'rsc',
        'next-action',
        'next-router-state-tree',
        'next-router-prefetch',
      ].map((name) => request('/privacy', { headers: { [name]: '1' } })),
    ];
    for (const input of requests)
      expect(await (await handler(input, env)).text()).toBe('Next');
    expect(start).not.toHaveBeenCalled();
    expect(fetcher).toHaveBeenCalledTimes(requests.length);
  });
  it('does not bypass candidate admission, including signed-in requests', async () => {
    const { start, fetcher, handler } = setup();
    expect(
      (
        await handler(
          request('/privacy', { headers: { cookie: 'sb-auth=fixture' } }),
          {
            ...env,
            WEB_START_CANDIDATE: 'off',
          }
        )
      ).status
    ).toBe(503);
    expect(start).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
    const response = await handler(
      request('/privacy', { headers: { cookie: 'sb-auth=fixture' } }),
      env
    );
    expect(response.headers.has('set-cookie')).toBe(false);
  });
});

describe('framework adapter renders canonical legal content', () => {
  for (const locale of ['en', 'vi'] as const) {
    for (const { kind } of pages) {
      it(`${locale}/${kind}: retains every canonical section, summary and review notice`, () => {
        const document = getLegalDocument(kind, locale);
        const page = new DOMParser().parseFromString(
          renderToStaticMarkup(<LegalPage kind={kind} locale={locale} />),
          'text/html'
        );
        expect(page.querySelector('h1')?.textContent).toBe(
          `${document.title} ${document.highlightedWord}`
        );
        expect(
          [...page.querySelectorAll('h2')].map((node) => node.textContent)
        ).toEqual([
          document.summaryTitle,
          ...document.sections.map((section) => section.title),
        ]);
        expect(page.querySelectorAll('dl > div')).toHaveLength(
          document.summaryRows.length
        );
        expect(page.querySelector('footer')?.textContent).toContain(
          document.footer
        );
        for (const section of document.sections) {
          const text = page.body.textContent ?? '';
          // The renderer must keep paragraph content and meaningful link labels.
          expect(text).toContain(
            section.content
              .split('\n')[0]
              ?.replace(/\*\*/gu, '')
              .replace(/\[([^\]]+)\]\([^)]+\)/gu, '$1')
          );
        }
        for (const link of page.querySelectorAll('a[href^="#"]')) {
          expect(
            page.getElementById(link.getAttribute('href')?.slice(1) ?? '')
          ).not.toBeNull();
        }
        if (locale === 'vi') {
          for (const link of page.querySelectorAll('a[href^="/"]')) {
            expect(link.getAttribute('href')).toMatch(/^\/(?:vi|en)\//u);
          }
        }
        expect(
          page.querySelectorAll('script, form, input, iframe')
        ).toHaveLength(0);
      });
    }
  }
});
