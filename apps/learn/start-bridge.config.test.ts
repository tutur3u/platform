import { describe, expect, it } from 'vitest';
import config from './start-bridge.config';

const html = () =>
  new Response('<!doctype html><p>learn</p>', {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });

async function wrap(url: string, response = html()) {
  return config.wrapResponse!(response, {
    request: new Request(url),
    env: { NEXT_PUBLIC_SUPABASE_URL: 'https://abcd.supabase.co' },
    mounts: {
      rootHosts: ['learn.tuturuuu.com'],
      mountHosts: ['tuturuuu.com'],
      basePath: '/learn',
    },
  });
}

describe('learn security headers', () => {
  it('enforces the nonce script policy', () => {
    const policy = config.csp!('n0nce', {
      request: new Request('https://learn.tuturuuu.com/'),
      response: html(),
      path: '/',
    });
    expect(policy).toContain("script-src 'nonce-n0nce' 'strict-dynamic'");
    expect(policy).toContain("object-src 'none'");
  });

  it('reports Trusted Types and the full policy on documents, root and mount', async () => {
    for (const url of [
      'https://learn.tuturuuu.com/courses',
      'https://tuturuuu.com/learn/courses',
    ]) {
      const response = await wrap(url);
      const reportOnly =
        response.headers.get('content-security-policy-report-only') ?? '';
      expect(reportOnly).toContain("require-trusted-types-for 'script'");
      expect(reportOnly).toContain('https://abcd.supabase.co');
      expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    }
    const mounted = await wrap('https://tuturuuu.com/learn/courses');
    expect(
      mounted.headers.get('content-security-policy-report-only')
    ).toContain('https://tuturuuu.com/learn/');
  });

  it('adds no document policy to non-HTML responses', async () => {
    const response = await wrap(
      'https://learn.tuturuuu.com/api/x',
      Response.json({ ok: true })
    );
    expect(response.headers.has('content-security-policy-report-only')).toBe(
      false
    );
  });
});
