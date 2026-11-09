export type SessionDeviceKind = 'desktop' | 'phone' | 'tablet';

export interface SessionUserAgentDescription {
  browser: string;
  device: SessionDeviceKind;
  label: string;
  os: string;
}

const UNKNOWN_BROWSER = 'Unknown Browser';
const UNKNOWN_OS = 'Unknown OS';
const UNKNOWN_DEVICE_LABEL = 'Unknown Device';

const LOST_STORED_USER_AGENTS = new Set(['', 'Unknown', 'node']);

function browserName(userAgent: string) {
  if (/Edg(?:e|A|iOS)?\//u.test(userAgent)) {
    return 'Edge';
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
    return {
      browser: UNKNOWN_BROWSER,
      device: 'desktop',
      label: UNKNOWN_DEVICE_LABEL,
      os: UNKNOWN_OS,
    };
  }

  const browser = browserName(value);
  const os = osName(value);
  const recognized = browser !== UNKNOWN_BROWSER || os !== UNKNOWN_OS;

  return {
    browser,
    device: deviceKind(value),
    label: recognized ? `${browser} on ${os}` : UNKNOWN_DEVICE_LABEL,
    os,
  };
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
