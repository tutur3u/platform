// Platform selection for the public download page. Pure and framework-free so
// the server (user agent) and client (refinement) agree on the same rules.

export const DOWNLOAD_PLATFORMS = [
  'ios',
  'android',
  'macos',
  'windows',
  'linux',
  'web',
] as const;

export type DownloadPlatform = (typeof DOWNLOAD_PLATFORMS)[number];

export type MobileStoreListing = {
  url: string;
  version: string | null;
  kind: 'store' | 'beta';
};

// Stable listing derived from the package id, used when no policy is set.
export const ANDROID_STORE_FALLBACK_URL =
  'https://play.google.com/store/apps/details?id=com.tuturuuu.app.mobile';

export function detectPlatform(userAgent: string | null | undefined) {
  const ua = userAgent ?? '';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  if (/CrOS/i.test(ua)) return 'web';
  if (/Windows NT/i.test(ua)) return 'windows';
  if (/Macintosh|Mac OS X/i.test(ua)) return 'macos';
  if (/Linux|X11/i.test(ua)) return 'linux';
  return 'web';
}

export type ClientPlatformHints = {
  maxTouchPoints?: number;
  uaPlatform?: string;
};

// iPadOS reports a desktop Mac user agent; touch support gives it away.
// Client hints can identify an OS the server could not.
export function refinePlatform(
  detected: DownloadPlatform,
  hints: ClientPlatformHints
): DownloadPlatform {
  if (detected === 'macos' && (hints.maxTouchPoints ?? 0) > 1) return 'ios';
  if (detected !== 'web') return detected;
  switch (hints.uaPlatform?.toLowerCase()) {
    case 'android':
      return 'android';
    case 'macos':
      return 'macos';
    case 'windows':
      return 'windows';
    case 'linux':
      return 'linux';
    default:
      return detected;
  }
}

export function isMobilePlatform(platform: DownloadPlatform) {
  return platform === 'ios' || platform === 'android';
}

export function resolvePrimaryPlatform(
  detected: DownloadPlatform,
  available: readonly DownloadPlatform[]
): DownloadPlatform {
  return available.includes(detected) ? detected : 'web';
}

const SEMVER = /^\d+\.\d+\.\d+$/;

// Only first-party store hosts become links; anything else is dropped.
export function parseStoreListing(
  platform: 'ios' | 'android',
  url: string | null | undefined,
  version: string | null | undefined
): MobileStoreListing | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') return null;
  const kind = storeKind(platform, parsed);
  if (!kind) return null;
  return {
    url: parsed.toString(),
    version: version && SEMVER.test(version) ? version : null,
    kind,
  };
}

function storeKind(platform: 'ios' | 'android', url: URL) {
  if (platform === 'ios') {
    if (url.hostname === 'apps.apple.com') return 'store';
    if (url.hostname === 'testflight.apple.com') return 'beta';
    return null;
  }
  if (url.hostname !== 'play.google.com') return null;
  if (url.pathname === '/store/apps/details') return 'store';
  if (url.pathname.startsWith('/apps/testing')) return 'beta';
  return null;
}

// desktop-v0.26.0-40215487156 -> 0.26.0 (the suffix is the CI run id).
export function desktopDisplayVersion(tag: string) {
  return tag.replace(/^desktop-v/, '').replace(/-\d+$/, '');
}
