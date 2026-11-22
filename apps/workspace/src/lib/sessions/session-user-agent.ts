export type SessionDeviceKind = 'desktop' | 'phone' | 'tablet';

/**
 * What signed in: a browser, the Tuturuuu app (its HTTP client reports only
 * `Dart/x (dart:io)`), a desktop app built on a browser engine ("T3 Code"), a
 * command-line or library client ("curl"), or nothing recognisable.
 */
export type SessionClientKind =
  | 'browser'
  | 'tuturuuu-app'
  | 'desktop-app'
  | 'tool'
  | 'unknown';

export interface SessionUserAgentDescription {
  browser: string;
  device: SessionDeviceKind;
  kind: SessionClientKind;
  /** English label such as "Chrome on macOS"; localized UI composes its own. */
  label: string;
  /**
   * A fixed browser, app or tool name, never text copied from the user agent.
   * Null for the Tuturuuu app, unnamed desktop apps and unknown clients.
   */
  name: string | null;
  os: string;
  /** The operating system, or null when the agent does not report one. */
  platform: string | null;
}

const UNKNOWN_BROWSER = 'Unknown Browser';
const UNKNOWN_OS = 'Unknown OS';
const UNKNOWN_DEVICE_LABEL = 'Unknown Device';
const TUTURUUU_APP = 'Tuturuuu app';
const DESKTOP_APP = 'Desktop app';

const LOST_STORED_USER_AGENTS = new Set(['', 'Unknown', 'node']);

function browserName(userAgent: string) {
  if (/Edg(?:e|A|iOS)?\//u.test(userAgent)) {
    return 'Edge';
  }
  if (/OPR\/|Opera/u.test(userAgent)) {
    return 'Opera';
  }
  if (/SamsungBrowser\//u.test(userAgent)) {
    return 'Samsung Internet';
  }
  if (/FxiOS\//u.test(userAgent) || /Firefox\//u.test(userAgent)) {
    return 'Firefox';
  }
  if (/CriOS\//u.test(userAgent) || /Chrome\//u.test(userAgent)) {
    return 'Chrome';
  }
  if (/Safari\//u.test(userAgent)) {
    return 'Safari';
  }
  return UNKNOWN_BROWSER;
}

function osName(userAgent: string) {
  if (/iPad/u.test(userAgent)) {
    return 'iPadOS';
  }
  if (/iPhone|iPod/u.test(userAgent)) {
    return 'iOS';
  }
  if (/Android/u.test(userAgent)) {
    return 'Android';
  }
  if (/CrOS/u.test(userAgent)) {
    return 'ChromeOS';
  }
  if (/Windows/u.test(userAgent)) {
    return 'Windows';
  }
  if (/Mac OS X|Macintosh/u.test(userAgent)) {
    return 'macOS';
  }
  if (/Linux/u.test(userAgent)) {
    return 'Linux';
  }
  return UNKNOWN_OS;
}

function deviceKind(userAgent: string): SessionDeviceKind {
  if (/iPad|\bTablet\b/iu.test(userAgent)) {
    return 'tablet';
  }
  if (/Mobile|iPhone|iPod|Android/iu.test(userAgent)) {
    return 'phone';
  }
  return 'desktop';
}

function toolName(userAgent: string) {
  const lower = userAgent.toLowerCase();
  if (lower.startsWith('ttr/') || lower.startsWith('tuturuuu-cli/')) {
    return 'Tuturuuu CLI';
  }
  if (lower.startsWith('curl/')) return 'curl';
  if (lower.startsWith('python-')) return 'Python';
  if (lower.startsWith('go-http-client/')) return 'Go';
  if (lower.startsWith('node-fetch/') || lower.startsWith('undici')) {
    return 'Node.js';
  }
  if (lower.startsWith('okhttp/')) return 'OkHttp';
  return null;
}

function englishName(kind: SessionClientKind, name: string | null) {
  if (kind === 'tuturuuu-app') return TUTURUUU_APP;
  if (kind === 'desktop-app') return name ?? DESKTOP_APP;
  return name;
}

function englishLabel(name: string | null, os: string) {
  const platform = os === UNKNOWN_OS ? null : os;
  if (name === null) {
    return platform ? `${UNKNOWN_DEVICE_LABEL} on ${platform}` : null;
  }
  return platform ? `${name} on ${platform}` : name;
}

function described(
  kind: SessionClientKind,
  name: string | null,
  os: string,
  device: SessionDeviceKind
): SessionUserAgentDescription {
  return {
    browser: kind === 'browser' && name ? name : UNKNOWN_BROWSER,
    device,
    kind,
    label: englishLabel(englishName(kind, name), os) ?? UNKNOWN_DEVICE_LABEL,
    name,
    os,
    platform: os === UNKNOWN_OS ? null : os,
  };
}

export function describeSessionUserAgent(
  userAgent: string | null | undefined
): SessionUserAgentDescription {
  const value = userAgent?.trim() ?? '';
  if (
    value.length === 0 ||
    value === 'Unknown' ||
    value === 'node' ||
    value === UNKNOWN_DEVICE_LABEL
  ) {
    return described('unknown', null, UNKNOWN_OS, 'desktop');
  }

  const os = osName(value);
  const device = deviceKind(value);

  if (value.startsWith('Dart/') || value.includes('(dart:io)')) {
    return described('tuturuuu-app', null, UNKNOWN_OS, 'phone');
  }
  if (/^Tuturuuu(?:-mobile)?\//iu.test(value)) {
    return described('tuturuuu-app', null, os, device);
  }
  if (/\bT3Code(?:Nightly|Beta|Dev)?\//iu.test(value)) {
    return described('desktop-app', 'T3 Code', os, 'desktop');
  }
  if (value.includes('Electron/')) {
    // Other desktop apps stay unnamed: a product token is free text, and a
    // row must not repeat whatever a client put in its user agent.
    return described('desktop-app', null, os, 'desktop');
  }
  const tool = toolName(value);
  if (tool) {
    return described('tool', tool, os, 'desktop');
  }

  const browser = browserName(value);
  if (browser === UNKNOWN_BROWSER) {
    return described('unknown', null, os, device);
  }
  return described('browser', browser, os, device);
}

export function userAgentForSessionDisplay(input: {
  currentRequestUserAgent: string | null | undefined;
  isCurrent: boolean;
  storedUserAgent: string | null | undefined;
}) {
  const stored = input.storedUserAgent ?? 'Unknown';
  if (!input.isCurrent || !LOST_STORED_USER_AGENTS.has(stored)) {
    return stored;
  }

  const current = input.currentRequestUserAgent
    ?.replace(/[\u0000-\u001F\u007F]/g, ' ')
    .trim();
  if (!current || LOST_STORED_USER_AGENTS.has(current)) {
    return stored;
  }

  return current;
}
