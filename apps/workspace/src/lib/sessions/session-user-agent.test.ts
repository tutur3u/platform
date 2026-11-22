import { describe, expect, it } from 'vitest';
import {
  describeSessionUserAgent,
  userAgentForSessionDisplay,
} from './session-user-agent';

const agents = {
  chromeAndroid:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  chromeIos:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.6099.119 Mobile/15E148 Safari/604.1',
  chromeWindows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  edgeIos:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) EdgiOS/120.0.2210.150 Version/17.0 Mobile/15E148 Safari/604.1',
  edgeWindows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
  firefoxIos:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/121.0 Mobile/15E148 Safari/605.1.15',
  firefoxLinux:
    'Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0',
  firefoxMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0',
  safariIpad:
    'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  safariIphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
} as const;

describe('describeSessionUserAgent', () => {
  it('identifies the browsers and systems that the old checks swapped', () => {
    expect(describeSessionUserAgent(agents.safariIphone)).toMatchObject({
      browser: 'Safari',
      device: 'phone',
      label: 'Safari on iOS',
      os: 'iOS',
    });
    expect(describeSessionUserAgent(agents.safariIpad)).toMatchObject({
      browser: 'Safari',
      device: 'tablet',
      label: 'Safari on iPadOS',
      os: 'iPadOS',
    });
    expect(describeSessionUserAgent(agents.chromeAndroid)).toMatchObject({
      browser: 'Chrome',
      device: 'phone',
      label: 'Chrome on Android',
      os: 'Android',
    });
    expect(describeSessionUserAgent(agents.chromeWindows)).toMatchObject({
      browser: 'Chrome',
      device: 'desktop',
      label: 'Chrome on Windows',
      os: 'Windows',
    });
    expect(describeSessionUserAgent(agents.edgeWindows)).toMatchObject({
      browser: 'Edge',
      device: 'desktop',
      label: 'Edge on Windows',
      os: 'Windows',
    });
    expect(describeSessionUserAgent(agents.firefoxMac)).toMatchObject({
      browser: 'Firefox',
      device: 'desktop',
      label: 'Firefox on macOS',
      os: 'macOS',
    });
    expect(describeSessionUserAgent(agents.firefoxLinux)).toMatchObject({
      browser: 'Firefox',
      device: 'desktop',
      label: 'Firefox on Linux',
      os: 'Linux',
    });
    expect(describeSessionUserAgent(agents.chromeIos).browser).toBe('Chrome');
    expect(describeSessionUserAgent(agents.firefoxIos).browser).toBe('Firefox');
    expect(describeSessionUserAgent(agents.edgeIos)).toMatchObject({
      browser: 'Edge',
      device: 'phone',
      os: 'iOS',
    });
    expect(describeSessionUserAgent('Chrome/120.0').label).toBe('Chrome');
  });

  it('names app and tool clients instead of the engine they embed', () => {
    expect(describeSessionUserAgent('Dart/3.14 (dart:io)')).toMatchObject({
      device: 'phone',
      kind: 'tuturuuu-app',
      label: 'Tuturuuu app',
      name: null,
      platform: null,
    });
    expect(
      describeSessionUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) T3CodeNightly/0.1.12 Chrome/158.0.0.0 Electron/41.0.0 Safari/537.36'
      )
    ).toMatchObject({
      device: 'desktop',
      kind: 'desktop-app',
      label: 'T3 Code on macOS',
      name: 'T3 Code',
    });
    // A product token is free text, so other desktop apps stay unnamed.
    const unnamed = describeSessionUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Workstation-QA-0142/4.41.0 Chrome/130.0.0.0 Electron/33.0.0 Safari/537.36'
    );
    expect(unnamed).toMatchObject({
      kind: 'desktop-app',
      label: 'Desktop app on Windows',
      name: null,
    });
    expect(JSON.stringify(unnamed)).not.toContain('Workstation');
    expect(describeSessionUserAgent('curl/8.7.1')).toMatchObject({
      kind: 'tool',
      label: 'curl',
    });
    expect(describeSessionUserAgent('ttr/2.4.0 (darwin)').label).toBe(
      'Tuturuuu CLI'
    );
  });

  it('recognises Opera, Samsung Internet and ChromeOS', () => {
    expect(
      describeSessionUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 OPR/106.0.0.0'
      ).label
    ).toBe('Opera on Windows');
    expect(
      describeSessionUserAgent(
        'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36'
      )
    ).toMatchObject({ device: 'phone', label: 'Samsung Internet on Android' });
    expect(
      describeSessionUserAgent(
        'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      ).label
    ).toBe('Chrome on ChromeOS');
  });

  it('does not invent a browser for missing or non-browser agents', () => {
    for (const userAgent of [
      undefined,
      null,
      '',
      'Unknown',
      'node',
      'Unknown Device',
    ]) {
      expect(describeSessionUserAgent(userAgent)).toMatchObject({
        device: 'desktop',
        kind: 'unknown',
        label: 'Unknown Device',
        platform: null,
      });
    }
    expect(describeSessionUserAgent('SomeBot (Macintosh)')).toMatchObject({
      kind: 'unknown',
      label: 'Unknown Device on macOS',
    });
  });
});

describe('userAgentForSessionDisplay', () => {
  it('replaces a lost user-agent only on the current session', () => {
    expect(
      userAgentForSessionDisplay({
        currentRequestUserAgent: agents.chromeWindows,
        isCurrent: false,
        storedUserAgent: 'node',
      })
    ).toBe('node');

    expect(
      userAgentForSessionDisplay({
        currentRequestUserAgent: agents.chromeWindows,
        isCurrent: true,
        storedUserAgent: 'node',
      })
    ).toBe(agents.chromeWindows);

    expect(
      userAgentForSessionDisplay({
        currentRequestUserAgent: agents.chromeWindows,
        isCurrent: true,
        storedUserAgent: 'Unknown',
      })
    ).toBe(agents.chromeWindows);

    expect(
      userAgentForSessionDisplay({
        currentRequestUserAgent: agents.edgeWindows,
        isCurrent: true,
        storedUserAgent: agents.firefoxMac,
      })
    ).toBe(agents.firefoxMac);

    expect(
      userAgentForSessionDisplay({
        currentRequestUserAgent: 'node',
        isCurrent: true,
        storedUserAgent: 'node',
      })
    ).toBe('node');

    expect(
      userAgentForSessionDisplay({
        currentRequestUserAgent: agents.chromeWindows,
        isCurrent: true,
        storedUserAgent: 'Dart/3.9 (dart:io)',
      })
    ).toBe('Dart/3.9 (dart:io)');
  });
});
