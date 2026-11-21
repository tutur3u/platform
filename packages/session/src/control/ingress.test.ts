import { describe, expect, it } from 'vitest';
import { classifyIngress, compileCloudflareRanges } from './ingress';
import { parseIpAddress } from './ip-address';

// A subset of Cloudflare's published ranges, passed in as the host would.
const RANGES = compileCloudflareRanges([
  '173.245.48.0/20',
  '104.16.0.0/13',
  '2400:cb00::/32',
  '2606:4700::/32',
]);

const classify = (address: string | null, cfWorker: string | null = null) => {
  const { droppedRanges, ...classification } = classifyIngress({
    address,
    cloudflareRanges: RANGES,
    cfWorker,
    ownZone: 'tuturuuu.com',
  });
  expect(droppedRanges).toBe(0);
  return classification;
};

describe('IPv6 aggregation', () => {
  it.each([
    ['2001:db8::1', '2001:db8::/64', '2001:db8::/48'],
    ['::1', '::/64', '::/48'],
    ['2001:db8::', '2001:db8::/64', '2001:db8::/48'],
    ['2001:db8:a::1', '2001:db8:a::/64', '2001:db8:a::/48'],
    ['2001:0db8:000a:0000::1', '2001:db8:a::/64', '2001:db8:a::/48'],
    ['2001:db8:a:b:c:d:e:f', '2001:db8:a:b::/64', '2001:db8:a::/48'],
    ['2001:DB8:A:B::', '2001:db8:a:b::/64', '2001:db8:a::/48'],
    ['::2001:db8:a:b:c', '0:0:0:2001::/64', '::/48'],
    ['1:2:3:4:5:6:1.2.3.4', '1:2:3:4::/64', '1:2:3::/48'],
    ['::1.2.3.4', '::/64', '::/48'],
  ])(
    '%s aggregates to the /64 of its expanded address',
    (address, key, ipp) => {
      expect(classify(address)).toEqual({
        class: 'public',
        limitKey: key,
        ipp,
      });
    }
  );

  it.each(['::ffff:192.0.2.7', '::FFFF:c000:0207', '0:0:0:0:0:ffff:192.0.2.7'])(
    '%s is treated as its IPv4 address',
    (address) => {
      expect(classify(address)).toEqual({
        class: 'public',
        limitKey: '192.0.2.0/24',
        ipp: '192.0.2.0/24',
      });
    }
  );

  it.each([
    ['a zone id', 'fe80::1%eth0'],
    ['a second ::', '2001::db8::1'],
    ['a group over ffff', '2001:db8::10000'],
    ['an empty value', ''],
    ['nine groups', '1:2:3:4:5:6:7:8:9'],
    ['seven groups without ::', '1:2:3:4:5:6:7'],
    ['a :: that fills nothing', '1:2:3:4::5:6:7:8'],
    ['a leading single colon', ':1::'],
    ['brackets', '[::1]'],
    ['an IPv4 tail before ::', '1.2.3.4::'],
    ['a leading-zero octet', '192.0.02.7'],
    ['an octet over 255', '192.0.2.256'],
    ['three octets', '192.0.2'],
    ['a port', '192.0.2.7:443'],
    ['null', null],
  ])('lands %s in the unknown bucket with no ipp', (_, address) => {
    expect(classify(address)).toEqual({
      class: 'unknown',
      limitKey: 'unknown',
      ipp: null,
    });
  });

  it('expands every position of ::', () => {
    expect(parseIpAddress('::')).toEqual({
      family: 6,
      groups: [0, 0, 0, 0, 0, 0, 0, 0],
    });
    expect(parseIpAddress('1::')).toEqual({
      family: 6,
      groups: [1, 0, 0, 0, 0, 0, 0, 0],
    });
    expect(parseIpAddress('1:2:3::8')).toEqual({
      family: 6,
      groups: [1, 2, 3, 0, 0, 0, 0, 8],
    });
    expect(parseIpAddress('1:2:3:4:5:6:7::')).toEqual({
      family: 6,
      groups: [1, 2, 3, 4, 5, 6, 7, 0],
    });
  });
});

