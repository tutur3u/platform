import { BASE_CSS, FONT_CSS_URL } from './template-css.mjs';
import { MAX_HEADLINE_LINES, screenshotLayout } from './template-layout.mjs';
import { LAYOUT_SCRIPT } from './template-script.mjs';

export { FONT_CSS_URL };

function escapeHtml(text) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function attr(value) {
  return escapeHtml(JSON.stringify(value));
}

/** Neutral line glyphs for a Windows title strip: minimise, maximise, close. */
const WINDOWS_CONTROLS = ['min', 'max', 'close']
  .map((kind) => `<b class="${kind}"></b>`)
  .join('');

/** The plain title strip of a window card: grey dots, or Windows controls. */
function stripHtml(kind) {
  if (kind === 'windows')
    return `<div class="strip win">${WINDOWS_CONTROLS}</div>`;
  return '<div class="strip"><i></i><i></i><i></i></div>';
}

/**
 * A card holding the raw capture; a window card adds a plain title strip, with
 * [windowStrip] naming the style (`windows` for Microsoft Store targets).
 */
function card(url, data, { windowStrip = false, kind = '' } = {}) {
  const strip = windowStrip ? stripHtml(windowStrip) : '';
  return `<div class="card ${kind}" data-card="${attr(data)}">${strip}<img class="raw" src="${url}" alt=""></div>`;
}

function caption(headline) {
  return `<div class="caption"><h1 class="headline">${escapeHtml(headline)}</h1></div>`;
}

function waveHtml(wave) {
  return `<div class="wave" data-wave="${attr(wave)}"></div>`;
}

function page(body, width, height, fontCss) {
  return `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="${fontCss}">
<style>${BASE_CSS}</style></head>
<body style="width:${width}px;height:${height}px">${body}<script>${LAYOUT_SCRIPT}</script></body></html>`;
}

/** Layout numbers for a listing screenshot of [target]. */
export function screenshotSpec(target, options) {
  return { ...screenshotLayout(target, options), maxLines: MAX_HEADLINE_LINES };
}

// Feature palettes apply only to the artwork around the captured app.
const FEATURE_PALETTES = {
  dashboard: ['#ffe5be', '#53242e', '#ef694a'],
  assistant: ['#251c42', '#fff0d4', '#64408c'],
  tasks: ['#91b9ff', '#112956', '#5577ca'],
  calendar: ['#daedb5', '#113c34', '#a2cdb1'],
  'time-tracker': ['#ffc66c', '#3b270b', '#db873e'],
  finance: ['#277459', '#fffdf3', '#12523c'],
  habits: ['#e0a2f6', '#371248', '#a85dcb'],
  notes: ['#ca487e', '#ffffff', '#9f275b'],
};

export function screenshotHtml({
  target,
  index = 0,
  headline,
  feature,
  rawUrl,
  fanUrls = null,
  crop = null,
  fontCss = FONT_CSS_URL,
}) {
  const spec = screenshotSpec(target, {
    index,
    fan: Boolean(fanUrls) && target.layout === 'tablet',
    crop: crop != null,
  });
  if (target.layout === 'stack' && !spec.fan) {
    // Alternate the editorial alignment and reveal more of dense screens.
    if (index % 2 === 1) {
      spec.caption.align = 'left';
      spec.caption.x = 8 * spec.cq;
      spec.caption.w = 84 * spec.cq;
      spec.card.x = 8 * spec.cq;
      spec.card.w = 86 * spec.cq;
      if (feature === 'assistant') spec.card.y = 51 * spec.cq;
    } else {
      spec.card.y = 54 * spec.cq;
    }
  }
  const kind = target.layout === 'window' ? '' : target.frame;
  const windowStrip =
    target.layout === 'window' &&
    (target.store === 'windows' ? 'windows' : 'mac');
  const main = { ...spec.card, main: true, z: 2, crop };
  let cards;
  if (spec.fan) {
    const urls = { left: fanUrls.left, right: fanUrls.right, center: rawUrl };
    cards = spec.fan.cards
      .map(({ role, ...geometry }) => {
        const dy =
          role === 'center' ? spec.fan.drop.center : spec.fan.drop.side;
        const data = {
          ...main,
          ...geometry,
          dy,
          main: role === 'center',
          z: role === 'center' ? 3 : 1,
          crop: role === 'center' ? crop : null,
        };
        return card(urls[role], data);
      })
      .join('\n');
  } else {
    cards = card(rawUrl, main, { windowStrip, kind });
  }
  const artwork = Object.hasOwn(FEATURE_PALETTES, feature)
    ? feature
    : 'dashboard';
  const [field, ink, accent] = FEATURE_PALETTES[artwork];
  const body = `<div class="artwork" data-feature="${artwork}" style="--field:${field};--ink:${ink};--accent:${accent};--angle:${index % 2 === 0 ? 155 : 205}deg">
${caption(headline)}
${cards}
</div>`;
  return { html: page(body, target.width, target.height, fontCss), spec };
}

const FEATURE = { width: 1024, height: 500 };
const HERO = { width: 1920, height: 1080 };

function graphicSpec(size, wave) {
  return {
    ...size,
    cq: size.width / 100,
    caption: null,
    minHeadline: 0,
    maxLines: MAX_HEADLINE_LINES,
    wave,
  };
}

function bottomCard(x, w, radius, bleed = 0.06) {
  return { x, w, yMode: 'bottom', bleed, radius, main: false, z: 1 };
}

/** Play feature graphic: app icon and name beside two phone cards. */
export function featureGraphicHtml({
  iconUrl,
  phoneUrls,
  fontCss = FONT_CSS_URL,
}) {
  const [front, back] = phoneUrls;
  const spec = graphicSpec(FEATURE, {
    mode: 'bottom',
    value: 17,
    offset: 0,
  });
  const body = `${waveHtml(spec.wave)}
<div style="position:absolute;left:72px;top:0;bottom:0;display:flex;align-items:center;gap:28px">
  <img src="${iconUrl}" alt="" style="width:132px;height:132px;border-radius:30px;box-shadow:0 10px 30px rgba(38,33,43,.16)">
  <span data-font style="font-weight:900;font-size:76px;letter-spacing:-0.04em">Tuturuuu</span>
</div>
${card(back, bottomCard(620, 170, 16, 0.02))}
${card(front, bottomCard(800, 190, 18, 0.02))}`;
  return { html: page(body, FEATURE.width, FEATURE.height, fontCss), spec };
}

/** Microsoft Store hero: a desktop window and a phone card, no text. */
export function heroHtml({ desktopUrl, phoneUrl, fontCss = FONT_CSS_URL }) {
  const spec = graphicSpec(HERO, { mode: 'bottom', value: 20, offset: 0 });
  const body = `${waveHtml(spec.wave)}
${card(desktopUrl, bottomCard(200, 1280, 20), { windowStrip: 'windows' })}
${card(phoneUrl, { ...bottomCard(1370, 380, 28), z: 2 })}`;
  return { html: page(body, HERO.width, HERO.height, fontCss), spec };
}
