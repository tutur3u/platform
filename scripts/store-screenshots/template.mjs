// HTML for composed store images: a Sorbet background, a generic device frame
// around the raw app capture, and the headline. Rendered by compose.mjs in
// headless Chromium at the exact store pixel size.

// Sorbet light tokens (Tuturuuu design system).
const INK = '#26212b';
const GROUND = '#fffbfa';
const FILLS = {
  blue: '#c6daff',
  green: '#c6f0bc',
  orange: '#ffd6a8',
  red: '#ffc9c4',
  yellow: '#ffe896',
  purple: '#ddcdff',
  pink: '#ffc8e3',
  teal: '#b9ebe2',
};

// Each screen leads with its product tone, with a second hue for depth.
const SCREEN_TONES = {
  dashboard: ['blue', 'pink'],
  tasks: ['green', 'yellow'],
  calendar: ['blue', 'teal'],
  assistant: ['purple', 'blue'],
  finance: ['orange', 'yellow'],
  habits: ['yellow', 'green'],
  'time-tracker': ['teal', 'blue'],
  notes: ['pink', 'orange'],
};

export const FONT_CSS_URL =
  'https://fonts.googleapis.com/css2?family=Nunito:wght@700;800&display=block';

/** Frame proportions, relative to the screen width. */
const FRAMES = {
  phone: {
    bezel: 0.035,
    radius: 0.15,
    screenRadius: 0.12,
    bar: 0.1,
    maxWidth: 0.8,
  },
  tablet: {
    bezel: 0.028,
    radius: 0.06,
    screenRadius: 0.035,
    bar: 0.03,
    maxWidth: 0.84,
  },
  'desktop-mac': {
    bezel: 0,
    radius: 0.012,
    screenRadius: 0.012,
    bar: 0.026,
    maxWidth: 0.84,
  },
  'desktop-windows': {
    bezel: 0,
    radius: 0.006,
    screenRadius: 0.006,
    bar: 0.024,
    maxWidth: 0.84,
  },
};

function escapeHtml(text) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function blobs(tones, width, height, plateUrl) {
  if (plateUrl) {
    return `<img class="plate" src="${plateUrl}" alt="">`;
  }
  const [lead, second] = tones.map((tone) => FILLS[tone]);
  const unit = Math.max(width, height);
  // Soft blurred discs: lead tone top-left and bottom-right, second hue
  // between them, so the headline sits on calm ground.
  const discs = [
    { color: lead, x: -0.18, y: -0.12, r: 0.62, o: 0.9 },
    { color: second, x: 0.72, y: 0.18, r: 0.44, o: 0.75 },
    { color: lead, x: 0.55, y: 0.78, r: 0.7, o: 0.85 },
    { color: FILLS.pink, x: -0.25, y: 0.62, r: 0.36, o: 0.35 },
  ];
  return discs
    .map(({ color, x, y, r, o }) => {
      const size = r * unit;
      return `<div class="disc" style="left:${x * width}px;top:${y * height}px;width:${size}px;height:${size}px;background:${color};opacity:${o};filter:blur(${size * 0.18}px)"></div>`;
    })
    .join('');
}

const STATUS_ICONS = `
<svg viewBox="0 0 66 14" class="status-icons" aria-hidden="true">
  <rect x="0" y="9" width="3" height="5" rx="1" fill="${INK}"/>
  <rect x="5" y="6" width="3" height="8" rx="1" fill="${INK}"/>
  <rect x="10" y="3" width="3" height="11" rx="1" fill="${INK}"/>
  <rect x="15" y="0" width="3" height="14" rx="1" fill="${INK}"/>
  <path d="M25 5.5a10 10 0 0 1 14 0M27.5 8.2a6.4 6.4 0 0 1 9 0M30.2 11a2.6 2.6 0 0 1 3.6 0" stroke="${INK}" stroke-width="2" fill="none" stroke-linecap="round"/>
  <rect x="44" y="1.5" width="19" height="11" rx="3" stroke="${INK}" stroke-width="1.4" fill="none"/>
  <rect x="46" y="3.5" width="13" height="7" rx="1.5" fill="${INK}"/>
  <rect x="64.2" y="5" width="1.8" height="4" rx="0.9" fill="${INK}"/>
</svg>`;

