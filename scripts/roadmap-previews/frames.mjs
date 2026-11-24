// "Colour field" card: the raw screen inside a frameless white rounded card on
// a transparent canvas, with a two-layer shadow. Geometry scales with the card
// width so every device keeps the same proportions at any output size.
import { sharp } from './lib.mjs';

// Corner radius as a share of the card width.
const RADIUS = {
  phone: 0.05,
  'fold-closed': 0.05,
  tablet: 0.022,
  mac: 0.022,
  'fold-open': 0.022,
};

// Shadow layers as shares of the card width: offset-y, blur, colour.
const SHADOWS = [
  { dy: 0.02, blur: 0.04, color: '38,33,43', opacity: 0.08 },
  { dy: 0.06, blur: 0.12, color: '42,85,168', opacity: 0.22 },
];

const HAIRLINE = '#f0e1dd';
const CREASE = 'rgba(38,33,43,0.08)';

function cardMask(width, height, radius) {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" rx="${radius}" fill="#fff"/></svg>`
  );
}

/**
 * @param {Buffer} png raw viewport capture
 * @param {{width:number,height:number,scale:number,frame:string}} device
 * @param {boolean} dark
 */
export async function composeFrame(png, device, dark) {
  const w = device.width * device.scale;
  const h = device.height * device.scale;
  const radius = Math.round(RADIUS[device.frame] * w);
  const px = device.scale;

  // The shadow reaches `dy + blur` below and `blur` beside and above the card;
  // the blur sigma is half the CSS blur radius.
  const reach = SHADOWS.map((s) => ({
    dy: s.dy * w,
    blur: s.blur * w,
    sigma: (s.blur * w) / 2,
  }));
  const padX = Math.ceil(Math.max(...reach.map((s) => s.blur)));
  const padTop = Math.ceil(Math.max(...reach.map((s) => s.blur - s.dy)));
  const padBottom = Math.ceil(Math.max(...reach.map((s) => s.blur + s.dy)));
  const W = w + padX * 2;
  const H = h + padTop + padBottom;

  const shadows = SHADOWS.map(
    (s, i) =>
      `<filter id="s${i}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${reach[i].sigma}"/></filter><rect x="${padX}" y="${padTop + reach[i].dy}" width="${w}" height="${h}" rx="${radius}" fill="rgb(${s.color})" fill-opacity="${s.opacity}" filter="url(#s${i})"/>`
  ).join('');
  const shadowSvg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${shadows}</svg>`
  );

  const overlays = [];
  if (!dark) {
    overlays.push(
      Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect x="${px / 2}" y="${px / 2}" width="${w - px}" height="${h - px}" rx="${radius}" fill="none" stroke="${HAIRLINE}" stroke-width="${px}"/></svg>`
      )
    );
  }
  if (device.frame === 'fold-open') {
    overlays.push(
      Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect x="${Math.round(w / 2 - px / 2)}" y="0" width="${px}" height="${h}" fill="${CREASE}"/></svg>`
      )
    );
  }

  const card = await sharp({
    create: { width: w, height: h, channels: 4, background: '#ffffff' },
  })
    .composite([
      {
        input: await sharp(png).resize(w, h, { fit: 'fill' }).png().toBuffer(),
      },
      ...overlays.map((input) => ({ input })),
      { input: cardMask(w, h, radius), blend: 'dest-in' },
    ])
    .png()
    .toBuffer();

  return sharp({
    create: {
      width: W,
      height: H,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: shadowSvg }, { input: card, left: padX, top: padTop }])
    .png()
    .toBuffer();
}
