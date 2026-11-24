// Composes a raw viewport capture inside a generic device frame on a
// transparent canvas. Geometry is expressed in CSS pixels and multiplied by
// the capture scale so every frame stays crisp at any output size.
import { sharp } from './lib.mjs';

const esc = (n) => Math.round(n * 100) / 100;

function roundedMask(width, height, radii) {
  const [tl, tr, br, bl] = radii;
  const d = `M${tl} 0H${width - tr}A${tr} ${tr} 0 0 1 ${width} ${tr}V${height - br}A${br} ${br} 0 0 1 ${width - br} ${height}H${bl}A${bl} ${bl} 0 0 1 0 ${height - bl}V${tl}A${tl} ${tl} 0 0 1 ${tl} 0Z`;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><path d="${d}" fill="#fff"/></svg>`
  );
}

async function clip(png, width, height, radii) {
  return sharp(png)
    .resize(width, height, { fit: 'fill' })
    .ensureAlpha()
    .composite([{ input: roundedMask(width, height, radii), blend: 'dest-in' }])
    .png()
    .toBuffer();
}

function shadowSvg(w, h, x, y, bw, bh, radius, blur, offsetY, opacity) {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><filter id="b" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${blur}"/></filter></defs><rect x="${x}" y="${y + offsetY}" width="${bw}" height="${bh}" rx="${radius}" fill="#000" fill-opacity="${opacity}" filter="url(#b)"/></svg>`
  );
}

async function topColor(png) {
  const { data } = await sharp(png)
    .extract({ left: 4, top: 4, width: 1, height: 1 })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return `rgb(${data[0]},${data[1]},${data[2]})`;
}

/** macOS-style window: title bar with traffic lights, soft shadow. */
async function macFrame(png, w, h, s, dark) {
  const pad = 56 * s;
  const bar = 34 * s;
  const radius = 12 * s;
  const W = w + pad * 2;
  const H = h + bar + pad * 2;
  const bg = await topColor(png);
  const hair = dark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.12)';
  const dots = [
    ['#ff5f57', 20],
    ['#febc2e', 40],
    ['#28c840', 60],
  ]
    .map(
      ([c, x]) =>
        `<circle cx="${esc(x * s)}" cy="${esc(bar / 2)}" r="${esc(6 * s)}" fill="${c}"/>`
    )
    .join('');
  const barSvg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${bar}"><path d="M0 ${bar}V${radius}A${radius} ${radius} 0 0 1 ${radius} 0H${w - radius}A${radius} ${radius} 0 0 1 ${w} ${radius}V${bar}Z" fill="${bg}"/><rect x="0" y="${bar - 1}" width="${w}" height="${Math.max(1, s)}" fill="${hair}"/>${dots}</svg>`
  );
  const content = await clip(png, w, h, [0, 0, radius, radius]);
  const outline = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect x="${pad + 0.5}" y="${pad + 0.5}" width="${w - 1}" height="${h + bar - 1}" rx="${radius}" fill="none" stroke="${hair}" stroke-width="${s}"/></svg>`
  );
  return sharp({
    create: {
      width: W,
      height: H,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      {
        input: shadowSvg(
          W,
          H,
          pad,
          pad,
          w,
          h + bar,
          radius,
          22 * s,
          14 * s,
          dark ? 0.55 : 0.28
        ),
      },
      { input: barSvg, left: pad, top: pad },
      { input: content, left: pad, top: pad + bar },
      { input: outline },
    ])
    .png()
    .toBuffer();
}

/** Rounded bezel for phones, tablets and the dual-screen device. */
async function deviceFrame(png, w, h, s, dark, opts) {
  const { bezel, outer, inner, seam } = opts;
  const pad = 40 * s;
  const b = bezel * s;
  const W = w + (b + pad) * 2;
  const H = h + (b + pad) * 2;
  const left = pad + b;
  const top = pad + b;
  const bodyW = w + b * 2;
  const bodyH = h + b * 2;
  const body = dark ? '#0b0b0d' : '#16161a';
  const rim = dark ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.35)';
  const bodySvg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect x="${pad}" y="${pad}" width="${bodyW}" height="${bodyH}" rx="${outer * s}" fill="${body}"/><rect x="${pad + s / 2}" y="${pad + s / 2}" width="${bodyW - s}" height="${bodyH - s}" rx="${outer * s}" fill="none" stroke="${rim}" stroke-width="${s}"/></svg>`
  );
  const layers = [
    {
      input: shadowSvg(
        W,
        H,
        pad,
        pad,
        bodyW,
        bodyH,
        outer * s,
        20 * s,
        12 * s,
        dark ? 0.6 : 0.3
      ),
    },
    { input: bodySvg },
    {
      input: await clip(png, w, h, [
        inner * s,
        inner * s,
        inner * s,
        inner * s,
      ]),
      left,
      top,
    },
  ];
  if (seam) {
    const sw = 7 * s;
    const x = left + w / 2 - sw / 2;
    layers.push({
      input: Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${sw}" height="${h}"><defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="0.5" stop-color="#000" stop-opacity="0.2"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient></defs><rect width="${sw}" height="${h}" fill="url(#g)"/></svg>`
      ),
      left: Math.round(x),
      top,
    });
  }
  return sharp({
    create: {
      width: W,
      height: H,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(layers)
    .png()
    .toBuffer();
}

const FRAMES = {
  phone: { bezel: 11, outer: 58, inner: 47 },
  tablet: { bezel: 16, outer: 40, inner: 26 },
  'fold-closed': { bezel: 10, outer: 46, inner: 36 },
  'fold-open': { bezel: 12, outer: 34, inner: 22 },
};

/**
 * @param {Buffer} png raw viewport capture
 * @param {{width:number,height:number,scale:number,frame:string}} device
 * @param {boolean} dark
 */
export async function composeFrame(png, device, dark) {
  const w = device.width * device.scale;
  const h = device.height * device.scale;
  if (device.frame === 'mac') return macFrame(png, w, h, device.scale, dark);
  const spec = { ...FRAMES[device.frame] };
  spec.seam = device.frame === 'fold-open';
  return deviceFrame(png, w, h, device.scale, dark, spec);
}
