// Store screenshot targets. Sizes match apps/mobile/store/metadata/<store>.json
// `screenshotDevices`; raw captures come from
// apps/mobile/test/store_screenshots (same `<store>/<device>` ids).

/** @typedef {'phone' | 'tablet' | 'foldable' | 'desktop-mac' | 'desktop-windows'} FrameKind */

/**
 * Screenshots are JPEG unless a target sets `format: 'png'`; the Microsoft
 * Store listing takes opaque PNG. `frame` is the device class the capture
 * comes from. `layout` is the composition for the canvas shape: `stack`
 * (caption above the UI), `tablet` (caption above a wide UI), `side` (caption
 * left, UI right) or `window` (caption left, a plain window card right); see
 * template-layout.mjs.
 * @type {Array<{ store: string, device: string, width: number, height: number,
 *   frame: FrameKind, layout: 'stack' | 'tablet' | 'side' | 'window',
 *   maxBytes: number, format?: 'png' }>}
 */
export const SCREENSHOT_TARGETS = [
  {
    store: 'ios',
    device: 'iphone-6.9',
    width: 1320,
    height: 2868,
    frame: 'phone',
    layout: 'stack',
    maxBytes: 10_000_000,
  },
  {
    // Apple requires one screenshot for iPhone with a Dynamic Island (medium
    // display) at 1179x2556 or 1206x2622.
    store: 'ios',
    device: 'iphone-6.3',
    width: 1206,
    height: 2622,
    frame: 'phone',
    layout: 'stack',
    maxBytes: 10_000_000,
  },
  {
    // iPhone Duo outer display (portrait). Required from April 2027 for apps
    // built with the iOS 27.1 SDK.
    store: 'ios',
    device: 'iphone-duo-outer',
    width: 1398,
    height: 2034,
    frame: 'phone',
    layout: 'stack',
    maxBytes: 10_000_000,
  },
  {
    // iPhone Duo inner display, in its native landscape orientation.
    store: 'ios',
    device: 'iphone-duo-inner',
    width: 2853,
    height: 2007,
    frame: 'foldable',
    layout: 'side',
    maxBytes: 10_000_000,
  },
  {
    store: 'ios',
    device: 'iphone-6.5',
    width: 1284,
    height: 2778,
    frame: 'phone',
    layout: 'stack',
    maxBytes: 10_000_000,
  },
  {
    store: 'ios',
    device: 'ipad-13',
    width: 2064,
    height: 2752,
    frame: 'tablet',
    layout: 'tablet',
    maxBytes: 10_000_000,
  },
  {
    store: 'android',
    device: 'phone',
    width: 1080,
    height: 1920,
    frame: 'phone',
    layout: 'stack',
    maxBytes: 8_000_000,
  },
  {
    store: 'android',
    device: 'tablet7',
    width: 1080,
    height: 1920,
    frame: 'tablet',
    layout: 'stack',
    maxBytes: 8_000_000,
  },
  {
    store: 'android',
    device: 'tablet10',
    width: 1440,
    height: 2560,
    frame: 'tablet',
    layout: 'tablet',
    maxBytes: 8_000_000,
  },
  {
    store: 'macos',
    device: 'mac',
    width: 2880,
    height: 1800,
    frame: 'desktop-mac',
    layout: 'window',
    maxBytes: 10_000_000,
  },
  {
    store: 'windows',
    device: 'desktop',
    width: 1920,
    height: 1080,
    frame: 'desktop-windows',
    layout: 'window',
    maxBytes: 50_000_000,
    format: 'png',
  },
];

/** Opaque PNG graphics, at the paths the metadata `graphics` entries name. */
export const GRAPHIC_TARGETS = [
  {
    id: 'feature-graphic',
    file: 'apps/mobile/store/graphics/android/feature-graphic-1024x500.png',
    width: 1024,
    height: 500,
    maxBytes: 15_000_000,
  },
  {
    id: 'hero',
    file: 'apps/mobile/store/graphics/windows/hero-1920x1080.png',
    width: 1920,
    height: 1080,
    maxBytes: 50_000_000,
  },
];

export const LOCALES = ['en', 'vi'];

/**
 * Screens in story order (dashboard first, then Mira, tasks and calendar for
 * the four-screen iPhone Duo sets); ids match the metadata screenshot ids and
 * the keys of store-captions.json.
 */
export const SCREEN_IDS = [
  'dashboard',
  'assistant',
  'tasks',
  'calendar',
  'time-tracker',
  'finance',
  'habits',
  'notes',
];

/** The committed JPEG set stays under this many bytes. */
export const OUTPUT_BUDGET_BYTES = 40 * 1024 * 1024;

export const JPEG_QUALITY = 84;

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
  sources: {
    ios: 'iphone-6.9',
    macos: 'mac',
    android: 'phone',
    windows: 'desktop',
  },
};

export function webGalleryPath(platform, fileName) {
  return `${SCREENSHOT_ROOT}/${platform}/web/${fileName}`;
}

/**
 * Roadmap feature previews: the same captures in light and dark Sorbet on
 * transparent device frames, exported as AVIF and WebP. `logical` and `ratio`
 * must match `showcaseDevices` in
 * apps/mobile/test/store_screenshots/store_screenshot_app.dart; `maxEdge` caps
 * the exported long edge in pixels.
 * @type {Record<string, { logical: [number, number], ratio: number,
 *   frame: 'phone' | 'tablet' | 'foldable' | 'mac-window', maxEdge: number }>}
 */
export const SHOWCASE_DEVICES = {
  iphone: { logical: [393, 852], ratio: 3, frame: 'phone', maxEdge: 1280 },
  ipad: { logical: [1024, 1366], ratio: 2, frame: 'tablet', maxEdge: 1600 },
  'ipad-landscape': {
    logical: [1366, 1024],
    ratio: 2,
    frame: 'tablet',
    maxEdge: 1600,
  },
  mac: { logical: [1512, 982], ratio: 2, frame: 'mac-window', maxEdge: 1600 },
  // iPhone Duo: the outer display (closed) and the inner display (open).
  'duo-folded': {
    logical: [466, 678],
    ratio: 3,
    frame: 'phone',
    maxEdge: 1280,
  },
  'duo-unfolded': {
    logical: [951, 669],
    ratio: 3,
    frame: 'foldable',
    maxEdge: 1600,
  },
};

export const SHOWCASE = {
  /** Output folder, relative to the repository root. */
  root: 'packages/roadmap-core/src/assets/previews/app',
  /** Store id the Flutter capture writes under (`showcase/<device>-<theme>`). */
  rawStore: 'showcase',
  themes: ['light', 'dark'],
  locales: LOCALES,
  /** Screens in page order; ids match `showcaseScreens` in the Flutter test. */
  screens: [
    'tasks',
    'task-detail',
    'calendar',
    'assistant',
    'dashboard',
    'time-tracker',
  ],
  avifMaxBytes: 90 * 1024,
  webpMaxBytes: 140 * 1024,
  /** Quality ladders, best first; the first that fits the byte cap wins. */
  avifQualities: [74, 68, 62, 56, 50, 44, 38, 32, 26],
  webpQualities: [88, 82, 76, 70, 64, 58, 52, 46, 40],
};
