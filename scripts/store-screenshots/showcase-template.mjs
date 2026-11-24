// Geometry and HTML for the roadmap feature previews: one real app capture in a
// generic device frame on a transparent canvas, with no headline. The page
// that shows the image supplies the caption and the background.

/**
 * Frame proportions relative to the screen width. `bar` is the status bar
 * (phone, tablet, foldable) or the window title bar (mac-window) drawn above
 * the capture; `margin` leaves room for the drop shadow.
 */
export const SHOWCASE_FRAMES = {
  phone: { bezel: 0.035, radius: 0.15, screen: 0.115, bar: 0.1, margin: 0.05 },
  tablet: { bezel: 0.03, radius: 0.06, screen: 0.035, bar: 0.03, margin: 0.04 },
  foldable: {
    bezel: 0.028,
    radius: 0.07,
    screen: 0.05,
    bar: 0.055,
    margin: 0.045,
  },
  'mac-window': {
    bezel: 0,
    radius: 0.008,
    screen: 0.008,
    bar: 0.03,
    margin: 0.04,
  },
};

const THEMES = {
  light: {
    bezel: '#211d27',
    rim: 'rgba(255,255,255,0)',
    ink: '#26212b',
    titlebar: '#efedf1',
    hairline: 'rgba(38,33,43,.14)',
    shadow: 'rgba(38,33,43,.22)',
    seam: 'rgba(38,33,43,.22)',
  },
  dark: {
    bezel: '#0b0a0d',
    rim: 'rgba(255,255,255,.2)',
    ink: '#f3eef6',
    titlebar: '#2a2830',
    hairline: 'rgba(255,255,255,.12)',
    shadow: 'rgba(0,0,0,.55)',
    seam: 'rgba(0,0,0,.5)',
  },
};

/**
 * Pixel layout of one preview. [rawWidth] x [rawHeight] is the capture; the
 * canvas is sized so its long edge is at most [device.maxEdge].
 */
export function showcaseLayout(device, rawWidth, rawHeight) {
  const f = SHOWCASE_FRAMES[device.frame];
  const aspect = rawHeight / rawWidth;
  const widthUnits = 1 + 2 * f.bezel + 2 * f.margin;
  const heightUnits = aspect + f.bar + 2 * f.bezel + 2 * f.margin;
  const sw = Math.floor(device.maxEdge / Math.max(widthUnits, heightUnits));
  const px = (value) => Math.round(value * sw);
  const bezel = px(f.bezel);
  const bar = px(f.bar);
  const margin = px(f.margin);
  const screenHeight = Math.round(sw * aspect);
  return {
    kind: device.frame,
    screenWidth: sw,
    screenHeight,
    bezel,
    bar,
    margin,
    radius: px(f.radius),
    screenRadius: px(f.screen),
    deviceWidth: sw + 2 * bezel,
    deviceHeight: screenHeight + bar + 2 * bezel,
    width: sw + 2 * bezel + 2 * margin,
    height: screenHeight + bar + 2 * bezel + 2 * margin,
  };
}

function statusIcons(ink) {
  return `<svg viewBox="0 0 66 14" class="icons" aria-hidden="true">
<rect x="0" y="9" width="3" height="5" rx="1" fill="${ink}"/><rect x="5" y="6" width="3" height="8" rx="1" fill="${ink}"/>
<rect x="10" y="3" width="3" height="11" rx="1" fill="${ink}"/><rect x="15" y="0" width="3" height="14" rx="1" fill="${ink}"/>
<path d="M25 5.5a10 10 0 0 1 14 0M27.5 8.2a6.4 6.4 0 0 1 9 0M30.2 11a2.6 2.6 0 0 1 3.6 0" stroke="${ink}" stroke-width="2" fill="none" stroke-linecap="round"/>
<rect x="44" y="1.5" width="19" height="11" rx="3" stroke="${ink}" stroke-width="1.4" fill="none"/>
<rect x="46" y="3.5" width="13" height="7" rx="1.5" fill="${ink}"/><rect x="64.2" y="5" width="1.8" height="4" rx="0.9" fill="${ink}"/></svg>`;
}

function bar(layout, theme, barColor) {
  const t = THEMES[theme];
  if (layout.kind === 'mac-window') {
    const dot = Math.round(layout.bar * 0.3);
    const dots = ['#ff5f57', '#febc2e', '#28c840']
      .map(
        (color) =>
          `<i style="width:${dot}px;height:${dot}px;background:${color}"></i>`
      )
      .join('');
    return `<div class="bar mac" style="height:${layout.bar}px;background:${t.titlebar};gap:${Math.round(dot * 0.7)}px;padding-left:${Math.round(layout.bar * 0.5)}px;border-bottom:1px solid ${t.hairline}">${dots}</div>`;
  }
  const font = Math.round(layout.bar * 0.36);
  const pad = Math.round(layout.screenWidth * 0.075);
  return `<div class="bar status" style="height:${layout.bar}px;background:${barColor};color:${t.ink};font-size:${font}px;padding:0 ${pad}px"><span>9:41</span>${statusIcons(t.ink)}</div>`;
}

/**
 * The page to screenshot with a transparent background.
 * @param {{ layout: ReturnType<typeof showcaseLayout>, theme: 'light' | 'dark',
 *   rawUrl: string, barColor: string }} input
 */
export function showcaseHtml({ layout, theme, rawUrl, barColor }) {
  const t = THEMES[theme];
  const mac = layout.kind === 'mac-window';
  const folded = layout.kind === 'foldable';
  const seam = folded
    ? `<div class="seam" style="width:${Math.round(layout.screenWidth * 0.016)}px;background:linear-gradient(90deg,transparent,${t.seam} 50%,transparent)"></div>`
    : '';
  const crease = folded
    ? `<div class="crease" style="height:${layout.deviceHeight}px"></div>`
    : '';
  const rim = mac ? `0 0 0 1px ${t.hairline}` : `inset 0 0 0 1px ${t.rim}`;
  const drop = `0 ${Math.round(layout.margin * 0.28)}px ${Math.round(layout.margin * 0.7)}px ${t.shadow}`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${layout.width}px;height:${layout.height}px;background:transparent;overflow:hidden}
body{position:relative;font-family:ui-rounded,-apple-system,"SF Pro Text",system-ui,sans-serif;-webkit-font-smoothing:antialiased}
.device{position:absolute;left:${layout.margin}px;top:${layout.margin}px;width:${layout.deviceWidth}px;height:${layout.deviceHeight}px;border-radius:${layout.radius}px;background:${mac ? t.titlebar : t.bezel};box-shadow:${rim},${drop}}
.screen{position:absolute;left:${layout.bezel}px;top:${layout.bezel}px;width:${layout.screenWidth}px;height:${layout.screenHeight + layout.bar}px;border-radius:${layout.screenRadius}px;overflow:hidden;background:${barColor}}
.bar{display:flex;align-items:center;width:100%;flex:none}
.status{justify-content:space-between;font-weight:700;letter-spacing:-.01em}
.icons{height:38%;width:auto}
.mac i{display:block;border-radius:50%}
.raw{display:block;width:${layout.screenWidth}px;height:${layout.screenHeight}px}
.seam{position:absolute;top:0;bottom:0;left:50%;transform:translateX(-50%);pointer-events:none}
.crease{position:absolute;top:0;left:50%;width:1px;background:rgba(255,255,255,.14);pointer-events:none}
</style></head><body><div class="device"><div class="screen">${bar(layout, theme, barColor)}<img class="raw" src="${rawUrl}" alt="">${seam}</div>${crease}</div></body></html>`;
}
