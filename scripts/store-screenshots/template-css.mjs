// Styles for the composed store images. The page script sets every pixel
// size; the sizes here are in `em` of the element the script sizes.
import { COLORS } from './template-layout.mjs';

export const FONT_CSS_URL =
  'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@600&family=Nunito:wght@800;900&display=block';

export const BASE_CSS = `
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:100%;height:100%;overflow:hidden;background:${COLORS.field}}
body{position:relative;font-family:Nunito,ui-rounded,system-ui,sans-serif;color:${COLORS.ink};-webkit-font-smoothing:antialiased}
.wave{position:absolute;background:${COLORS.wave}}
.caption{position:absolute;display:flex;flex-direction:column}
.overline{display:inline-block;font-family:'JetBrains Mono',ui-monospace,monospace;font-weight:600;text-transform:uppercase;letter-spacing:.1em;line-height:1;color:${COLORS.chipInk};background:${COLORS.white};padding:.42em 1.09em;border-radius:999px;white-space:nowrap;margin-bottom:.73em}
.headline{font-weight:900;letter-spacing:-.04em;line-height:1;text-wrap:balance;color:${COLORS.ink}}
.card{position:absolute;overflow:hidden;background:${COLORS.white}}
.card .raw{display:block;width:100%;height:auto}
.strip{display:flex;align-items:center;background:${COLORS.white}}
.strip i{display:block;border-radius:50%;background:${COLORS.windowDot}}
.card.foldable::after{content:'';position:absolute;top:0;bottom:0;left:50%;width:1.2%;transform:translateX(-50%);background:linear-gradient(90deg,rgba(38,33,43,0),rgba(38,33,43,.14) 50%,rgba(38,33,43,0));pointer-events:none}
.chip{position:absolute;z-index:5;display:flex;align-items:center;white-space:nowrap;font-weight:800;color:${COLORS.wave};background:${COLORS.ink};border-radius:999px;box-shadow:0 .5em 1.2em rgba(38,33,43,.22)}
.chip i{display:block;border-radius:50%;background:${COLORS.dot}}
`;
