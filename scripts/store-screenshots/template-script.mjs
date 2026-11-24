// The in-page layout pass. compose.mjs calls `window.__layout(spec)` after
// loading the HTML: it sizes the caption to fit its lines, places the cards
// and the wave, and returns the measured caption box for layout-report.json.
// Page pieces are marked `.caption`, `.card` (data-card), `.wave`
// (data-wave) and `.chip` (data-chip); a page may omit any of them.
export const LAYOUT_SCRIPT = `
window.__layout = async (spec) => {
  const W = spec.width, H = spec.height, cq = spec.cq;
  const cap = document.querySelector('.caption');
  const head = cap && cap.querySelector('.headline');
  const over = cap && cap.querySelector('.overline');
  if (head) {
    await Promise.all([
      document.fonts.load('900 40px Nunito', head.textContent),
      document.fonts.load('600 20px "JetBrains Mono"', over.textContent),
    ]);
  }
  await document.fonts.ready;
  const fontsLoaded = !head || (
    document.fonts.check('900 40px Nunito', head.textContent) &&
    document.fonts.check('600 20px "JetBrains Mono"', over.textContent)
  );

  const result = { fontsLoaded, caption: null, headline: null, card: null, chip: null };
  let capBottom = 0;
  if (cap) {
    const c = spec.caption;
    cap.style.left = c.x + 'px';
    cap.style.width = c.w + 'px';
    cap.style.alignItems = c.align === 'center' ? 'center' : 'flex-start';
    cap.style.textAlign = c.align;
    over.style.fontSize = c.overline + 'px';
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
    cap.style.top = (c.centerAt != null ? c.centerAt * H - capHeight / 2 : c.y) + 'px';
    const range = document.createRange();
    range.selectNodeContents(head);
    const text = range.getBoundingClientRect();
    const tag = over.getBoundingClientRect();
    const left = Math.min(text.left, tag.left), top = Math.min(text.top, tag.top);
    const right = Math.max(text.right, tag.right), bottom = Math.max(text.bottom, tag.bottom);
    result.caption = { x: left, y: top, width: right - left, height: bottom - top };
    result.headline = { fontSize: size, lines: lineCount() };
    capBottom = bottom;
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

  const chip = document.querySelector('.chip');
  if (chip && result.card) {
    // The chip is sized from the card's own text (the height of its "Done"
    // label) and kept clear of that label.
    const a = JSON.parse(chip.dataset.chip);
    const card = result.card;
    const labelHeight = a.done.h * card.imageHeight;
    const right = card.x + (a.details.x + a.details.w) * card.width;
    const labelRight = card.x + (a.done.x + a.done.w) * card.width;
    const available = right - labelRight - 2 * cq;
    chip.style.padding = '0.38em 0.9em';
    chip.style.gap = '0.5em';
    const dot = chip.querySelector('i');
    dot.style.width = dot.style.height = '0.5em';
    chip.style.fontSize = '100px';
    const natural = chip.getBoundingClientRect().width / 100;
    const size = Math.min(Math.max(labelHeight * 1.05, 2.6 * cq), available / natural);
    chip.style.fontSize = size + 'px';
    const box = chip.getBoundingClientRect();
    chip.style.left = right - box.width + 'px';
    // The chip's bottom meets the label's pill, so it never reaches the next row.
    const pillBottom = card.imageTop + (a.done.y + a.done.h / 2) * card.imageHeight + labelHeight * 0.95;
    // ...and it stays inside the card, whatever the label's position.
    const top = Math.min(
      Math.max(pillBottom - box.height, card.y + cq),
      card.y + card.height - box.height - cq
    );
    chip.style.top = top + 'px';
    const placed = chip.getBoundingClientRect();
    result.chip = { x: placed.left, y: placed.top, width: placed.width, height: placed.height, fontSize: size };
  }
  return result;
};`;
