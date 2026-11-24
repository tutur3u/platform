// Store screenshot rules (see apps/docs/build/devops/mobile-store-screenshots.mdx
// for the sources): how many images each device class takes per locale, the
// side lengths and aspect ratios Google Play accepts, and the encoded size cap.
// Every check is a pure function over names, sizes and counts.

const PLAY_MAX_BYTES = 8 * 1024 * 1024;
const PLAY_SIDE = { min: 320, max: 3840 };
const PLAY_MAX_ASPECT = 2.3;
const PORTRAIT_OR_LANDSCAPE_16_9 = [
  [9, 16],
  [16, 9],
];

/**
 * Per target (`<store>/<device>`): the device class it counts toward, its
 * count limits per locale, and optional side and aspect limits.
 * Classes shared by several targets (the Play foldable inner and outer
 * displays) count together.
 */
export const TARGET_RULES = {
  'ios/iphone-6.9': { group: 'ios/iphone-6.9', min: 1, max: 10 },
  'ios/iphone-6.3': { group: 'ios/iphone-6.3', min: 1, max: 10 },
  'ios/iphone-6.5': { group: 'ios/iphone-6.5', min: 1, max: 10 },
  'ios/ipad-13': { group: 'ios/ipad-13', min: 1, max: 10 },
  'macos/mac': { group: 'macos/mac', min: 1, max: 10 },
  'windows/desktop': { group: 'windows/desktop', min: 1, max: 10 },
  'android/phone': {
    group: 'android/phone',
    min: 2,
    max: 8,
    side: PLAY_SIDE,
    maxAspect: PLAY_MAX_ASPECT,
    maxBytes: PLAY_MAX_BYTES,
  },
  'android/tablet7': {
    group: 'android/tablet7',
    min: 4,
    max: 8,
    side: { min: 1080, max: PLAY_SIDE.max },
    ratios: PORTRAIT_OR_LANDSCAPE_16_9,
    maxAspect: PLAY_MAX_ASPECT,
    maxBytes: PLAY_MAX_BYTES,
  },
  'android/tablet10': {
    group: 'android/tablet10',
    min: 4,
    max: 8,
    side: { min: 1080, max: PLAY_SIDE.max },
    ratios: PORTRAIT_OR_LANDSCAPE_16_9,
    maxAspect: PLAY_MAX_ASPECT,
    maxBytes: PLAY_MAX_BYTES,
  },
  'android/foldable-folded': {
    group: 'android/foldable',
    min: 3,
    max: 8,
    side: { min: 960, max: PLAY_SIDE.max },
    ratios: [[10, 16]],
    maxAspect: PLAY_MAX_ASPECT,
    maxBytes: PLAY_MAX_BYTES,
  },
  'android/foldable-unfolded': {
    group: 'android/foldable',
    min: 3,
    max: 8,
    side: { min: 960, max: PLAY_SIDE.max },
    ratios: [
      [1, 1],
      [4, 3],
    ],
    maxAspect: PLAY_MAX_ASPECT,
    maxBytes: PLAY_MAX_BYTES,
  },
};

const RATIO_TOLERANCE = 0.005;

function ratioName([w, h]) {
  return `${w}:${h}`;
}

/** Problems with an image's side lengths and aspect ratio for [rules]. */
export function checkGeometry(label, width, height, rules) {
  if (!rules) return [];
  const problems = [];
  const { side, ratios, maxAspect } = rules;
  if (side) {
    for (const [name, value] of [
      ['width', width],
      ['height', height],
    ]) {
      if (value < side.min || value > side.max) {
        problems.push(
          `${label}: ${name} ${value} is outside ${side.min}-${side.max} px`
        );
      }
    }
  }
  const long = Math.max(width, height);
  const short = Math.min(width, height);
  if (maxAspect && long / short > maxAspect) {
    problems.push(
      `${label}: aspect ${(long / short).toFixed(2)}:1 exceeds ${maxAspect}:1`
    );
  }
  if (ratios) {
    const actual = width / height;
    const fits = ratios.some(
      ([w, h]) => Math.abs(actual - w / h) <= (w / h) * RATIO_TOLERANCE
    );
    if (!fits) {
      problems.push(
        `${label}: ${width}x${height} is not ${ratios.map(ratioName).join(' or ')}`
      );
    }
  }
  return problems;
}

/**
 * Checks per-locale counts and that English and Vietnamese ship the same set.
 * [files] are screenshot paths relative to the screenshot root:
 * `<store>/<device>/<locale>/NN-<id>.<ext>`.
 */
export function checkCounts(files) {
  const byTarget = new Map();
  for (const file of files) {
    const [store, device, locale, name] = file.split('/');
    if (!name || !/^[a-z]{2}$/u.test(locale)) continue;
    const key = `${store}/${device}`;
    if (!byTarget.has(key)) byTarget.set(key, new Map());
    const locales = byTarget.get(key);
    if (!locales.has(locale)) locales.set(locale, new Set());
    locales.get(locale).add(name);
  }
  const problems = [];
  const groups = new Map();
  for (const [target, locales] of byTarget) {
    const names = [...locales.values()].map((set) => [...set].sort().join());
    if (new Set(names).size > 1) {
      problems.push(
        `${target}: ${[...locales].map(([l, set]) => `${l} has ${set.size}`).join(', ')}; every locale must ship the same set`
      );
    }
    const rules = TARGET_RULES[target];
    if (!rules) continue;
    if (!groups.has(rules.group))
      groups.set(rules.group, { rules, counts: new Map() });
    const { counts } = groups.get(rules.group);
    for (const [locale, set] of locales) {
      counts.set(locale, (counts.get(locale) ?? 0) + set.size);
    }
  }
  for (const [group, { rules, counts }] of groups) {
    for (const [locale, count] of counts) {
      if (count < rules.min || count > rules.max) {
        problems.push(
          `${group}/${locale}: ${count} screenshots, expected ${rules.min}-${rules.max}`
        );
      }
    }
  }
  return problems;
}

/** Problems when a file is larger than its store's per-image cap. */
export function checkBytes(label, bytes, rules) {
  if (!rules?.maxBytes || bytes <= rules.maxBytes) return [];
  return [
    `${label}: ${bytes} bytes exceeds the store cap of ${rules.maxBytes}`,
  ];
}
