import { createOriginClientIpProof } from '@tuturuuu/utils/abuse-protection/origin-ip-proof';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  normalizeCanonicalOrigins,
  resolveCanonicalRequestOrigin,
} from './canonical-origin';

const CENTRAL = 'https://tuturuuu.com';
const APP = 'https://rewise.tuturuuu.com';
const ORIGIN_SECRET = 'origin-secret-for-tests-0123456789abcdef';

function resolve(
  url: string,
  headers: Record<string, string> = {},
  canonicalOrigins: readonly string[] = [APP]
) {
  return resolveCanonicalRequestOrigin(
    new NextRequest(url, { headers }),
    CENTRAL,
    canonicalOrigins
  );
}

function gatewayProof() {
  const proof = createOriginClientIpProof({
    ip: '203.0.113.7',
    secret: ORIGIN_SECRET,
  });
  if (!proof) throw new Error('test proof could not be created');
  return proof;
}

describe('resolveCanonicalRequestOrigin (SR-XFH-RETURN)', () => {
  beforeEach(() => {
    vi.stubEnv('TRUSTED_PROXY', 'cloudflare-origin');
    vi.stubEnv('TRUSTED_PROXY_ORIGIN_SECRET', ORIGIN_SECRET);
    vi.stubEnv('TUTURUUU_GATEWAY_ORIGIN_HOSTS', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('hostile headers fall back to the app canonical origin', () => {
    it('ignores a client X-Forwarded-Host', () => {
      expect(
        resolve(`${APP}/personal`, { 'x-forwarded-host': 'evil.example' })
      ).toBe(APP);
    });

    it('ignores a client X-Forwarded-Host with an http X-Forwarded-Proto', () => {
      expect(
        resolve(`${APP}/personal`, {
          'x-forwarded-host': 'evil.example',
          'x-forwarded-proto': 'http',
        })
      ).toBe(APP);
    });

    it('ignores the first entry of a comma-separated forwarded host list', () => {
      expect(
        resolve(`${APP}/personal`, {
          'x-forwarded-host': `evil.example, ${new URL(APP).host}`,
        })
      ).toBe(APP);
    });

    it.each([
      'evil.example/path',
      'evil.example@rewise.tuturuuu.com',
      'rewise.tuturuuu.com@evil.example',
      'evil.example:99999',
      'evil example',
    ])('ignores a malformed forwarded host %s', (forwardedHost) => {
      expect(
        resolve(`${APP}/personal`, { 'x-forwarded-host': forwardedHost })
      ).toBe(APP);
    });

    it('ignores a hostile Host without a forwarded host', () => {
      expect(resolve('https://evil.example/personal')).toBe(APP);
    });

    it('never downgrades a canonical host through X-Forwarded-Proto alone', () => {
      expect(
        resolve(`${APP}/personal`, {
          'x-forwarded-host': new URL(APP).host,
          'x-forwarded-proto': 'http',
        })
      ).toBe(APP);
      expect(resolve(`${APP}/personal`, { 'x-forwarded-proto': 'http' })).toBe(
        APP
      );
    });

    it('rejects a forged or stale gateway proof', () => {
      expect(
        resolve(`${APP}/personal`, {
          'x-forwarded-host': 'evil.example',
          // Well-formed but expired (and wrongly signed) proof.
          'x-tuturuuu-origin-auth': `hmac-v1;1700000000;203.0.113.7;${'a'.repeat(64)}`,
        })
      ).toBe(APP);
      expect(
        resolve(`${APP}/personal`, {
          'x-forwarded-host': 'evil.example',
          'x-tuturuuu-origin-auth': 'not-the-secret',
        })
      ).toBe(APP);
    });

    it('does not trust a valid proof when the deployment is not in cloudflare-origin mode', () => {
      vi.stubEnv('TRUSTED_PROXY', 'cloudflare');
      expect(
        resolve(`${APP}/personal`, {
          'x-forwarded-host': 'evil.example',
          'x-tuturuuu-origin-auth': gatewayProof(),
        })
      ).toBe(APP);
    });

    it('uses the app origin, not the central origin, for gateway alias hosts', () => {
      expect(
        resolve('https://origin.tuturuuu.com/personal', {
          'x-forwarded-host': 'origin.tuturuuu.com',
        })
      ).toBe(APP);
      expect(resolve('https://ORIGIN.tuturuuu.com/personal')).toBe(APP);
    });
  });

  describe('trusted forwarded hosts are kept', () => {
    it('keeps a forwarded host that names the app canonical origin', () => {
      expect(
        resolve('http://0.0.0.0:7812/dashboard', {
          'x-forwarded-host': 'REWISE.tuturuuu.com',
          'x-forwarded-proto': 'https',
        })
      ).toBe(APP);
    });

    it('keeps the central origin for a gateway-mounted app', () => {
      expect(
        resolve('http://0.0.0.0:7803/calendar/personal', {
          'x-forwarded-host': 'tuturuuu.com',
          'x-forwarded-proto': 'https',
        })
      ).toBe(CENTRAL);
    });

    it('keeps a canonical request Host', () => {
      expect(resolve(`${APP}/personal`)).toBe(APP);
    });

    it('keeps a forwarded host proven by the gateway origin proof', () => {
      expect(
        resolve('https://rewise-worker.example.workers.dev/personal', {
          'x-forwarded-host': 'preview.tuturuuu.com',
          'x-tuturuuu-origin-auth': gatewayProof(),
        })
      ).toBe('https://preview.tuturuuu.com');
    });

    it('honours X-Forwarded-Proto only alongside a proven forwarded host', () => {
      expect(
        resolve('https://rewise-worker.example.workers.dev/personal', {
          'x-forwarded-host': 'preview.tuturuuu.com',
          'x-forwarded-proto': 'http',
          'x-tuturuuu-origin-auth': gatewayProof(),
        })
      ).toBe('http://preview.tuturuuu.com');
      expect(
        resolve('https://rewise-worker.example.workers.dev/personal', {
          'x-forwarded-host': 'preview.tuturuuu.com',
          'x-forwarded-proto': 'javascript',
          'x-tuturuuu-origin-auth': gatewayProof(),
        })
      ).toBe('https://preview.tuturuuu.com');
    });

    it('keeps a proven request Host', () => {
      expect(
        resolve('https://preview.tuturuuu.com/personal', {
          'x-tuturuuu-origin-auth': ORIGIN_SECRET,
        })
      ).toBe('https://preview.tuturuuu.com');
    });
  });

  describe('local development is unchanged', () => {
    it('keeps an explicit loopback port', () => {
      expect(
        resolve(
          'http://localhost:7809/workspace/tasks',
          { 'x-forwarded-host': 'localhost:7809', 'x-forwarded-proto': 'http' },
          ['http://localhost:7809']
        )
      ).toBe('http://localhost:7809');
      expect(
        resolve('http://127.0.0.1:7812/dashboard', {}, [
          'http://localhost:7812',
        ])
      ).toBe('http://127.0.0.1:7812');
    });

    it('uses the app origin for internal hosts without a loopback port', () => {
      expect(
        resolve('http://0.0.0.0:7809/workspace/tasks', {}, [
          'http://localhost:7809',
        ])
      ).toBe('http://localhost:7809');
    });
  });

  describe('fail closed on missing configuration', () => {
    it('returns null instead of reflecting a header when no origin is valid', () => {
      for (const configured of [[], [''], ['not a url'], ['ftp://x.example']]) {
        expect(
          resolve(
            'https://evil.example/personal',
            { 'x-forwarded-host': 'evil.example' },
            configured
          )
        ).toBeNull();
      }
    });

    it('still keeps a central-origin forwarded host without app origins', () => {
      expect(
        resolve(
          'http://0.0.0.0:7803/calendar/personal',
          { 'x-forwarded-host': 'tuturuuu.com' },
          []
        )
      ).toBe(CENTRAL);
    });
  });
});

describe('normalizeCanonicalOrigins', () => {
  it('keeps valid http(s) origins in order without duplicates', () => {
    expect(
      normalizeCanonicalOrigins([
        'https://rewise.tuturuuu.com/some/path',
        'nope',
        'https://rewise.tuturuuu.com',
        'http://localhost:7809',
        'javascript:alert(1)',
      ])
    ).toEqual(['https://rewise.tuturuuu.com', 'http://localhost:7809']);
  });
});
