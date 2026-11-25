// Styles for the composed store images. The page script sets every pixel
// size; the sizes here are in `em` of the element the script sizes.
import { COLORS } from './template-layout.mjs';

export const FONT_CSS_URL =
  'https://fonts.googleapis.com/css2?family=Nunito:wght@800;900&display=block';

export const BASE_CSS = `
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:100%;height:100%;overflow:hidden;background:${COLORS.field}}
body{position:relative;font-family:Nunito,ui-rounded,system-ui,sans-serif;color:${COLORS.ink};-webkit-font-smoothing:antialiased}
.wave{position:absolute;background:${COLORS.wave}}
.artwork{position:absolute;inset:0;background:linear-gradient(var(--angle),var(--field) 56%,var(--accent))}
/* Printed shapes sit behind the type and untouched app captures. */
.artwork::before,.artwork::after{content:'';position:absolute;pointer-events:none}
.artwork::before{inset:36% -12% -12%;transform:rotate(-12deg)}
.artwork[data-feature="dashboard"]{background:linear-gradient(164deg,var(--field) 0 63%,#b63c2e 64%)}
.artwork[data-feature="dashboard"]::before{inset:24% -36% auto 28%;aspect-ratio:1;border-radius:50%;transform:none;background:repeating-linear-gradient(0deg,var(--accent) 0 4%,transparent 4% 6%)}
.artwork[data-feature="assistant"]::before{inset:28% -42% 19%;transform:rotate(-29deg);border-radius:50%;border:1px solid #f1c5a3;box-shadow:0 12px 0 -1px var(--field),0 13px 0 -1px #ba91c1,0 25px 0 -2px var(--field),0 26px 0 -2px #966ca5}
.artwork[data-feature="calendar"]::before{background:repeating-linear-gradient(90deg,transparent 0 8%,#447e68 8% 8.2%),repeating-linear-gradient(0deg,transparent 0 10%,#447e68 10% 10.25%),var(--accent)}
.artwork[data-feature="calendar"]::after{top:31%;left:7%;width:57%;height:6%;transform:rotate(-12deg);background:#fd9274}
.artwork[data-feature="tasks"]::before{background:repeating-linear-gradient(90deg,#e3efff 0 13%,transparent 13% 16%);opacity:.56;transform:rotate(-10deg)}
.artwork[data-feature="time-tracker"]::before{inset:26% -24% auto 20%;aspect-ratio:1;border-radius:50%;background:repeating-conic-gradient(from -12deg,#905025 0deg 1deg,transparent 1deg 15deg);mask-image:radial-gradient(transparent 0 41%,black 42% 65%,transparent 66%)}
.artwork[data-feature="finance"]::before{background:repeating-linear-gradient(0deg,transparent 0 9%,#a4d4ad 9% 9.4%);opacity:.7}
.artwork[data-feature="habits"]::before{inset:37% -18% -10%;background:radial-gradient(circle,#562a80 0 16%,transparent 17%) 0 0/8vw 8vw;opacity:.34}
.artwork[data-feature="notes"]::before{inset:40% -7% -10% 3%;transform:rotate(9deg);background:repeating-linear-gradient(0deg,#f3c7c7 0 7%,#d590a2 7% 7.2%);box-shadow:1.1vw -1.1vw #a64366}
@media (min-aspect-ratio: 1/1){.artwork[data-feature="notes"]::before{left:36%}}
.artwork[data-feature="dashboard"] .headline,.artwork[data-feature="assistant"] .headline,.artwork[data-feature="notes"] .headline{font-family:Georgia,'Times New Roman',serif;font-weight:700}
.artwork .caption{z-index:4}
.artwork .card{box-shadow:0 .8vw 2.8vw #120d2a38}
.caption{position:absolute;display:flex;flex-direction:column}
.headline{max-width:100%;font-weight:900;letter-spacing:-.04em;line-height:1;text-wrap:balance;color:var(--ink,${COLORS.ink})}
.card{position:absolute;overflow:hidden;background:${COLORS.white}}
.card .raw{display:block;width:100%;height:auto}
.strip{display:flex;align-items:center;background:${COLORS.white}}
.strip.win{justify-content:flex-end;color:#8f8996}
.strip.win b{display:block;position:relative;width:.4em;height:.4em;margin-right:1.1em}
.strip.win b.min{height:0;align-self:center;border-top:.045em solid currentColor}
.strip.win b.max{border:.045em solid currentColor;border-radius:.04em}
.strip.win b.close::before,.strip.win b.close::after{content:'';position:absolute;left:50%;top:50%;width:.56em;border-top:.045em solid currentColor;transform:translate(-50%,-50%) rotate(45deg)}
.strip.win b.close::after{transform:translate(-50%,-50%) rotate(-45deg)}
.strip i{display:block;border-radius:50%;background:${COLORS.windowDot}}
.card.foldable::after{content:'';position:absolute;top:0;bottom:0;left:50%;width:1.2%;transform:translateX(-50%);background:linear-gradient(90deg,rgba(38,33,43,0),rgba(38,33,43,.14) 50%,rgba(38,33,43,0));pointer-events:none}
`;
