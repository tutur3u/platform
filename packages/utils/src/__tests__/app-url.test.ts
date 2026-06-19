import { describe, expect, it } from 'vitest';
import { resolveAppUrl, resolveInternalAppUrl } from '../app-url';
import {
  getAppDomainByUrl,
  getLocalInternalAppUrl,
  getPortlessInternalAppUrl,
} from '../internal-domains';
import {
  getTuturuuuPortlessAppOrigin,
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

  it('recognizes worktree-prefixed Portless origins as registered app URLs', () => {
    expect(
      resolveInternalAppUrl({
        appName: 'chat',
        candidates: ['https://zalo-qr-chat-setup.chat.tuturuuu.localhost'],
        fallback: 'http://localhost:7821',
      })
    ).toBe('https://zalo-qr-chat-setup.chat.tuturuuu.localhost');
    expect(
      resolveInternalAppUrl({
        appName: 'platform',
        candidates: [
          'https://zalo-qr-chat-setup.chat.tuturuuu.localhost',
          'https://zalo-qr-chat-setup.tuturuuu.localhost',
        ],
        fallback: 'http://localhost:7803',
      })
    ).toBe('https://zalo-qr-chat-setup.tuturuuu.localhost');
    expect(
      getAppDomainByUrl(
        'https://zalo-qr-chat-setup.chat.tuturuuu.localhost/verify-token'
      )?.name
    ).toBe('chat');
  });

  it('recognizes local Portless proxy ports for registered app URLs', () => {
    expect(
      getAppDomainByUrl(
        'https://tuturuuu.localhost:1355/verify-token?nextUrl=%2Fen%2Fpersonal%2Ftasks'
      )
    ).toMatchObject({
      canonicalUrl:
        'https://tuturuuu.localhost/verify-token?nextUrl=%2Fen%2Fpersonal%2Ftasks',
      kind: 'internal',
      name: 'platform',
    });
    expect(
      getAppDomainByUrl(
        'https://tasks.tuturuuu.localhost:1355/verify-token?nextUrl=%2Fpersonal'
      )
    ).toMatchObject({
      canonicalUrl:
        'https://tasks.tuturuuu.localhost/verify-token?nextUrl=%2Fpersonal',
      kind: 'internal',
      name: 'tasks',
    });
    expect(
      getAppDomainByUrl(
        'https://zalo-qr-chat-setup.tasks.tuturuuu.localhost:1355/verify-token?nextUrl=%2Fpersonal'
      )
    ).toMatchObject({
      canonicalUrl:
        'https://zalo-qr-chat-setup.tasks.tuturuuu.localhost/verify-token?nextUrl=%2Fpersonal',
      kind: 'internal',
      name: 'tasks',
    });
    expect(
      getAppDomainByUrl(
        'https://tuturuuu.localhost.evil.test:1355/verify-token?nextUrl=%2F'
      )
    ).toBeNull();
    expect(
      getAppDomainByUrl(
        'https://tasks.tuturuuu.localhost:4444/verify-token?nextUrl=%2Fpersonal'
      )
    ).toBeNull();
    expect(
      getAppDomainByUrl(
        'https://attacker.tasks.tuturuuu.localhost:4444/verify-token?nextUrl=%2Fpersonal'
      )
    ).toBeNull();
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

  it('uses the current Portless worktree prefix for local peer app defaults', () => {
    const originalPortlessUrl = process.env.PORTLESS_URL;

    try {
      process.env.PORTLESS_URL =
        'https://zalo-qr-chat-setup.chat.tuturuuu.localhost';

      expect(getTuturuuuPortlessAppOrigin('platform')).toBe(
        'https://zalo-qr-chat-setup.tuturuuu.localhost'
      );
      expect(getPortlessInternalAppUrl('chat')).toBe(
        'https://zalo-qr-chat-setup.chat.tuturuuu.localhost'
      );
      expect(getLocalInternalAppUrl('tasks', 'http://localhost:7809')).toBe(
        'https://zalo-qr-chat-setup.tasks.tuturuuu.localhost'
      );
    } finally {
      if (originalPortlessUrl === undefined) {
        delete process.env.PORTLESS_URL;
      } else {
        process.env.PORTLESS_URL = originalPortlessUrl;
      }
    }
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
      'https://infra.tuturuuu.localhost',
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
      'https://storefront.tuturuuu.localhost',
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
