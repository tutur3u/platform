// Geometry and HTML for the roadmap feature previews: one real app capture as
// a frameless rounded card with a soft shadow on a transparent canvas, with no
// headline and no field. The page that shows the image supplies the caption
// and the background. The Mac preview is a plain window card with a neutral
// title strip, and the open iPhone Duo keeps a thin centre line.

/**
 * Card proportions relative to the capture width. `bar` is the window title
 * strip (mac-window only); `margin` leaves room for the drop shadow.
 */
export const SHOWCASE_FRAMES = {
  phone: { bezel: 0, radius: 0.08, screen: 0.08, bar: 0, margin: 0.1 },
  tablet: { bezel: 0, radius: 0.05, screen: 0.05, bar: 0, margin: 0.08 },
  foldable: { bezel: 0, radius: 0.045, screen: 0.045, bar: 0, margin: 0.08 },
  'mac-window': {
    bezel: 0,
    radius: 0.014,
    screen: 0.014,
    bar: 0.034,
    margin: 0.06,
  },
};

const THEMES = {
  light: {
    titlebar: '#ffffff',
    dot: '#cdc8d1',
    hairline: 'rgba(38,33,43,.1)',
    shadow: ['rgba(38,33,43,.08)', 'rgba(42,85,168,.22)'],
    seam: 'rgba(38,33,43,.22)',
  },
  dark: {
    titlebar: '#2a2830',
    dot: '#4a4752',
    hairline: 'rgba(255,255,255,.12)',
    shadow: ['rgba(0,0,0,.3)', 'rgba(0,0,0,.5)'],
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

function titleStrip(layout, t) {
  const dot = Math.round(layout.bar * 0.36);
  const dots = [0, 1, 2]
    .map(
      () => `<i style="width:${dot}px;height:${dot}px;background:${t.dot}"></i>`
    )
    .join('');
  return `<div class="bar" style="height:${layout.bar}px;background:${t.titlebar};gap:${Math.round(dot * 0.8)}px;padding-left:${Math.round(layout.bar * 0.6)}px">${dots}</div>`;
}

/**
 * The page to screenshot with a transparent background.
 * @param {{ layout: ReturnType<typeof showcaseLayout>,
 *   theme: 'light' | 'dark', rawUrl: string }} input
 */
export function showcaseHtml({ layout, theme, rawUrl }) {
  const t = THEMES[theme];
  const mac = layout.kind === 'mac-window';
  const folded = layout.kind === 'foldable';
  const sw = layout.screenWidth;
  const seam = folded
    ? `<div class="seam" style="width:${Math.max(2, Math.round(sw * 0.006))}px;background:linear-gradient(90deg,transparent,${t.seam} 50%,transparent)"></div>`
    : '';
  const shadow = [
    `0 ${Math.round(sw * 0.018)}px ${Math.round(sw * 0.036)}px ${t.shadow[0]}`,
    `0 ${Math.round(sw * 0.06)}px ${Math.round(sw * 0.12)}px ${t.shadow[1]}`,
  ].join(',');
  const rim = mac ? `0 0 0 1px ${t.hairline},` : '';
  return `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${layout.width}px;height:${layout.height}px;background:transparent;overflow:hidden}
body{position:relative}
.card{position:absolute;left:${layout.margin}px;top:${layout.margin}px;width:${layout.deviceWidth}px;height:${layout.deviceHeight}px;border-radius:${layout.radius}px;overflow:hidden;background:${t.titlebar};box-shadow:${rim}${shadow}}
.bar{display:flex;align-items:center;width:100%;flex:none}
.bar i{display:block;border-radius:50%}
.raw{display:block;width:${sw}px;height:${layout.screenHeight}px}
.seam{position:absolute;top:0;bottom:0;left:50%;transform:translateX(-50%);pointer-events:none}
</style></head><body><div class="card">${mac ? titleStrip(layout, t) : ''}<div style="position:relative"><img class="raw" src="${rawUrl}" alt="">${seam}</div></div></body></html>`;
}
