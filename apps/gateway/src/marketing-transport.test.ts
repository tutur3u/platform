import { createServer } from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { expect, it } from 'vitest';
import marketing from '../../marketing/start-bridge.config';
import policies from '../../../packages/utils/src/seo-policy.json';
import { manifest } from './manifest';
import { createHandler } from './worker';

it('uses real HTTP fetch to the Marketing policy with the rewritten backend URL', async () => {
  const seen: string[] = [];
  const server = createServer(async (incoming, outgoing) => {
    const backendUrl = `http://${incoming.headers.host}${incoming.url}`;
    seen.push(backendUrl);
    const response = await marketing.wrapResponse!(
      new Response('transport body', {
        status: incoming.url === '/pricing' ? 307 : 200,
        headers: incoming.url === '/pricing' ? { location: '/' } : {},
      }),
      {
        request: new Request(backendUrl),
        env: {},
        seoPolicy: policies.marketing,
      }
    );
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(await response.text());
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const handler = createHandler({
    manifest,
    now: Date.now,
    cache: () => ({ match: async () => undefined, put: async () => {} }),
  });
  try {
    for (const path of ['/', '/vi', '/pricing', '/products/%2Fai']) {
      const response = await handler(
        new Request(`https://tuturuuu.com${path}`),
        {
          WEB_ORIGIN: origin,
          MARKETING_ORIGIN: origin,
          GATEWAY_MARKETING_GROUPS: 'home,products',
          PUBLIC_HOST: 'tuturuuu.com',
        }
      );
      expect(await response.text()).toBe('transport body');
      expect(response.headers.get('x-robots-tag')).toBe(
        path.includes('%2F') ? 'noindex, nofollow, nosnippet' : null
      );
      if (path === '/pricing') {
        expect(response.status).toBe(307);
        expect(response.headers.get('location')).toBe('/');
      }
      expect(seen.at(-1)).toBe(`${origin}${path}`);
    }
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  }
});
