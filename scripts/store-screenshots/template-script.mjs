// The in-page layout pass. compose.mjs calls `window.__layout(spec)` after
// loading the HTML: it sizes the caption to fit its lines, places the cards
// and the wave, and returns the measured caption box for layout-report.json.
// Page pieces are marked `.caption`, `.card` (data-card), `.wave`
// (data-wave); a page may omit any of them.
export const LAYOUT_SCRIPT = `
window.__layout = async (spec) => {
  const W = spec.width, H = spec.height, cq = spec.cq;
  const cap = document.querySelector('.caption');
  const head = cap && cap.querySelector('.headline');
  if (head) await document.fonts.load('900 40px Nunito', head.textContent);
  await document.fonts.ready;
  const fontsLoaded = !head || document.fonts.check('900 40px Nunito', head.textContent);

  const result = { fontsLoaded, caption: null, headline: null, card: null };
  let capBottom = 0;
  if (cap) {
    const c = spec.caption;
    cap.style.left = c.x + 'px';
    cap.style.width = c.w + 'px';
    cap.style.alignItems = c.align === 'center' ? 'center' : 'flex-start';
    cap.style.textAlign = c.align;
    let size = c.headline;
    head.style.fontSize = size + 'px';
    const lineCount = () =>
      Math.round(head.getBoundingClientRect().height / parseFloat(getComputedStyle(head).lineHeight));
    while (lineCount() > spec.maxLines && size > spec.minHeadline * 0.5) {
      size -= 1;
      head.style.fontSize = size + 'px';
    }
    cap.style.top = '0px';
    const capHeight = cap.getBoundingClientRect().height;
    cap.style.top = (c.centerAt != null ? c.centerAt * H - capHeight / 2 : Math.max(c.y, H * 0.068)) + 'px';
    const range = document.createRange();
    range.selectNodeContents(head);
    const text = range.getBoundingClientRect();
    result.caption = { x: text.left, y: text.top, width: text.width, height: text.height };
    result.headline = { fontSize: size, lines: lineCount() };
    capBottom = text.bottom;
  }

  let mainY = 0;
  for (const el of document.querySelectorAll('.card')) {
    const c = JSON.parse(el.dataset.card);
    const img = el.querySelector('img.raw');
    await img.decode();
    const strip = el.querySelector('.strip');
    const stripH = strip ? c.w * 0.034 : 0;
    const h = (img.naturalHeight / img.naturalWidth) * c.w * (c.crop || 1) + stripH;
    let y = c.yMode === 'capBottom' ? capBottom + c.gap : c.yMode === 'bottom' ? H - h * (1 - c.bleed) : c.yMode === 'center' ? (H - h) / 2 : c.y;
    y += c.dy || 0;
    Object.assign(el.style, {
      left: c.x + 'px', top: y + 'px', width: c.w + 'px', height: h + 'px',
      borderRadius: c.radius + 'px', zIndex: c.z, transform: 'rotate(' + (c.rotate || 0) + 'deg)',
      boxShadow: '0 ' + 2 * cq + 'px ' + 4 * cq + 'px rgba(38,33,43,.08), 0 ' + 10 * cq + 'px ' + 20 * cq + 'px rgba(42,85,168,.22)',
    });
    if (strip) {
      strip.style.height = stripH + 'px';
      if (strip.classList.contains('win')) {
        strip.style.fontSize = stripH + 'px';
        // A card that bleeds off the canvas edge keeps its controls in view.
        strip.style.paddingRight = Math.max(0, c.x + c.w - W) + 'px';
      } else {
        strip.style.paddingLeft = stripH * 0.6 + 'px';
        strip.style.gap = stripH * 0.3 + 'px';
        for (const dot of strip.children) dot.style.width = dot.style.height = stripH * 0.36 + 'px';
      }
    }
    if (c.main) {
      mainY = y;
      result.card = { x: c.x, y, width: c.w, height: h, imageTop: y + stripH, imageHeight: (h - stripH) / (c.crop || 1) };
    }
  }

  const wave = document.querySelector('.wave');
  if (wave) {
    const w = JSON.parse(wave.dataset.wave);
    let crest = w.mode === 'card' ? mainY + w.value * cq : H - w.value * cq;
    if (w.mode === 'height') {
      crest = Math.min(Math.max(crest, capBottom + 4 * cq), mainY + 40 * cq);
    }
    crest += w.offset * cq;
    const height = H - crest + 2 * cq;
    wave.style.left = -10 * cq + 'px';
    wave.style.width = W + 20 * cq + 'px';
    wave.style.top = crest + 'px';
    wave.style.height = height + 'px';
    wave.style.borderRadius = '50% 50% 0 0 / ' + Math.min(22 * cq, height * 0.6) + 'px ' + Math.min(22 * cq, height * 0.6) + 'px 0 0';
  }

  return result;
};`;
