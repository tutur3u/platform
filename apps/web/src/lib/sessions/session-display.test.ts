import { describe, expect, it } from 'vitest';
import {
  disambiguateSessionIdentifiers,
  groupSessions,
  maskSessionIp,
  sessionIpAddress,
} from './session-display';

describe('sessionIpAddress', () => {
  it('drops the CIDR suffix that inet::text adds', () => {
    expect(sessionIpAddress('113.161.2.4/32')).toBe('113.161.2.4');
    expect(sessionIpAddress('2402:800:63b5::1f/128')).toBe('2402:800:63b5::1f');
    expect(sessionIpAddress(' 1.2.3.4 ')).toBe('1.2.3.4');
  });

  it('hides missing addresses', () => {
    for (const raw of [undefined, null, '', '   ', 'Unknown']) {
      expect(sessionIpAddress(raw)).toBeNull();
    }
  });
});

describe('maskSessionIp', () => {
  it('keeps the first two IPv4 octets or IPv6 groups', () => {
    expect(maskSessionIp('113.161.2.4/32')).toBe('113.161.x.x');
    expect(maskSessionIp('2402:800:63b5:91c2::1f/128')).toBe('2402:800:…');
    expect(maskSessionIp('::ffff:14.161.22.9')).toBe('14.161.x.x');
    expect(maskSessionIp('1:2:3:4:5:6:7:8')).toBe('1:2:…');
  });

  it('expands compressed IPv6 so host bits stay hidden', () => {
    expect(maskSessionIp('2001::beef/128')).toBe('2001:0:…');
    expect(maskSessionIp('::1/128')).toBe('0:0:…');
    expect(maskSessionIp('2001:0DB8:85a3::8a2e:370:7334')).toBe('2001:db8:…');
    expect(maskSessionIp('fe80::1%en0')).toBe('fe80:0:…');
    expect(maskSessionIp('64:ff9b::1.2.3.4')).toBe('64:ff9b:…');
  });

  it('hides values that are not addresses instead of showing them raw', () => {
    for (const raw of [
      null,
      'Unknown',
      'not-an-address',
      '2402:zz::1',
      ':::',
      '1::2::3',
      '1:2:3:4:5:6:7:8:9',
      '1:2:3',
      '::1.2.3',
    ]) {
      expect(maskSessionIp(raw)).toBeNull();
    }
  });

  it('never shows a prefix length', () => {
    for (const raw of ['1.2.3.4/32', 'fe80::1/128', '::ffff:1.2.3.4/128']) {
      expect(maskSessionIp(raw)).not.toContain('/');
    }
  });
});

describe('groupSessions', () => {
  const now = new Date('2026-11-22T12:00:00Z');
  const daysAgo = (days: number) =>
    new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
  const session = (id: string, updated: string, current = false) => ({
    current,
    id,
    updated,
  });
  const group = (sessions: ReturnType<typeof session>[]) =>
    groupSessions(sessions, {
      isCurrent: (item) => item.current,
      lastActive: (item) => new Date(item.updated),
      now,
    });

  it('puts this device first, then recent and older sessions newest first', () => {
    const groups = group([
      session('old', daysAgo(30)),
      session('a', daysAgo(1)),
      session('this', daysAgo(0), true),
      session('b', daysAgo(0.1)),
      session('edge', daysAgo(7)),
      session('later', daysAgo(8)),
    ]);

    expect(groups.current?.id).toBe('this');
    expect(groups.recent.map((item) => item.id)).toEqual(['b', 'a', 'edge']);
    expect(groups.older.map((item) => item.id)).toEqual(['later', 'old']);
  });

  it('keeps only the first current session as this device', () => {
    const groups = group([
      session('one', daysAgo(0), true),
      session('two', daysAgo(0.5), true),
    ]);

    expect(groups.current?.id).toBe('one');
    expect(groups.recent.map((item) => item.id)).toEqual(['two']);
  });

  it('sorts sessions without a valid time last, among the older ones', () => {
    const groups = group([
      session('invalid', 'not-a-date'),
      session('old', daysAgo(20)),
    ]);

    expect(groups.current).toBeNull();
    expect(groups.recent).toEqual([]);
    expect(groups.older.map((item) => item.id)).toEqual(['old', 'invalid']);
  });
});

describe('disambiguateSessionIdentifiers', () => {
  it('adds context for duplicate labels and ordinals for matching context', () => {
    const result = disambiguateSessionIdentifiers([
      { id: 'unique', label: 'Safari on iOS', context: '171.250.x.x, 1d ago' },
      {
        id: 'chrome-1',
        label: 'Chrome on macOS',
        context: '14.161.x.x, 2h ago',
      },
      {
        id: 'chrome-2',
        label: 'Chrome on macOS',
        context: '14.161.x.x, 2h ago',
      },
      {
        id: 'chrome-3',
        label: 'Chrome on macOS',
        context: '2402:800:…, 5h ago',
      },
      { id: 'app-1', label: 'Tuturuuu app', context: null },
      { id: 'app-2', label: 'Tuturuuu app', context: null },
    ]);

    expect(result.get('unique')).toEqual({
      duplicated: false,
      context: null,
      ordinal: null,
    });
    expect(result.get('chrome-1')).toEqual({
      duplicated: true,
      context: '14.161.x.x, 2h ago',
      ordinal: 1,
    });
    expect(result.get('chrome-2')).toEqual({
      duplicated: true,
      context: '14.161.x.x, 2h ago',
      ordinal: 2,
    });
    expect(result.get('chrome-3')).toEqual({
      duplicated: true,
      context: '2402:800:…, 5h ago',
      ordinal: null,
    });
    expect(result.get('app-1')).toEqual({
      duplicated: true,
      context: null,
      ordinal: 1,
    });
    expect(result.get('app-2')).toEqual({
      duplicated: true,
      context: null,
      ordinal: 2,
    });
  });
});
