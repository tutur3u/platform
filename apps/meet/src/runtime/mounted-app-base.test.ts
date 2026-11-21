import { NextResponse } from 'next/dist/server/web/spec-extension/response';
import { beforeEach, expect, it, vi } from 'vitest';

const ports = vi.hoisted(() => ({
  start: vi.fn<(request: Request) => Promise<Response>>(),
  proxy: vi.fn(),
}));
vi.mock('@tuturuuu/start-bridge/start/server-entry', () => ({
  createBridgeStartHandler: () => ({ fetch: ports.start }),
}));
vi.mock('../proxy', () => ({ proxy: ports.proxy }));
vi.mock('./api-registry', () => ({
  dispatchMeetEndpoint: async () => undefined,
}));
vi.mock('./native-function-proxy', () => ({ nativeFunctionProxy: vi.fn() }));
vi.mock('@tuturuuu/utils/next-config', () => ({
  resolveTuturuuuWebAppUrl: () => 'https://tuturuuu.com',
}));

import { appBaseHeadScript } from '@tuturuuu/start-bridge/start/base-path';
import { startBridgePreset } from '@tuturuuu/start-bridge/vite';
import { installRequestStore } from '@tuturuuu/start-bridge/request-context';
import { AsyncLocalStorage } from 'node:async_hooks';
import { handleMeetRequest } from './handler';

// Shared packages in the Worker bundle install the bridge request store after
// Meet's own request context; install it last, as the production bundle does.
installRequestStore(new AsyncLocalStorage());

const ctx = { waitUntil() {} };
const BASE = /globalThis\.__tuturuuuAppBase=("[^"]*");/u;

beforeEach(() => {
  vi.clearAllMocks();
  ports.proxy.mockImplementation(async () => NextResponse.next());
  // Start renders the root route head exactly as `routes/__root.tsx` does.
  ports.start.mockImplementation(
    async () =>
      new Response(
        `<html><head><script>${appBaseHeadScript().children}</script>` +
          '</head><body></body></html>',
        { headers: { 'content-type': 'text/html; charset=utf-8' } }
      )
  );
});

async function documentBase(url: string) {
  const page = await handleMeetRequest(new Request(url), {} as never, ctx);
  const html = await page.text();
  const match = BASE.exec(html);
  expect(match).not.toBeNull();
  return { base: JSON.parse(match![1]!) as string, html };
}

/** The browser expression Vite emits for a runtime asset URL in client JS. */
function clientAssetUrl(base: string, filename: string) {
  const built = startBridgePreset({
    appRoot: import.meta.url,
    app: 'meet',
  }).experimental.renderBuiltUrl(filename, { hostType: 'js' });
  if (!built || !('runtime' in built)) throw new Error('no runtime URL');
  const browser = { __tuturuuuAppBase: base };
  return new Function('globalThis', `return ${built.runtime};`)(browser);
}

it('hands the mounted base to the browser for an authed route through /meet', async () => {
  const { base } = await documentBase(
    'https://tuturuuu.com/meet/personal/meetings'
  );
  expect(base).toBe('/meet');
  // The locale bundle, dynamic chunks and other runtime assets stay mounted.
  expect(clientAssetUrl(base, 'assets/en-39jcxgow.json')).toBe(
    '/meet/assets/en-39jcxgow.json'
  );
});

it('keeps the subdomain root base on meet.tuturuuu.com', async () => {
  const { base } = await documentBase(
    'https://meet.tuturuuu.com/personal/meetings'
  );
  expect(base).toBe('');
  expect(clientAssetUrl(base, 'assets/en-39jcxgow.json')).toBe(
    '/assets/en-39jcxgow.json'
  );
});
