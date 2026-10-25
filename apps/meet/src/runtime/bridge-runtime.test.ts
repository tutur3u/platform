import './bridge-runtime';
import { createInternalApiClient } from '@tuturuuu/internal-api/client';
import { meetingAppPath, meetingAppUrl } from '@tuturuuu/meet-core/runtime';
import { withBridgeRequest } from '@tuturuuu/start-bridge/request-context';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { matchMeetPage } from './page-routing';

afterEach(() => vi.unstubAllEnvs());

describe('Meet app URL adapters', () => {
  it('keeps concurrent root and mounted API, worklet and share paths separate', async () => {
    vi.stubEnv('INTERNAL_WEB_API_ORIGIN', 'https://tuturuuu.com');
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({ ok: true })
    );
    const client = createInternalApiClient({ fetch: fetcher });
    await Promise.all(
      ['', '/meet'].map((appBase) =>
        withBridgeRequest(
          {
            request: new Request(`https://tuturuuu.com${appBase}/vi/r/code`),
            appBase,
          },
          async () => {
            await Promise.resolve();
            expect(meetingAppPath('/meet-live-processor.js')).toBe(
              `${appBase}/meet-live-processor.js`
            );
            expect(meetingAppUrl('/vi/r/code')).toBe(
              `https://tuturuuu.com${appBase}/vi/r/code`
            );
            expect(matchMeetPage(`${appBase}/vi/r/code`)?.kind).toBe('room');
            expect(matchMeetPage(`${appBase}/vi/r/code`)?.locale).toBe('vi');
            await client.fetch(
              '/api/meet-call/one/token?tag=one%2Ftwo&tag=two+words'
            );
            await client.fetch('/api/v1/workspaces');
          }
        )
      )
    );
    const urls = fetcher.mock.calls.map(([url]) => String(url));
    expect(urls).toContain(
      'https://tuturuuu.com/api/meet-call/one/token?tag=one%2Ftwo&tag=two+words'
    );
    expect(urls).toContain(
      'https://tuturuuu.com/meet/api/meet-call/one/token?tag=one%2Ftwo&tag=two+words'
    );
    expect(
      urls.filter((url) => url === 'https://tuturuuu.com/api/v1/workspaces')
    ).toHaveLength(2);
  });

  it('preserves an explicit API destination and never captures another API family', async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({ ok: true })
    );
    await withBridgeRequest(
      { request: new Request('https://tuturuuu.com/meet'), appBase: '/meet' },
      async () => {
        const client = createInternalApiClient({
          fetch: fetcher,
          baseUrl: 'https://explicit.invalid',
        });
        await client.fetch('/api/meet-live/memory');
        expect(fetcher.mock.calls[0]?.[0]).toBe(
          'https://explicit.invalid/api/meet-live/memory'
        );
      }
    );
  });
});