describe('IPv4', () => {
  it('uses the /24 as limit key and ipp', () => {
    expect(classify('198.51.100.23')).toEqual({
      class: 'public',
      limitKey: '198.51.100.0/24',
      ipp: '198.51.100.0/24',
    });
  });
});

describe('ingress class', () => {
  it('ignores CF-Worker on an address outside the Cloudflare ranges', () => {
    expect(classify('198.51.100.23', 'attacker.example')).toMatchObject({
      class: 'public',
      limitKey: '198.51.100.0/24',
    });
  });

  it('buckets a Cloudflare address by its calling zone', () => {
    expect(classify('104.16.1.2', 'Partner.Example')).toEqual({
      class: 'worker',
      limitKey: 'worker:partner.example',
      ipp: '104.16.1.0/24',
    });
    expect(classify('2606:4700:10::1', 'partner.example')).toMatchObject({
      class: 'worker',
      limitKey: 'worker:partner.example',
    });
  });

  it.each([
    null,
    '',
    'tuturuuu.com',
    'api.tuturuuu.com',
    'no-dot',
    'bad zone.com',
  ])(
    'puts a Cloudflare address with zone %s in the shared Worker bucket',
    (zone) => {
      expect(classify('173.245.48.9', zone)).toMatchObject({
        class: 'worker',
        limitKey: 'worker',
      });
    }
  );

  it('treats a mapped Cloudflare IPv4 address as Cloudflare', () => {
    expect(classify('::ffff:104.16.0.1')).toMatchObject({ class: 'worker' });
  });

  it('keeps only valid published ranges and reports the rest', () => {
    const compiled = compileCloudflareRanges([
      '10.0.0.0/8',
      '10.0.0.0/33',
      'nope',
      '::ffff:1.2.3.4/120',
    ]);
    expect(compiled.ranges).toHaveLength(2);
    expect(compiled.invalid).toEqual(['10.0.0.0/33', 'nope']);
  });

  it('never classifies an address as worker with no ranges', () => {
    expect(
      classifyIngress({
        address: '104.16.1.2',
        cloudflareRanges: compileCloudflareRanges([]),
        cfWorker: 'partner.example',
        ownZone: 'tuturuuu.com',
      })
    ).toMatchObject({ class: 'public' });
  });

  it('copies the trusted ranges by own index, ignoring an overridden some', () => {
    const ranges = [...RANGES.ranges];
    Object.setPrototypeOf(
      ranges,
      Object.assign(Object.create(Array.prototype), { some: () => false })
    );
    expect(
      classifyIngress({
        address: '104.16.1.2',
        cloudflareRanges: { ranges, invalid: [] },
        cfWorker: 'partner.example',
        ownZone: 'tuturuuu.com',
      })
    ).toMatchObject({ class: 'worker', limitKey: 'worker:partner.example' });
  });

  it('drops a malformed or inherited range and counts it', () => {
    const inherited = Object.create(RANGES.ranges[1] as object);
    const wide = { address: { family: 4, octets: [0, 0, 0, 0] }, prefix: 33 };
    expect(
      classifyIngress({
        address: '104.16.1.2',
        cloudflareRanges: {
          ranges: [inherited, wide, RANGES.ranges[0] as never],
          invalid: [],
        },
        cfWorker: 'partner.example',
        ownZone: 'tuturuuu.com',
      })
    ).toEqual({
      class: 'public',
      limitKey: '104.16.1.0/24',
      ipp: '104.16.1.0/24',
      droppedRanges: 2,
    });
  });

  it('reports no dropped ranges for well-formed compiled ranges', () => {
    expect(
      classifyIngress({
        address: null,
        cloudflareRanges: RANGES,
        ownZone: 'tuturuuu.com',
      })
    ).toMatchObject({ class: 'unknown', droppedRanges: 0 });
  });

  it('reads the address once', () => {
    let reads = 0;
    const input = {
      cloudflareRanges: RANGES,
      cfWorker: 'partner.example',
      ownZone: 'tuturuuu.com',
      get address() {
        reads += 1;
        return reads === 1 ? '198.51.100.23' : '104.16.1.2';
      },
    };
    expect(classifyIngress(input)).toMatchObject({ class: 'public' });
    expect(reads).toBe(1);
  });
});
