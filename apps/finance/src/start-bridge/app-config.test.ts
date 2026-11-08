import { describe, expect, it } from 'vitest';
import appConfig from '../../start-bridge.config';

const wrap = (url: string, env: Record<string, string> = {}) =>
  appConfig.wrapResponse!(new Response('ok'), {
    request: new Request(url),
    env: env as never,
  }) as Response;

describe('Finance bridge app config', () => {
  it('admits no root host unless the build defines the profile host', () => {
    expect(appConfig.mounts?.rootHosts).toEqual([]);
    expect(appConfig.mounts?.unknownHost).toBe('reject');
  });

  it('keeps Vercel Finance robots parity on every profile', () => {
    for (const env of [{}, { TUTURUUU_NOINDEX: '1' }]) {
      expect(
        wrap('https://finance.tuturuuu.com/', env).headers.get('x-robots-tag')
      ).toBe('noindex, nofollow, nosnippet');
    }
  });
});
