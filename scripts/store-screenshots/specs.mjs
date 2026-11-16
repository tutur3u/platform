// Store screenshot targets. Sizes match apps/mobile/store/metadata/<store>.json
// `screenshotDevices`; raw captures come from
// apps/mobile/test/store_screenshots (same `<store>/<device>` ids).

/** @typedef {'phone' | 'tablet' | 'desktop-mac' | 'desktop-windows'} FrameKind */

/**
 * Screenshots are JPEG unless a target sets `format: 'png'`; the Microsoft
 * Store listing takes opaque PNG.
 * @type {Array<{ store: string, device: string, width: number, height: number,
 *   frame: FrameKind, maxBytes: number, format?: 'png' }>}
 */
export const SCREENSHOT_TARGETS = [
  { store: 'ios', device: 'iphone-6.9', width: 1320, height: 2868, frame: 'phone', maxBytes: 10_000_000 },
  { store: 'ios', device: 'iphone-6.5', width: 1284, height: 2778, frame: 'phone', maxBytes: 10_000_000 },
  { store: 'ios', device: 'ipad-13', width: 2064, height: 2752, frame: 'tablet', maxBytes: 10_000_000 },
  { store: 'android', device: 'phone', width: 1080, height: 1920, frame: 'phone', maxBytes: 8_000_000 },
  { store: 'android', device: 'tablet7', width: 1200, height: 1920, frame: 'tablet', maxBytes: 8_000_000 },
  { store: 'android', device: 'tablet10', width: 1600, height: 2560, frame: 'tablet', maxBytes: 8_000_000 },
  { store: 'macos', device: 'mac', width: 2880, height: 1800, frame: 'desktop-mac', maxBytes: 10_000_000 },
  { store: 'windows', device: 'desktop', width: 1920, height: 1080, frame: 'desktop-windows', maxBytes: 50_000_000, format: 'png' },
];

/** Opaque PNG graphics, at the paths the metadata `graphics` entries name. */
export const GRAPHIC_TARGETS = [
  { id: 'feature-graphic', file: 'apps/mobile/store/graphics/android/feature-graphic-1024x500.png', width: 1024, height: 500, maxBytes: 15_000_000 },
  { id: 'hero', file: 'apps/mobile/store/graphics/windows/hero-1920x1080.png', width: 1920, height: 1080, maxBytes: 50_000_000 },
];

export const LOCALES = ['en', 'vi'];

/** Screens in listing order; ids match the metadata screenshot ids. */
export const SCREEN_IDS = [
  'dashboard',
  'tasks',
  'calendar',
  'assistant',
  'finance',
  'habits',
  'time-tracker',
  'notes',
];

/** The committed JPEG set stays under this many bytes. */
export const OUTPUT_BUDGET_BYTES = 40 * 1024 * 1024;

export const JPEG_QUALITY = 88;

export const SCREENSHOT_ROOT = 'apps/mobile/store/screenshots';

/** File extension of a target's screenshots: `jpg` or `png`. */
export function screenshotExt(target) {
  return target.format === 'png' ? 'png' : 'jpg';
}

export function screenshotPath(target, locale, screenId) {
  const order = String(SCREEN_IDS.indexOf(screenId) + 1).padStart(2, '0');
  return `${SCREENSHOT_ROOT}/${target.store}/${target.device}/${locale}/${order}-${screenId}.${screenshotExt(target)}`;
}

export function rawPath(target, locale, screenId) {
  const order = String(SCREEN_IDS.indexOf(screenId) + 1).padStart(2, '0');
  return `${target.store}/${target.device}/${locale}/${order}-${screenId}.png`;
}

/**
 * Web gallery derivatives for /roadmap: the first EN screenshots of one device
 * per platform, as small WebP files under `<platform>/web/`.
 */
export const WEB_GALLERY = {
  maxPerPlatform: 6,
  maxLongEdge: 1280,
  maxBytes: 150 * 1024,
  locale: 'en',
  sources: { ios: 'iphone-6.9', macos: 'mac', android: 'phone', windows: 'desktop' },
};

export function webGalleryPath(platform, fileName) {
  return `${SCREENSHOT_ROOT}/${platform}/web/${fileName}`;
}
