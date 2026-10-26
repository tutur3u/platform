// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { clickRecord, trackClick } from './analytics';
import {
  isNavigableDestination,
  isParseableDestination,
  locationHeaderValue,
  rawSearch,
} from './destination';
import { HOST_REDIRECTS, hostRedirect, PRODUCTION_HOSTS } from './hosts';
import { resolveShortLink } from './resolve';
import type { ShortLinkRecord, ShortLinkStore } from './store';
import { verifyShortLinkPassword } from './verify';

function store(rows: ShortLinkRecord[] = []) {
  const clicks: unknown[] = [];
  const value: ShortLinkStore = {
    findBySlug: vi.fn(
      async (slug: string) =>
        rows.find((row) => row.id === `id:${slug}`) ?? null
    ),
    findById: vi.fn(
      async (id: string) => rows.find((r) => r.id === id) ?? null
    ),
    recordClick: vi.fn(async (record) => {
      clicks.push(record);
    }),
  };
  return { store: value, clicks };
}
const row = (slug: string, link: string, hash: string | null = null) => ({
  id: `id:${slug}`,
  link,
  password_hash: hash,
  password_hint: hash ? 'first pet' : null,
});

describe('destination validation', () => {
  it('keeps the legacy parseability rule and rejects script schemes', () => {
    expect(isParseableDestination('mailto:team@example.com')).toBe(true);
    expect(isParseableDestination('not a url')).toBe(false);
    expect(isNavigableDestination('https://example.com/a?b=1')).toBe(true);
    expect(isNavigableDestination('mailto:team@example.com')).toBe(true);
    for (const link of [
      'javascript:alert(1)',
      'JAVASCRIPT:alert(1)',
      'data:text/html,<p>x</p>',
      'vbscript:msgbox(1)',
      'example.com',
    ])
      expect(isNavigableDestination(link)).toBe(false);
  });

  it('emits the stored target exactly unless a header cannot carry it', () => {
    const exact = 'https://Example.com/a/../b?x=1&x=2&y=%2F#frag';
    expect(locationHeaderValue(exact)).toBe(exact);
    expect(locationHeaderValue('https://example.com/a b')).toBe(
      'https://example.com/a%20b'
    );
    expect(locationHeaderValue('https://例え.jp/パス')).toBe(
      new URL('https://例え.jp/パス').href
    );
  });

  it('returns the raw query with duplicate keys and order intact', () => {
    expect(rawSearch('https://ttr.gg/a?b=2&a=1&a=&a=%20x+y')).toBe(
      '?b=2&a=1&a=&a=%20x+y'
    );
    expect(rawSearch('https://ttr.gg/a')).toBe('');
    expect(rawSearch('https://ttr.gg/a?')).toBe('?');
    expect(rawSearch('https://ttr.gg/a?x=1#h')).toBe('?x=1');
  });
});

describe('host aliases', () => {
  it('covers all seven configured domains with their statuses', () => {
    expect([...PRODUCTION_HOSTS].sort()).toEqual([
      'shortener.tuturuuu.com',
      'ttr.gg',
      'tutur3u.com',
      'tuturuu.com',
      'www.ttr.gg',
      'www.tutur3u.com',
      'www.tuturuu.com',
    ]);
    expect(HOST_REDIRECTS['www.ttr.gg']).toBe(308);
    expect(hostRedirect(new URL('https://ttr.gg/x'), '')).toBeNull();
  });

  it.each(Object.entries(HOST_REDIRECTS))(
    '%s keeps path and raw query',
    (host, status) => {
      const response = hostRedirect(
        new URL(`https://${host}/Alias_1?a=1&a=2`),
        '?a=1&a=2'
      );
      expect(response?.status).toBe(status);
      expect(response?.headers.get('location')).toBe(
        'https://ttr.gg/Alias_1?a=1&a=2'
      );
    }
  );
});

describe('slug resolution', () => {
  it('redirects generated slugs and custom aliases to the stored target', async () => {
    const { store: links } = store([
      row('aB3-x_', 'https://example.com/landing?utm=1&utm=2'),
      row('My-Custom_Alias', 'https://example.org'),
    ]);
    expect(await resolveShortLink(links, 'aB3-x_')).toEqual({
      kind: 'redirect',
      linkId: 'id:aB3-x_',
      location: 'https://example.com/landing?utm=1&utm=2',
    });
    expect(await resolveShortLink(links, 'My-Custom_Alias')).toMatchObject({
      kind: 'redirect',
      location: 'https://example.org',
    });
    expect(links.findBySlug).toHaveBeenCalledWith('My-Custom_Alias');
    expect(await resolveShortLink(links, 'my-custom_alias')).toEqual({
      kind: 'not-found',
    });
  });

  it('renders invalid and password pages without disclosing the target', async () => {
    const { store: links } = store([
      row('bad', 'not a url'),
      row('script', 'javascript:alert(1)'),
      row('locked', 'https://secret.example', 'hash'),
    ]);
    expect(await resolveShortLink(links, 'bad')).toEqual({ kind: 'invalid' });
    expect(await resolveShortLink(links, 'script')).toEqual({
      kind: 'invalid',
    });
    const locked = await resolveShortLink(links, 'locked');
    expect(locked).toEqual({
      kind: 'password',
      linkId: 'id:locked',
      slug: 'locked',
      hint: 'first pet',
    });
    expect(JSON.stringify(locked)).not.toContain('secret.example');
  });
});

