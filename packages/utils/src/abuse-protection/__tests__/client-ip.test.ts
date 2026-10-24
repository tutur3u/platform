import { describe, expect, it, vi } from 'vitest';
import {
  type ClientIpConfig,
  isValidIpAddress,
  normalizeClientIp,
  pickForwardedClientIp,
  resolveClientIp,
  resolveTrustedProxyConfig,
  UNKNOWN_CLIENT_IP,
} from '../client-ip';

const spoofedHeaders = () =>
  new Headers({
    'cf-connecting-ip': '198.51.100.1',
    'true-client-ip': '198.51.100.2',
    'x-forwarded-for': '198.51.100.3',
    'x-real-ip': '198.51.100.4',
    'x-vercel-forwarded-for': '198.51.100.5',
  });

const config = (
  mode: ClientIpConfig['mode'],
  trustedHops = 1
): ClientIpConfig => ({ mode, trustedHops });

describe('resolveTrustedProxyConfig', () => {
  it('defaults to trusting no proxy headers off-platform', () => {
    expect(
      resolveTrustedProxyConfig({ env: {}, runtimeUserAgent: null })
    ).toEqual({ mode: 'none', trustedHops: 1 });
  });

  it('defaults to Vercel when Vercel platform env markers are present', () => {
    expect(
      resolveTrustedProxyConfig({
        env: { VERCEL: '1' },
        runtimeUserAgent: null,
      }).mode
    ).toBe('vercel');
    expect(
      resolveTrustedProxyConfig({
        env: { VERCEL_ENV: 'production' },
        runtimeUserAgent: null,
      }).mode
    ).toBe('vercel');
  });

  it('defaults to Cloudflare inside a Worker runtime', () => {
    expect(
      resolveTrustedProxyConfig({
        env: {},
        runtimeUserAgent: 'Cloudflare-Workers',
      }).mode
    ).toBe('cloudflare');
  });

  it('honours an explicit mode over platform detection', () => {
    expect(
      resolveTrustedProxyConfig({
        env: { TRUSTED_PROXY: 'Cloudflare', VERCEL: '1' },
        runtimeUserAgent: null,
      })
    ).toEqual({ mode: 'cloudflare', trustedHops: 1 });
    expect(
      resolveTrustedProxyConfig({
        env: { TRUSTED_PROXY: 'none', VERCEL: '1' },
        runtimeUserAgent: 'Cloudflare-Workers',
      }).mode
    ).toBe('none');
  });

  it('fails closed on an unsupported mode', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(
      resolveTrustedProxyConfig({
        env: { TRUSTED_PROXY: 'everything', VERCEL: '1' },
        runtimeUserAgent: null,
      }).mode
    ).toBe('none');
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('parses and bounds the trusted hop count', () => {
    const hops = (value: string) =>
      resolveTrustedProxyConfig({
        env: { TRUSTED_PROXY: 'forwarded', TRUSTED_PROXY_HOPS: value },
        runtimeUserAgent: null,
      }).trustedHops;
    expect(hops('2')).toBe(2);
    expect(hops('0')).toBe(1);
    expect(hops('-3')).toBe(1);
    expect(hops('nope')).toBe(1);
    expect(hops('500')).toBe(10);
  });
});

describe('resolveClientIp', () => {
  it('ignores every spoofed header when no proxy is trusted', () => {
    expect(resolveClientIp(spoofedHeaders(), config('none'))).toBe(
      UNKNOWN_CLIENT_IP
    );
  });

  it('reads only cf-connecting-ip in Cloudflare mode', () => {
    expect(resolveClientIp(spoofedHeaders(), config('cloudflare'))).toBe(
      '198.51.100.1'
    );
    const headers = spoofedHeaders();
    headers.delete('cf-connecting-ip');
    expect(resolveClientIp(headers, config('cloudflare'))).toBe(
      UNKNOWN_CLIENT_IP
    );
  });

  it('prefers the Vercel-set headers in Vercel mode', () => {
    expect(resolveClientIp(spoofedHeaders(), config('vercel'))).toBe(
      '198.51.100.5'
    );
    expect(
      resolveClientIp(
        new Headers({
          'cf-connecting-ip': '198.51.100.1',
          'x-real-ip': '203.0.113.9',
        }),
        config('vercel')
      )
    ).toBe('203.0.113.9');
    expect(
      resolveClientIp(
        new Headers({ 'cf-connecting-ip': '198.51.100.1' }),
        config('vercel')
      )
    ).toBe(UNKNOWN_CLIENT_IP);
  });

  it('uses the right-most untrusted hop of a multi-hop x-forwarded-for', () => {
    const headers = new Headers({
      'x-forwarded-for': '6.6.6.6, 203.0.113.7, 10.0.0.2, 10.0.0.1',
    });
    expect(resolveClientIp(headers, config('forwarded', 1))).toBe('10.0.0.1');
    expect(resolveClientIp(headers, config('forwarded', 3))).toBe(
      '203.0.113.7'
    );
    // Fewer entries than trusted hops means the chain bypassed a proxy.
    expect(resolveClientIp(headers, config('forwarded', 5))).toBe(
      UNKNOWN_CLIENT_IP
    );
  });

  it('never falls back to a client-supplied left-most entry', () => {
    const headers = new Headers({
      'x-forwarded-for': '203.0.113.7, not-an-ip',
    });
    expect(resolveClientIp(headers, config('forwarded'))).toBe(
      UNKNOWN_CLIENT_IP
    );
  });

  it('uses x-real-ip from a single trusted forwarder without XFF', () => {
    const headers = new Headers({ 'x-real-ip': '203.0.113.8' });
    expect(resolveClientIp(headers, config('forwarded', 1))).toBe(
      '203.0.113.8'
    );
    expect(resolveClientIp(headers, config('forwarded', 2))).toBe(
      UNKNOWN_CLIENT_IP
    );
  });

  it('returns the conservative bucket when no IP is present', () => {
    for (const mode of ['cloudflare', 'vercel', 'forwarded', 'none'] as const) {
      expect(resolveClientIp(new Headers(), config(mode))).toBe(
        UNKNOWN_CLIENT_IP
      );
    }
  });

  it('handles IPv6 addresses from a trusted proxy', () => {
    expect(
      resolveClientIp(
        new Headers({ 'cf-connecting-ip': '2001:DB8::1' }),
        config('cloudflare')
      )
    ).toBe('2001:db8::1');
    expect(
      resolveClientIp(
        new Headers({ 'x-forwarded-for': '2001:db8::2, [2001:db8::3]:443' }),
        config('forwarded')
      )
    ).toBe('2001:db8::3');
  });

  it('accepts Map, getter, and plain record header sources', () => {
    const cf = config('cloudflare');
    expect(
      resolveClientIp(new Map([['cf-connecting-ip', '192.0.2.1']]), cf)
    ).toBe('192.0.2.1');
    expect(
      resolveClientIp(
        {
          get: (name: string) =>
            name === 'cf-connecting-ip' ? '192.0.2.2' : null,
        },
        cf
      )
    ).toBe('192.0.2.2');
    expect(resolveClientIp({ 'CF-Connecting-IP': '192.0.2.3' }, cf)).toBe(
      '192.0.2.3'
    );
  });
});

describe('address parsing', () => {
  it('validates IPv4 and IPv6 literals', () => {
    for (const ip of [
      '0.0.0.0',
      '255.255.255.255',
      '::',
      '::1',
      'fe80::1',
      '2001:db8:0:0:0:0:0:1',
      '::ffff:192.0.2.1',
      '64:ff9b::192.0.2.1',
    ]) {
      expect(isValidIpAddress(ip)).toBe(true);
    }
    for (const ip of [
      '',
      '256.0.0.1',
      '1.2.3',
      '01.2.3.4.5',
      '1::2::3',
      '1:2:3:4:5:6:7:8:9',
      '12345::1',
      'unknown',
      '::ffff:999.0.0.1',
    ]) {
      expect(isValidIpAddress(ip)).toBe(false);
    }
  });

  it('normalises ports, brackets, zones, and case', () => {
    expect(normalizeClientIp(' 192.0.2.1:8080 ')).toBe('192.0.2.1');
    expect(normalizeClientIp('[2001:DB8::1]:443')).toBe('2001:db8::1');
    expect(normalizeClientIp('fe80::1%eth0')).toBe('fe80::1');
    expect(normalizeClientIp('not-an-ip')).toBeNull();
  });

  it('picks forwarded entries by trusted hop count', () => {
    expect(pickForwardedClientIp('192.0.2.1', 1)).toBe('192.0.2.1');
    expect(pickForwardedClientIp(' , 192.0.2.1 , ', 1)).toBe('192.0.2.1');
    expect(pickForwardedClientIp(null, 1)).toBeNull();
  });
});
