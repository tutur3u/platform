import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  createRootResponsePolicy,
  denyFrameAncestors,
  type ResponsePolicyContext,
} from './response-policy';

const policy = createRootResponsePolicy({ seo: 'noindex, nofollow' });
const publicAssets = new Set(['/robots.txt', '/favicon.ico']);

function apply(
  url: string,
  init: { method?: string; headers?: HeadersInit; status?: number } = {},
  context: Partial<ResponsePolicyContext> = {},
  run = policy
) {
  const response = new Response(init.status === 204 ? null : 'body', {
    status: init.status ?? 200,
    headers: init.headers,
  });
  return run(response, {
    request: new Request(url, { method: init.method ?? 'GET' }),
    publicAssets,
    ...context,
  }).headers;
}

describe('cache policy', () => {
  it('overrides a handler cache header on app responses (not a default)', () => {
    const headers = apply('https://finance.tuturuuu.com/en/wallets', {
      headers: {
        'Cache-Control': 'public, max-age=3600',
        Vary: 'Accept-Encoding',
      },
    });
    expect(headers.get('Cache-Control')).toBe('private, no-store');
    expect(headers.get('Vary')).toBe('Accept-Encoding, Cookie');
  });

  it('exempts only GET/HEAD asset and public-file requests', () => {
    const immutable = {
      'Cache-Control': 'public, max-age=31536000, immutable',
    };
    for (const method of ['GET', 'HEAD', 'get'])
      expect(
        apply('https://finance.tuturuuu.com/assets/app-1.js', {
          method,
          headers: immutable,
        }).get('Cache-Control'),
        method
      ).toBe('public, max-age=31536000, immutable');
    expect(
      apply('https://finance.tuturuuu.com/robots.txt', {
        method: 'HEAD',
        headers: { 'Cache-Control': 'public, max-age=60' },
      }).get('Cache-Control')
    ).toBe('public, max-age=60');
    // The method matters: POST /assets/x is not a static file request.
    for (const method of ['POST', 'PUT', 'DELETE', 'OPTIONS'])
      expect(
        apply('https://finance.tuturuuu.com/assets/app-1.js', {
          method,
          headers: immutable,
        }).get('Cache-Control'),
        method
      ).toBe('private, no-store');
    expect(
      apply('https://finance.tuturuuu.com/robots.txt', {
        method: 'POST',
      }).get('Cache-Control')
    ).toBe('private, no-store');
    // Not an asset: a lookalike path, an unlisted file, or HTML under /assets.
    for (const path of ['/assetsx/a.js', '/en/assets', '/sitemap.xml'])
      expect(
        apply(`https://finance.tuturuuu.com${path}`, {
          headers: immutable,
        }).get('Cache-Control'),
        path
      ).toBe('private, no-store');
    expect(
      apply('https://finance.tuturuuu.com/assets/missing', {
        headers: { ...immutable, 'Content-Type': 'text/html; charset=utf-8' },
      }).get('Cache-Control')
    ).toBe('private, no-store');
  });

  it('adds Cookie to Vary once and keeps a wildcard', () => {
    expect(
      apply('https://finance.tuturuuu.com/', {
        headers: { Vary: 'cookie, Accept' },
      }).get('Vary')
    ).toBe('cookie, Accept');
    expect(
      apply('https://finance.tuturuuu.com/', { headers: { Vary: '*' } }).get(
        'Vary'
      )
    ).toBe('*');
    expect(apply('https://finance.tuturuuu.com/').get('Vary')).toBe('Cookie');
  });

  it('strips the apex mount before matching assets and public files', () => {
    const mounts = { mountHosts: ['tuturuuu.com'], basePath: '/finance' };
    const immutable = { 'Cache-Control': 'public, max-age=31536000' };
    expect(
      apply(
        'https://tuturuuu.com/finance/assets/a.js',
        { headers: immutable },
        { mounts }
      ).get('Cache-Control')
    ).toBe('public, max-age=31536000');
    expect(
      apply(
        'https://tuturuuu.com/finance/robots.txt',
        { headers: immutable },
        { mounts }
      ).get('Cache-Control')
    ).toBe('public, max-age=31536000');
    // On a root host the base is an ordinary path, not a mount.
    expect(
      apply(
        'https://finance.tuturuuu.com/finance/assets/a.js',
        { headers: immutable },
        { mounts }
      ).get('Cache-Control')
    ).toBe('private, no-store');
    expect(
      apply(
        'https://tuturuuu.com/finance/en',
        { headers: immutable },
        { mounts }
      ).get('Cache-Control')
    ).toBe('private, no-store');
  });
});

