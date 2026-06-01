import { describe, expect, it } from 'vitest';
import { resolveAppUrl, resolveInternalAppUrl } from '../app-url';
import {
  getLocalInternalAppUrl,
  getPortlessInternalAppUrl,
} from '../internal-domains';
import {
  TUTURUUU_PORTLESS_ALLOWED_DEV_ORIGINS,
  TUTURUUU_PORTLESS_APP_ORIGINS,
} from '../portless';

describe('resolveAppUrl', () => {
  it('uses the first valid configured URL', () => {
    expect(
      resolveAppUrl({
        candidates: ['development', 'https://learn.tuturuuu.com/'],
        fallback: 'http://localhost:7812',
      })
    ).toBe('https://learn.tuturuuu.com');
  });

  it('falls back when configured values are not absolute HTTP URLs', () => {
    expect(
      resolveAppUrl({
        candidates: ['development', '', 'ftp://learn.tuturuuu.com'],
        fallback: 'http://localhost:7812',
      })
    ).toBe('http://localhost:7812');
  });

  it('ignores wildcard listener URLs that are not browser destinations', () => {
    expect(
      resolveAppUrl({
        candidates: ['http://0.0.0.0:7814', 'http://[::]:7814'],
        fallback: 'https://hive.tuturuuu.com',
      })
    ).toBe('https://hive.tuturuuu.com');
  });
});

describe('resolveInternalAppUrl', () => {
  it('skips configured URLs that belong to another registered internal app', () => {
    expect(
      resolveInternalAppUrl({
        appName: 'learn',
        candidates: ['https://tuturuuu.com', 'https://learn.tuturuuu.com'],
        fallback: 'http://localhost:7812',
      })
    ).toBe('https://learn.tuturuuu.com');
  });

  it('recognizes Portless local origins as registered internal app URLs', () => {
    expect(
      resolveInternalAppUrl({
        appName: 'learn',
        candidates: [
          'https://tuturuuu.localhost',
          'https://learn.tuturuuu.localhost',
        ],
        fallback: 'http://localhost:7812',
      })
    ).toBe('https://learn.tuturuuu.localhost');
  });

  it('canonicalizes production internal app URLs to their registered HTTPS origins', () => {
    expect(
      resolveInternalAppUrl({
        appName: 'platform',
        candidates: ['http://tuturuuu.com/'],
        fallback: 'http://localhost:7803',
      })
    ).toBe('https://tuturuuu.com');
    expect(
      resolveInternalAppUrl({
        appName: 'meet',
        candidates: ['http://meet.tuturuuu.com/'],
        fallback: 'http://localhost:7807',
      })
    ).toBe('https://meet.tuturuuu.com');
  });

  it('falls back when every configured URL points at another internal app', () => {
    expect(
      resolveInternalAppUrl({
        appName: 'nova',
        candidates: ['https://tuturuuu.com', 'https://learn.tuturuuu.com'],
        fallback: 'https://nova.ai.vn',
      })
    ).toBe('https://nova.ai.vn');
  });

  it('keeps custom app origins that are not registered to another app', () => {
    expect(
      resolveInternalAppUrl({
        appName: 'cms',
        candidates: ['https://cms-preview.example.com/'],
        fallback: 'https://cms.tuturuuu.com',
      })
    ).toBe('https://cms-preview.example.com');
  });

  it('skips wildcard listener origins before resolving an internal app URL', () => {
    expect(
      resolveInternalAppUrl({
        appName: 'hive',
        candidates: ['http://0.0.0.0:7814', 'https://hive.tuturuuu.com'],
        fallback: 'http://localhost:7814',
      })
    ).toBe('https://hive.tuturuuu.com');
  });
});

describe('getLocalInternalAppUrl', () => {
  it('prefers the Portless Tuturuuu domain for local internal app defaults', () => {
    expect(getLocalInternalAppUrl('platform', 'http://localhost:7803')).toBe(
      'https://tuturuuu.localhost'
    );
    expect(getLocalInternalAppUrl('tasks', 'http://localhost:7809')).toBe(
      'https://tasks.tuturuuu.localhost'
    );
  });

  it.each([
    ['apps', 'https://apps.tuturuuu.localhost'],
    ['platform', 'https://tuturuuu.localhost'],
    ['cms', 'https://cms.tuturuuu.localhost'],
    ['calendar', 'https://calendar.tuturuuu.localhost'],
    ['chat', 'https://chat.tuturuuu.localhost'],
    ['drive', 'https://drive.tuturuuu.localhost'],
    ['qr', 'https://qr.tuturuuu.localhost'],
    ['nova', 'https://nova.tuturuuu.localhost'],
    ['rewise', 'https://rewise.tuturuuu.localhost'],
    ['tasks', 'https://tasks.tuturuuu.localhost'],
    ['finance', 'https://finance.tuturuuu.localhost'],
    ['inventory', 'https://inventory.tuturuuu.localhost'],
    ['track', 'https://track.tuturuuu.localhost'],
    ['learn', 'https://learn.tuturuuu.localhost'],
    ['mail', 'https://mail.tuturuuu.localhost'],
    ['meet', 'https://meet.tuturuuu.localhost'],
    ['teach', 'https://teach.tuturuuu.localhost'],
    ['hive', 'https://hive.tuturuuu.localhost'],
    ['mind', 'https://mind.tuturuuu.localhost'],
  ] as const)('returns the %s Portless URL', (appName, expectedUrl) => {
    expect(getPortlessInternalAppUrl(appName)).toBe(expectedUrl);
    expect(getLocalInternalAppUrl(appName, 'http://localhost:9999')).toBe(
      expectedUrl
    );
  });
});

describe('Portless app origin registry', () => {
  it('keeps all app origins under the Tuturuuu localhost namespace', () => {
    expect(TUTURUUU_PORTLESS_ALLOWED_DEV_ORIGINS).toEqual([
      'tuturuuu.localhost',
      '*.tuturuuu.localhost',
    ]);
    expect(Object.values(TUTURUUU_PORTLESS_APP_ORIGINS)).toEqual([
      'https://apps.tuturuuu.localhost',
      'https://calendar.tuturuuu.localhost',
      'https://chat.tuturuuu.localhost',
      'https://cms.tuturuuu.localhost',
      'https://drive.tuturuuu.localhost',
      'https://external.tuturuuu.localhost',
      'https://finance.tuturuuu.localhost',
      'https://hive.tuturuuu.localhost',
      'https://realtime.hive.tuturuuu.localhost',
      'https://inventory.tuturuuu.localhost',
      'https://learn.tuturuuu.localhost',
      'https://mail.tuturuuu.localhost',
      'https://meet.tuturuuu.localhost',
      'https://mind.tuturuuu.localhost',
      'https://nova.tuturuuu.localhost',
      'https://tuturuuu.localhost',
      'https://playground.tuturuuu.localhost',
      'https://qr.tuturuuu.localhost',
      'https://rewise.tuturuuu.localhost',
      'https://shortener.tuturuuu.localhost',
      'https://tasks.tuturuuu.localhost',
      'https://teach.tuturuuu.localhost',
      'https://track.tuturuuu.localhost',
    ]);
  });

  it('does not reuse the same Portless origin for multiple apps', () => {
    const origins = Object.values(TUTURUUU_PORTLESS_APP_ORIGINS);

    expect(new Set(origins).size).toBe(origins.length);
  });
});
