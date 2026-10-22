import { describe, expect, it } from 'vitest';
import { getAppDomainByUrl } from './internal-domains';

describe('registered production satellite origins', () => {
  it.each([
    ['rewise', 'https://rewise.me'],
    ['nova', 'https://nova.ai.vn'],
    ['rewise', 'https://rewise.tuturuuu.com'],
    ['nova', 'https://nova.tuturuuu.com'],
    ['cms', 'https://cms.tuturuuu.com'],
  ])('resolves %s at %s for central login', (name, origin) => {
    const returnUrl = `${origin}/verify-token?nextUrl=%2F`;
    expect(getAppDomainByUrl(returnUrl)).toMatchObject({
      canonicalUrl: returnUrl,
      kind: 'internal',
      name,
    });
  });

  it.each(['rewise.me', 'nova.ai.vn'])(
    'requires the exact HTTPS origin for %s',
    (host) => {
      for (const origin of [
        `http://${host}`,
        `https://${host}:444`,
        `https://${host}.evil.com`,
        `https://evil${host}`,
        `https://preview.${host}`,
        `https://${host}@evil.com`,
        `https://evil.com@${host}`,
        `https://user:password@${host}`,
      ]) {
        expect(getAppDomainByUrl(`${origin}/verify-token`), origin).toBeNull();
      }
    }
  );

  it('keeps unregistered Vercel deployments blocked', () => {
    expect(
      getAppDomainByUrl('https://cms-tuturuuu.vercel.app/verify-token')
    ).toBeNull();
  });
});
