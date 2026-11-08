// @vitest-environment node
import { createBridgeHandler } from '@tuturuuu/start-bridge/start/handler';
import { NextResponse } from 'next/server';
import { describe, expect, it } from 'vitest';
import appConfig from '../../start-bridge.config';

const env = {
  ASSETS: { fetch: async () => new Response('unused fixture asset') },
  TUTURUUU_NOINDEX: '0',
};
const ctx = { waitUntil: (_work: Promise<unknown>) => undefined };
const sandbox =
  'sandbox allow-scripts allow-downloads allow-pointer-lock allow-modals';
const webgl = '/api/v1/workspaces/ws/external-projects/assets/asset/webgl';

async function serve(path: string) {
  const request = new Request(`https://forms.tuturuuu.com${path}`);
  const handle = createBridgeHandler<typeof env, typeof ctx>({
    mounts: { app: 'forms', rootHosts: [], ...appConfig.mounts },
    csp: appConfig.csp,
    start: { fetch: () => new Response('page') },
    proxy: async () => NextResponse.next(),
    assets: () => undefined,
    centralApiOrigin: () => 'https://central.invalid',
    forwardApi: async () =>
      new Response('sealed upstream payload', {
        headers: {
          'Content-Type': 'text/html',
          'Content-Security-Policy': sandbox,
          'Cache-Control': 'public, max-age=600',
        },
      }),
  });
  const response = await handle(request, env, ctx);
  if (!appConfig.wrapResponse) throw new Error('Forms wrapper is required');
  return appConfig.wrapResponse(response, { request, env });
}

describe('composed Forms bridge and final framing policy', () => {
  it.each([`${webgl}/index.html`, `${webgl}/Build/game.loader.js`, webgl])(
    'preserves upstream WebGL sandbox and framing on %s',
    async (path) => {
      const response = await serve(path);
      expect(response.status).toBe(200);
      expect(await response.text()).toBe('sealed upstream payload');
      expect(response.headers.get('Content-Security-Policy')).toBe(sandbox);
      expect(response.headers.has('X-Frame-Options')).toBe(false);
      expect(response.headers.get('Cache-Control')).toBe('private, no-store');
      expect(response.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
    }
  );

  it.each([
    `${webgl}-extra/index.html`,
    `${webgl.replace('/webgl', '/webglx')}/index.html`,
    '/api/v1/workspaces/ws/external-projects/assets/webgl/index.html',
    `/vi${webgl}/index.html`,
  ])('denies framing for the neighbouring path %s', async (path) => {
    const response = await serve(path);
    expect(response.headers.get('X-Frame-Options')).toBe('DENY');
    expect(response.headers.get('Content-Security-Policy')).toContain(
      "frame-ancestors 'none'"
    );
    expect(response.headers.get('Content-Security-Policy')).toContain(
      "'strict-dynamic'"
    );
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });
});
