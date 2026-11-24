// Layout numbers for the store images. Definitions are in `cq`, one percent
// of the canvas width, so a layout scales with its target; screenshotLayout
// turns them into pixels for the page script (template-script.mjs), which
// measures the caption and places the cards under it.
//
// Layouts follow the shape of the target:
//   stack   caption centred above the UI card (phones, Play phone, 7" tablet,
//           iPhone Duo outer)
//   tablet  caption above a wide UI card (iPad 13", Play 10" tablet)
//   side    caption left, UI card right, both centred on the height (iPhone
//           Duo inner, landscape)
//   window  caption left, a plain window card right (Mac, Windows)

export const LAYOUTS = ['stack', 'tablet', 'side', 'window'];

/** Sorbet colours the field, wave, chip and caption use. */
export const COLORS = {
  field: '#dce7ff',
  wave: '#fffbfa',
  ink: '#26212b',
  chipInk: '#2a55a8',
  white: '#ffffff',
  dot: '#aee6a4',
  windowDot: '#cdc8d1',
};

/** Longest headline, in lines; longer text shrinks until it fits. */
export const MAX_HEADLINE_LINES = 2;

/** Smallest headline as a share of the canvas width, per frame class. */
export const MIN_HEADLINE_RATIO = { phone: 0.042, large: 0.026 };

/** Smallest chip text as a share of the canvas width, per frame class. */
export const MIN_CHIP_RATIO = { phone: 0.026, large: 0.016 };

/** The class a target's headline minimum belongs to. */
export function headlineClass(target) {
  return target.frame === 'phone' ? 'phone' : 'large';
}

/**
 * Wave crest offset in `cq` for frame [index] of a locale's set. A slow sine
 * keeps neighbours close, so a row of frames reads as one strip.
 */
export function waveOffset(index) {
  return Math.round(Math.sin(index * 0.9) * 40) / 10;
}

const STACK = {
  caption: { x: 6, w: 88, y: 13, align: 'center', headline: 12, overline: 3.3 },
  card: { x: 6, w: 88, yMode: 'fixed', y: 62, radius: 7 },
  fan: { cardW: 58, radius: 5.5, rotate: 7, sideDrop: 18, centerDrop: 8 },
  wave: { mode: 'height', value: 120 },
};

// A tablet page that ends before its screen does is cropped to its content
// (`cropped`), which leaves the room to show it on a wider card. The hook
// frame puts one calendar card behind a large dashboard card (`fan.side`).
const TABLET = {
  caption: { x: 8, w: 84, y: 9, align: 'center', headline: 8.6, overline: 2.6 },
  card: { x: 8, w: 84, yMode: 'capBottom', gap: 5, radius: 5 },
  cropped: { x: 6, w: 88 },
  fan: {
    cardW: 74,
    radius: 4.4,
    rotate: 6,
    sideDrop: 7,
    centerDrop: 0,
    side: { dx: 15 },
  },
  wave: { mode: 'card', value: 26 },
};

const SIDE = {
  caption: {
    x: 6,
    w: 33,
    align: 'left',
    centerAt: 0.5,
    headline: 4.4,
    overline: 1.7,
  },
  card: { x: 43, w: 59, yMode: 'center', radius: 3.2 },
  wave: { mode: 'bottom', value: 0.3, relativeTo: 'height' },
};

const WINDOW = {
  caption: {
    x: 6,
    w: 29,
    align: 'left',
    centerAt: 0.46,
    headline: 4.2,
    overline: 1.6,
  },
  card: { x: 36, w: 67, yMode: 'bottom', bleed: 0.08, radius: 1.8 },
  wave: { mode: 'bottom', value: 0.32, relativeTo: 'height' },
};

const BY_LAYOUT = { stack: STACK, tablet: TABLET, side: SIDE, window: WINDOW };

/** The layout definition for [layout], in `cq`. */
export function layoutDefinition(layout) {
  const definition = BY_LAYOUT[layout];
  if (!definition) throw new Error(`Unknown layout ${layout}`);
  return definition;
}

/**
 * The spec the page script receives for [target]: pixel numbers for the
 * caption, the main card, the optional fan and the wave.
 * @param {{ width: number, height: number, layout: string, frame: string }} target
 * @param {{ index?: number, fan?: boolean, crop?: boolean }} [options]
 *   `crop`: the card shows only the page's content, so a layout that has a
 *   `cropped` card box uses it.
 */
export function screenshotLayout(
  target,
  { index = 0, fan = false, crop = false } = {}
) {
  const cq = target.width / 100;
  const def = layoutDefinition(target.layout);
  const { caption } = def;
  const card = crop && def.cropped ? { ...def.card, ...def.cropped } : def.card;
  const spec = {
    layout: target.layout,
    width: target.width,
    height: target.height,
    cq,
    kind: target.frame,
    minHeadline: Math.round(
      target.width * MIN_HEADLINE_RATIO[headlineClass(target)]
    ),
    caption: {
      x: caption.x * cq,
      w: caption.w * cq,
      y: caption.y == null ? null : caption.y * cq,
      centerAt: caption.centerAt ?? null,
      align: caption.align,
      headline: Math.round(caption.headline * cq),
      overline: Math.round(caption.overline * cq * 10) / 10,
    },
    card: {
      x: card.x * cq,
      w: card.w * cq,
      yMode: card.yMode,
      y: (card.y ?? 0) * cq,
      gap: (card.gap ?? 0) * cq,
      bleed: card.bleed ?? 0,
      radius: card.radius * cq,
    },
    wave: {
      mode: def.wave.mode,
      value:
        def.wave.relativeTo === 'height'
          ? def.wave.value * (target.height / cq)
          : def.wave.value,
      offset: waveOffset(index),
    },
    fan: null,
  };
  if (fan && def.fan) spec.fan = fanCards(spec, def.fan);
  return spec;
}

/**
 * Cards fanned behind the dashboard card. The stack layout tilts the calendar
 * and the assistant behind it, with offsets from its 88 cq box that scale with
 * the card width; a layout with `fan.side` tilts one card out of the right
 * edge instead.
 */
function fanCards(spec, fan) {
  const { cq } = spec;
  if (fan.side) {
    const w = fan.cardW * cq;
    const x = spec.card.x + spec.card.w / 2 - w / 2;
    const base = { w, radius: fan.radius * cq };
    return {
      drop: { center: fan.centerDrop * cq, side: fan.sideDrop * cq },
      cards: [
        { role: 'right', ...base, x: x + fan.side.dx * cq, rotate: fan.rotate },
        { role: 'center', ...base, x, rotate: 0 },
      ],
    };
  }
  const s = spec.card.w / (88 * cq);
  const cx = spec.card.x + spec.card.w / 2;
  const w = fan.cardW * cq * s;
  const base = { w, radius: fan.radius * cq * s };
  return {
    drop: { center: fan.centerDrop * cq * s, side: fan.sideDrop * cq * s },
    cards: [
      { role: 'left', ...base, x: cx - 58 * cq * s, rotate: -fan.rotate },
      { role: 'right', ...base, x: cx, rotate: fan.rotate },
      { role: 'center', ...base, x: cx - w / 2, rotate: 0 },
    ],
  };
}
