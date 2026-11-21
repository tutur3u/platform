import { describe, expect, it } from 'vitest';
import { stripMountedSupabaseWrites } from '../core/mount-isolation';
import { defineBridgeAppConfig } from './app-config';

const SESSION = `base64-${btoa(
  JSON.stringify({ access_token: 'access', refresh_token: 'refresh' })
).replace(/=+$/u, '')}`;
const mounts = {
  rootHosts: ['learn.tuturuuu.com'],
  mountHosts: ['tuturuuu.com'],
  basePath: '/learn',
};

function appendingConfig(seen: string[]) {
  return defineBridgeAppConfig({
    mounts,
    wrapResponse(response, { request }) {
      seen.push(request.headers.get('cookie') ?? '');
      const result = new Response(response.body, response);
      result.headers.append('set-cookie', 'sb-ref-auth-token=x; Path=/');
      result.headers.append('set-cookie', '__Host-ttr_session=x; Path=/');
      result.headers.set('clear-site-data', '"cookies"');
      return result;
    },
  });
}

describe('defineBridgeAppConfig wrapResponse guard', () => {
  it('reduces the request and strips session writes on a mount', async () => {
    const seen: string[] = [];
    const config = appendingConfig(seen);
    const result = await config.wrapResponse?.(new Response('ok'), {
      request: new Request('https://tuturuuu.com/learn/en', {
        headers: { cookie: `sb-ref-auth-token=${SESSION}` },
      }),
      env: {},
    });
    expect(seen[0]).not.toContain(SESSION);
    expect(result?.headers.getSetCookie()).toEqual([]);
    expect(result?.headers.has('clear-site-data')).toBe(false);
  });

  it('leaves the subdomain root as the app wrote it', async () => {
    const seen: string[] = [];
    const config = appendingConfig(seen);
    const result = await config.wrapResponse?.(new Response('ok'), {
      request: new Request('https://learn.tuturuuu.com/en', {
        headers: { cookie: `sb-ref-auth-token=${SESSION}` },
      }),
      env: {},
    });
    expect(seen[0]).toContain(SESSION);
    expect(result?.headers.getSetCookie()).toHaveLength(2);
  });
});

describe('stripMountedSupabaseWrites', () => {
  it('drops Clear-Site-Data even without cookies', () => {
    const response = new Response('ok', {
      headers: { 'clear-site-data': '"cookies"' },
    });
    expect(
      stripMountedSupabaseWrites(response).headers.has('clear-site-data')
    ).toBe(false);
  });
});
