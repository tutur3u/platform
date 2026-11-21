import { describe, expect, it } from 'vitest';
import appConfig from '../../start-bridge.config';

const wrap = (url: string, env: Record<string, string> = {}) =>
  Promise.resolve(
    appConfig.wrapResponse!(new Response('ok'), {
      request: new Request(url),
      env: env as never,
    })
  );

describe('Finance bridge app config', () => {
  it('admits no root host unless the build defines the profile host', () => {
    expect(appConfig.mounts?.rootHosts).toEqual([]);
    expect(appConfig.mounts?.mountHosts).toEqual([]);
    expect(appConfig.mounts?.basePath).toBe('/finance');
    expect(appConfig.mounts?.unknownHost).toBe('reject');
  });

  it('keeps Vercel Finance robots parity on every profile', async () => {
    for (const env of [{}, { TUTURUUU_NOINDEX: '1' }]) {
      expect(
        (await wrap('https://finance.tuturuuu.com/', env)).headers.get(
          'x-robots-tag'
        )
      ).toBe('noindex, nofollow, nosnippet');
    }
  });
});