describe('framing and document headers', () => {
  it('sets the fixed security headers on every response, assets included', () => {
    for (const url of [
      'https://finance.tuturuuu.com/',
      'https://finance.tuturuuu.com/assets/a.js',
    ]) {
      const headers = apply(url);
      expect(headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
      expect(headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(headers.get('Referrer-Policy')).toBe(
        'strict-origin-when-cross-origin'
      );
      expect(headers.get('X-Frame-Options')).toBe('DENY');
      expect(headers.get('Content-Security-Policy')).toBe(
        "frame-ancestors 'none'"
      );
    }
  });

  it('enforces frame-ancestors in an existing CSP, replacing any given', () => {
    expect(
      apply('https://finance.tuturuuu.com/', {
        headers: {
          'Content-Security-Policy': "default-src 'self'; script-src 'nonce-a'",
        },
      }).get('Content-Security-Policy')
    ).toBe("default-src 'self'; script-src 'nonce-a'; frame-ancestors 'none'");
    expect(denyFrameAncestors("frame-ancestors *; default-src 'self';")).toBe(
      "default-src 'self'; frame-ancestors 'none'"
    );
    // Directive names are case-insensitive.
    expect(
      denyFrameAncestors(
        "default-src 'self'; FRAME-ANCESTORS https://evil.test; Frame-Ancestors *"
      )
    ).toBe("default-src 'self'; frame-ancestors 'none'");
  });

  it('enforces it in every policy of a multi-policy CSP', () => {
    const headers = new Headers();
    headers.append('Content-Security-Policy', "default-src 'self'");
    headers.append(
      'Content-Security-Policy',
      "script-src 'nonce-b'; frame-ancestors https://partner.test"
    );
    const csp = apply('https://finance.tuturuuu.com/', { headers }).get(
      'Content-Security-Policy'
    );
    expect(csp).toBe(
      "default-src 'self'; frame-ancestors 'none', script-src 'nonce-b'; frame-ancestors 'none'"
    );
    expect(
      csp?.split(',').every((p) => p.includes("frame-ancestors 'none'"))
    ).toBe(true);
  });

  it('leaves explicitly framable paths framable', () => {
    const framable = createRootResponsePolicy({
      seo: 'noindex',
      framable: [/^\/embed\//u],
    });
    const embed = apply(
      'https://forms.tuturuuu.com/embed/f1',
      {
        headers: {
          'Content-Security-Policy': 'frame-ancestors https://partner.test',
        },
      },
      {},
      framable
    );
    expect(embed.get('X-Frame-Options')).toBeNull();
    expect(embed.get('Content-Security-Policy')).toBe(
      'frame-ancestors https://partner.test'
    );
    // Still private, still noindex/nosniff.
    expect(embed.get('Cache-Control')).toBe('private, no-store');
    expect(embed.get('X-Content-Type-Options')).toBe('nosniff');
    // Matched on the app path, so the apex mount is framable too.
    expect(
      apply(
        'https://tuturuuu.com/forms/embed/f1',
        {},
        { mounts: { mountHosts: ['tuturuuu.com'], basePath: '/forms' } },
        framable
      ).get('X-Frame-Options')
    ).toBeNull();
    // Everything else is not.
    expect(
      apply('https://forms.tuturuuu.com/en/embed', {}, {}, framable).get(
        'X-Frame-Options'
      )
    ).toBe('DENY');
  });

  it('uses a custom fallback CSP, still without ancestors', () => {
    const custom = createRootResponsePolicy({
      seo: 'noindex',
      csp: "default-src 'self'; frame-ancestors *",
    });
    expect(
      apply('https://cms.tuturuuu.com/', {}, {}, custom).get(
        'Content-Security-Policy'
      )
    ).toBe("default-src 'self'; frame-ancestors 'none'");
  });

  it('computes X-Robots-Tag from the request context', () => {
    const seo = createRootResponsePolicy<{ TUTURUUU_NOINDEX?: string }>({
      seo: ({ env }) =>
        env?.TUTURUUU_NOINDEX === '1' ? 'noindex, nofollow' : 'index, follow',
    });
    const run = (env: { TUTURUUU_NOINDEX?: string }) =>
      seo(new Response('x'), {
        request: new Request('https://cms.tuturuuu.com/'),
        env,
      }).headers.get('X-Robots-Tag');
    expect(run({ TUTURUUU_NOINDEX: '1' })).toBe('noindex, nofollow');
    expect(run({})).toBe('index, follow');
  });

  it('keeps status and body, and passes a WebSocket upgrade through', async () => {
    const response = new Response('payload', {
      status: 404,
      statusText: 'Not Found',
    });
    const secured = policy(response, {
      request: new Request('https://finance.tuturuuu.com/x'),
    });
    expect(secured.status).toBe(404);
    expect(await secured.text()).toBe('payload');
    const upgrade = { status: 101, headers: new Headers() } as Response;
    expect(policy(upgrade, { request: new Request('https://a.test/ws') })).toBe(
      upgrade
    );
  });

  it('has no relative runtime imports, so Node type stripping can load configs', () => {
    const source = readFileSync(
      new URL('./response-policy.ts', import.meta.url),
      'utf8'
    );
    expect(source).not.toMatch(/^import (?!type)[^;]*from '\.\.?\//mu);
  });
});
