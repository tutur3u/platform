// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { headers, withBridgeRequest } from './request-context';

// jsdom runs modules with Vite's `import.meta.env.SSR` set to false. The
// request store must still be installed there: only the preset's client
// `define` (START_BRIDGE_CLIENT) turns the install off.
describe('request store under a browser-like test environment', () => {
  it('is installed, so bridged helpers can read the request', async () => {
    const cookie = await withBridgeRequest(
      new Request('https://app.tuturuuu.com', { headers: { cookie: 'a=1' } }),
      async () => (await headers()).get('cookie')
    );
    expect(cookie).toBe('a=1');
  });
});
