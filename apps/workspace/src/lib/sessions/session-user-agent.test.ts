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
    expect(describeSessionUserAgent('Chrome/120.0').label).toBe(
      'Chrome on Unknown OS'
    );
  });

  it('does not invent a browser for missing or non-browser agents', () => {
    for (const userAgent of [
      undefined,
      null,
      '',
      'Unknown',
      'node',
      'Dart/3.9 (dart:io)',
    ]) {
      expect(describeSessionUserAgent(userAgent)).toMatchObject({
        device: 'desktop',
        label: 'Unknown Device',
      });
    }
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