function frameBar(kind) {
  if (kind === 'phone' || kind === 'tablet') {
    return `<div class="bar status"><span class="clock">9:41</span>${STATUS_ICONS}</div>`;
  }
  if (kind === 'desktop-mac') {
    return `<div class="bar title mac"><i style="background:${FILLS.red}"></i><i style="background:${FILLS.yellow}"></i><i style="background:${FILLS.green}"></i></div>`;
  }
  return `<div class="bar title win"><svg viewBox="0 0 120 20" aria-hidden="true"><path d="M8 10h12M52 4h12v12H52zM96 4l12 12M108 4L96 16" stroke="${INK}" stroke-width="1.4" fill="none"/></svg></div>`;
}

function device(kind, rawUrl, cls = '') {
  return `<div class="device ${kind} ${cls}" data-kind="${kind}"><div class="screen">${frameBar(kind)}<img class="raw" src="${rawUrl}" alt=""></div></div>`;
}

const BASE_CSS = `
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:100%;height:100%;overflow:hidden;background:${GROUND}}
body{position:relative;font-family:Nunito,ui-rounded,system-ui,sans-serif;color:${INK};-webkit-font-smoothing:antialiased}
.plate{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.disc{position:absolute;border-radius:50%}
.device{position:absolute;background:${INK};box-shadow:0 0.02em 0.06em rgba(38,33,43,.16),0 0.18em 0.5em rgba(38,33,43,.18)}
.device.desktop-mac,.device.desktop-windows{background:transparent}
.screen{position:absolute;overflow:hidden;display:flex;flex-direction:column}
.raw{display:block;width:100%;height:auto;flex:none}
.bar{flex:none;display:flex;align-items:center;width:100%}
.status{justify-content:space-between;font-weight:700}
.status-icons{height:38%;width:auto}
.title.mac{gap:0.6em;padding-left:1.1em}
.title.mac i{display:block;width:1.1em;height:1.1em;border-radius:50%}
.title.win{justify-content:flex-end}
.title.win svg{height:100%;width:auto;padding:0.3em 0.6em}
.headline{position:absolute;left:0;right:0;text-align:center;font-weight:800;letter-spacing:-0.03em;line-height:1.08;text-wrap:balance;padding:0 6%}
`;

// Sizes each device to fit its box, paints its bar from the capture's top
// pixel, and shrinks the headline until it fits in two lines.
const LAYOUT_SCRIPT = `
window.__layout = async (spec) => {
  await document.fonts.ready;
  const W = innerWidth, H = innerHeight;
  const head = document.querySelector('.headline');
  if (head) {
    let size = spec.headlineSize;
    head.style.fontSize = size + 'px';
    head.style.top = spec.headlineTop + 'px';
    const lineHeight = () => parseFloat(getComputedStyle(head).lineHeight);
    while (head.getBoundingClientRect().height > lineHeight() * 2.2 && size > 12) {
      size -= 2;
      head.style.fontSize = size + 'px';
    }
  }
  const headBottom = head ? head.getBoundingClientRect().bottom : 0;
  for (const el of document.querySelectorAll('.device')) {
    const img = el.querySelector('img.raw');
    await img.decode();
    const f = spec.frames[el.dataset.kind];
    const box = el.dataset.box ? JSON.parse(el.dataset.box) : {
      x: 0, y: headBottom + spec.gap, w: W * f.maxWidth, h: H - headBottom - spec.gap - spec.bottom,
    };
    const aspect = img.naturalHeight / img.naturalWidth;
    const sw = Math.min(box.w / (1 + 2 * f.bezel), box.h / (aspect + f.bar + 2 * f.bezel));
    const bezel = sw * f.bezel, bar = sw * f.bar;
    const ow = sw + 2 * bezel, oh = sw * aspect + bar + 2 * bezel;
    el.style.width = ow + 'px';
    el.style.height = oh + 'px';
    el.style.left = (el.dataset.box ? box.x + (box.w - ow) / 2 : (W - ow) / 2) + 'px';
    el.style.top = (el.dataset.box ? box.y + (box.h - oh) / 2 : box.y) + 'px';
    el.style.borderRadius = sw * f.radius + 'px';
    el.style.fontSize = sw / 10 + 'px';
    const screen = el.querySelector('.screen');
    Object.assign(screen.style, {
      left: bezel + 'px', top: bezel + 'px', width: sw + 'px', height: sw * aspect + bar + 'px',
      borderRadius: sw * f.screenRadius + 'px',
    });
    const barEl = el.querySelector('.bar');
    barEl.style.height = bar + 'px';
    barEl.style.fontSize = bar * 0.38 + 'px';
    if (barEl.classList.contains('status')) barEl.style.padding = '0 ' + sw * 0.075 + 'px';
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 4, 4, 1, 1, 0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    barEl.style.background = 'rgb(' + r + ',' + g + ',' + b + ')';
    screen.style.background = barEl.style.background;
  }
  // Pages without brand text (the hero) need no web font.
  return !document.querySelector('[data-font]') || document.fonts.check('800 40px Nunito');
};`;

