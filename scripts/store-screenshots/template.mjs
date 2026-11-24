// HTML for composed store images: a pastel field with a warm white wave, a
// caption (product label and headline) and the raw app capture as a frameless
// rounded card that bleeds off the canvas edge. Rendered by compose.mjs in
// headless Chromium at the exact store pixel size; template-layout.mjs holds
// the numbers and template-script.mjs the in-page layout pass.
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

/** A card holding the raw capture; a window card adds a plain title strip. */
function card(url, data, { windowStrip = false, kind = '' } = {}) {
  const strip = windowStrip
    ? '<div class="strip"><i></i><i></i><i></i></div>'
    : '';
  return `<div class="card ${kind}" data-card="${attr(data)}">${strip}<img class="raw" src="${url}" alt=""></div>`;
}

function caption(headline, overline) {
  return `<div class="caption"><span class="overline">${escapeHtml(overline)}</span><h1 class="headline">${escapeHtml(headline)}</h1></div>`;
}

function chipHtml(chip) {
  return `<div class="chip" data-chip="${attr(chip.anchor)}"><i></i><span>${escapeHtml(chip.text)}</span></div>`;
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

/**
 * One listing screenshot. [index] is the frame's position in its locale's set
 * (it varies the wave crest); [fanUrls] turns the frame into the fanned hook
 * of three cards; [chip] is `{ text, anchor }` with the anchor in fractions
 * of the raw capture: `{ done, details }`, the rectangles of the card's "Done"
 * pill and its Details button.
 */
export function screenshotHtml({
  target,
  index = 0,
  headline,
  overline,
  rawUrl,
  fanUrls = null,
  chip = null,
  fontCss = FONT_CSS_URL,
}) {
  const spec = screenshotSpec(target, { index, fan: Boolean(fanUrls) });
  const kind = target.layout === 'window' ? '' : target.frame;
  const windowStrip = target.layout === 'window';
  const main = { ...spec.card, main: true, z: 2 };
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
        };
        return card(urls[role], data);
      })
      .join('\n');
  } else {
    cards = card(rawUrl, main, { windowStrip, kind });
  }
  const body = `${waveHtml(spec.wave)}
${caption(headline, overline)}
${cards}
${chip && !spec.fan ? chipHtml(chip) : ''}`;
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
${card(desktopUrl, bottomCard(200, 1280, 20), { windowStrip: true })}
${card(phoneUrl, { ...bottomCard(1370, 380, 28), z: 2 })}`;
  return { html: page(body, HERO.width, HERO.height, fontCss), spec };
}
