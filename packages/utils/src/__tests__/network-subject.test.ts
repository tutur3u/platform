import { describe, expect, it } from 'vitest';
import { networkSubject } from '../network-subject';

describe('networkSubject', () => {
  it('keeps an IPv4 address as its own network', () => {
    expect(networkSubject('203.0.113.10')).toBe('203.0.113.10');
    expect(networkSubject('::ffff:203.0.113.10')).toBe('203.0.113.10');
  });

  it('groups every address of an IPv6 /64 together', () => {
    const net = '2001:db8:aa:bb::/64';
    expect(networkSubject('2001:db8:aa:bb::1')).toBe(net);
    expect(networkSubject('2001:0db8:00aa:00bb:1234:5678:9abc:def0')).toBe(net);
    expect(networkSubject('2001:DB8:AA:BB:ffff::7')).toBe(net);
    expect(networkSubject('2001:db8::1')).toBe('2001:db8:0:0::/64');
    expect(networkSubject('2001:db8:aa:bc::1')).not.toBe(net);
  });

  it('leaves a value that is not an address unchanged', () => {
    expect(networkSubject('unknown')).toBe('unknown');
    expect(networkSubject('1::2::3')).toBe('1::2::3');
  });
});
