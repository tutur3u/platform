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

export const ANDROID_PACKAGE_ID = 'com.tuturuuu.app.mobile';

// The Android app is in Google Play closed testing, where the public details
// page 404s. Flip this only once the listing is public.
export const ANDROID_PUBLICLY_LISTED = false;

const ANDROID_PACKAGE = /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/;

export function androidTestingUrl(packageId: string) {
  return `https://play.google.com/apps/testing/${packageId}`;
}

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
  version: string | null | undefined,
  { androidPubliclyListed = ANDROID_PUBLICLY_LISTED } = {}
): MobileStoreListing | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (
    parsed.protocol !== 'https:' ||
    parsed.username ||
    parsed.password ||
    parsed.port
  )
    return null;
  const listing =
    platform === 'ios'
      ? appleListing(parsed)
      : googlePlayListing(parsed, androidPubliclyListed);
  if (!listing) return null;
  return {
    ...listing,
    version: version && SEMVER.test(version) ? version : null,
  };
}

function appleListing(url: URL) {
  if (url.hostname === 'apps.apple.com')
    return { url: url.toString(), kind: 'store' as const };
  if (url.hostname === 'testflight.apple.com')
    return { url: url.toString(), kind: 'beta' as const };
  return null;
}

// Rebuild Play links from a validated package id instead of echoing input.
function googlePlayListing(url: URL, publiclyListed: boolean) {
  if (url.hostname !== 'play.google.com') return null;
  const packageId =
    url.pathname === '/store/apps/details'
      ? url.searchParams.get('id')
      : url.pathname.match(/^\/apps\/testing\/([^/]+)\/?$/)?.[1];
  if (!packageId || !ANDROID_PACKAGE.test(packageId)) return null;
  return publiclyListed
    ? {
        url: `https://play.google.com/store/apps/details?id=${packageId}`,
        kind: 'store' as const,
      }
    : { url: androidTestingUrl(packageId), kind: 'beta' as const };
}

export type ReleaseVersion = { version: string; build: string | null };

// The shared release train starts at 0.27.27; from there the numeric tag
// suffix is the global build number. Older suffixes were CI run ids.
const SHARED_TRAIN = [0, 27, 27] as const;

function onSharedTrain(version: string) {
  const [major = 0, minor = 0, patch = 0] = version.split('.').map(Number);
  const [trainMajor, trainMinor, trainPatch] = SHARED_TRAIN;
  if (major !== trainMajor) return major > trainMajor;
  if (minor !== trainMinor) return minor > trainMinor;
  return patch >= trainPatch;
}

// desktop-v0.27.27-1000000 -> 0.27.27 build 1000000; desktop-v0.26.1 ->
// 0.26.1; legacy desktop-v0.26.0-40215487156 -> 0.26.0.
export function parseDesktopTag(tag: string): ReleaseVersion {
  const match = tag.match(/^desktop-v(\d+\.\d+\.\d+)(?:-(\d+))?$/);
  if (!match?.[1]) return { version: desktopDisplayVersion(tag), build: null };
  const version = match[1];
  return {
    version,
    build: match[2] && onSharedTrain(version) ? match[2] : null,
  };
}

export function desktopDisplayVersion(tag: string) {
  return tag.replace(/^desktop-v/, '').replace(/-\d+$/, '');
}

// A store or beta version recorded as X.Y.Z, optionally with +<build>.
export function parseReleaseVersion(value: unknown): ReleaseVersion | null {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^(\d+\.\d+\.\d+)(?:\+(\d+))?$/);
  return match?.[1] ? { version: match[1], build: match[2] ?? null } : null;
}