describe('click analytics', () => {
  it('keeps Vercel geolocation semantics while the legacy origin serves', () => {
    const record = clickRecord(
      'link',
      new Headers({
        'user-agent': 'UA',
        referer: 'https://ref.example',
        'x-forwarded-for': '203.0.113.9, 10.0.0.1',
        'x-vercel-ip-country': 'VN',
        'x-vercel-ip-country-region': 'SG',
        'x-vercel-ip-city': 'Ho Chi Minh City',
        'x-vercel-ip-latitude': '10.8',
        'x-vercel-ip-longitude': '106.6',
        'x-vercel-ip-timezone': 'Asia/Ho_Chi_Minh',
        'x-vercel-ip-postal-code': '700000',
        'x-vercel-id': 'sin1::abc::123',
      })
    );
    expect(record).toEqual({
      link_id: 'link',
      ip_address: '203.0.113.9',
      user_agent: 'UA',
      referrer: 'https://ref.example',
      country: 'VN',
      country_region: 'SG',
      city: 'Ho Chi Minh City',
      latitude: 10.8,
      longitude: 106.6,
      timezone: 'Asia/Ho_Chi_Minh',
      postal_code: '700000',
      vercel_region: 'sin1',
      vercel_id: 'sin1::abc::123',
    });
  });

  it('uses trusted Cloudflare geolocation and connecting IP on Workers', () => {
    const record = clickRecord(
      'link',
      new Headers({
        'cf-connecting-ip': '198.51.100.7',
        'x-forwarded-for': '203.0.113.66',
      }),
      {
        country: 'VN',
        regionCode: 'SG',
        city: 'Thu Duc',
        latitude: '10.85',
        longitude: 'not-a-number',
        timezone: 'Asia/Ho_Chi_Minh',
        postalCode: '71300',
      }
    );
    expect(record).toMatchObject({
      ip_address: '198.51.100.7',
      country: 'VN',
      country_region: 'SG',
      city: 'Thu Duc',
      latitude: 10.85,
      longitude: null,
      timezone: 'Asia/Ho_Chi_Minh',
      postal_code: '71300',
      vercel_region: null,
      vercel_id: null,
      referrer: null,
    });
    expect(
      clickRecord('link', new Headers({ 'x-real-ip': '192.0.2.4' })).ip_address
    ).toBe('192.0.2.4');
  });

  it('ignores client-sent Vercel and forwarding headers when cf is present', () => {
    const forged = new Headers({
      'cf-connecting-ip': '198.51.100.7',
      'x-forwarded-for': '203.0.113.66',
      'x-real-ip': '203.0.113.67',
      'x-vercel-ip-country': 'US',
      'x-vercel-ip-country-region': 'CA',
      'x-vercel-ip-city': 'Forged City',
      'x-vercel-ip-latitude': '1',
      'x-vercel-ip-longitude': '2',
      'x-vercel-ip-timezone': 'America/Los_Angeles',
      'x-vercel-ip-postal-code': '94016',
      'x-vercel-id': 'iad1::forged',
    });
    expect(clickRecord('link', forged, { country: 'VN' })).toMatchObject({
      ip_address: '198.51.100.7',
      country: 'VN',
      country_region: null,
      city: null,
      latitude: null,
      longitude: null,
      timezone: null,
      postal_code: null,
      vercel_region: null,
      vercel_id: null,
    });
    // An empty cf object is still the trusted source: nothing falls back to
    // client headers, including the forwarded address.
    forged.delete('cf-connecting-ip');
    expect(clickRecord('link', forged, {})).toMatchObject({
      ip_address: null,
      country: null,
      vercel_region: null,
      vercel_id: null,
    });
  });

  it('never lets an analytics failure escape', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { store: links } = store();
    vi.mocked(links.recordClick).mockRejectedValueOnce(new Error('down'));
    await expect(
      trackClick(links, clickRecord('link', new Headers()))
    ).resolves.toBeUndefined();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});

describe('POST /api/verify', () => {
  const post = (body: string) =>
    new Request('https://ttr.gg/api/verify', { method: 'POST', body });
  function deps(rows: ShortLinkRecord[]) {
    const fixture = store(rows);
    return {
      fixture,
      deps: {
        store: fixture.store,
        comparePassword: vi.fn(
          async (password: string, hash: string) => `hash:${password}` === hash
        ),
        click: (linkId: string) => clickRecord(linkId, new Headers()),
        track: trackClick,
      },
    };
  }

  it('keeps the legacy statuses and bodies', async () => {
    const { deps: d, fixture } = deps([
      row('open', 'https://open.example'),
      row('locked', 'https://locked.example', 'hash:pw'),
    ]);
    const invalid = await verifyShortLinkPassword(post('{"linkId":1}'), d);
    expect(invalid.status).toBe(400);
    expect((await invalid.json()).error).toBe('Invalid request data');
    const missing = await verifyShortLinkPassword(
      post('{"linkId":"none","password":"x"}'),
      d
    );
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: 'Link not found' });
    const open = await verifyShortLinkPassword(
      post('{"linkId":"id:open","password":""}'),
      d
    );
    expect(await open.json()).toEqual({ url: 'https://open.example' });
    const wrong = await verifyShortLinkPassword(
      post('{"linkId":"id:locked","password":"no","slug":"locked"}'),
      d
    );
    expect(wrong.status).toBe(403);
    expect(await wrong.json()).toEqual({
      error: 'Incorrect password. Please try again.',
    });
    expect(fixture.clicks).toHaveLength(0);
    const right = await verifyShortLinkPassword(
      post('{"linkId":"id:locked","password":"pw","slug":"locked"}'),
      d
    );
    expect(right.status).toBe(200);
    expect(await right.json()).toEqual({
      url: 'https://locked.example',
      success: true,
    });
    expect(fixture.clicks).toMatchObject([{ link_id: 'id:locked' }]);
  });

  it('returns the legacy 500 for an unreadable body', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = await verifyShortLinkPassword(post('{'), deps([]).deps);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Internal server error' });
    error.mockRestore();
  });
});