function page(body, width, height, fontCss) {
  return `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="${fontCss}">
<style>${BASE_CSS}</style></head>
<body style="width:${width}px;height:${height}px">${body}<script>${LAYOUT_SCRIPT}</script></body></html>`;
}

/** Layout numbers for a listing screenshot of [target]. */
export function screenshotSpec(target) {
  const portrait = target.height > target.width;
  const base = portrait ? target.width : target.height;
  return {
    headlineSize: Math.round(
      base * (target.frame === 'phone' ? 0.078 : portrait ? 0.056 : 0.062)
    ),
    headlineTop: Math.round(target.height * (portrait ? 0.045 : 0.06)),
    gap: Math.round(target.height * (portrait ? 0.035 : 0.05)),
    bottom: Math.round(target.height * (portrait ? 0.035 : 0.06)),
    frames: FRAMES,
  };
}

export function screenshotHtml({
  target,
  screenId,
  headline,
  rawUrl,
  plateUrl,
  fontCss = FONT_CSS_URL,
}) {
  const tones = SCREEN_TONES[screenId] ?? ['blue', 'pink'];
  const body = `${blobs(tones, target.width, target.height, plateUrl)}
<h1 class="headline" data-font>${escapeHtml(headline)}</h1>
${device(target.frame, rawUrl)}`;
  return page(body, target.width, target.height, fontCss);
}

/** Play feature graphic: app icon and name beside two phones. */
export function featureGraphicHtml({
  iconUrl,
  phoneUrls,
  plateUrl,
  fontCss = FONT_CSS_URL,
}) {
  const [front, back] = phoneUrls;
  const body = `${blobs(['blue', 'green'], 1024, 500, plateUrl)}
<div style="position:absolute;left:72px;top:0;bottom:0;display:flex;align-items:center;gap:28px">
  <img src="${iconUrl}" alt="" style="width:132px;height:132px;border-radius:30px;box-shadow:0 10px 30px rgba(38,33,43,.16)">
  <span data-font style="font-weight:800;font-size:76px;letter-spacing:-0.035em">Tuturuuu</span>
</div>
<div class="device phone" data-kind="phone" data-box='{"x":620,"y":70,"w":200,"h":520}'><div class="screen">${frameBar('phone')}<img class="raw" src="${back}" alt=""></div></div>
<div class="device phone" data-kind="phone" data-box='{"x":780,"y":40,"w":220,"h":560}'><div class="screen">${frameBar('phone')}<img class="raw" src="${front}" alt=""></div></div>`;
  return page(body, 1024, 500, fontCss);
}

/** Microsoft Store hero: a desktop window and a phone, no text. */
export function heroHtml({
  desktopUrl,
  phoneUrl,
  plateUrl,
  fontCss = FONT_CSS_URL,
}) {
  const body = `${blobs(['purple', 'blue'], 1920, 1080, plateUrl)}
<div class="device desktop-windows" data-kind="desktop-windows" data-box='{"x":300,"y":150,"w":1240,"h":780}'><div class="screen">${frameBar('desktop-windows')}<img class="raw" src="${desktopUrl}" alt=""></div></div>
<div class="device phone" data-kind="phone" data-box='{"x":1380,"y":300,"w":300,"h":700}'><div class="screen">${frameBar('phone')}<img class="raw" src="${phoneUrl}" alt=""></div></div>`;
  return page(body, 1920, 1080, fontCss);
}

export function graphicSpec() {
  return { headlineSize: 0, headlineTop: 0, gap: 0, bottom: 0, frames: FRAMES };
}
