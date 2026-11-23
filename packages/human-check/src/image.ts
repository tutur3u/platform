import type { Random } from './random';

export const CANVAS_WIDTH = 320;
export const CANVAS_HEIGHT = 160;
/** Square body edge and knob radius of the jigsaw piece. */
const BODY = 44;
const KNOB = 8;
/** Piece image size: body plus one knob on the right and one on top. */
export const PIECE_SIZE = BODY + KNOB + 2;

export type PieceShape = 'top-right' | 'bottom-right' | 'top-left';

/** Whether a pixel of the piece box belongs to the piece. */
export function insidePiece(shape: PieceShape, px: number, py: number) {
  const x = px - 1;
  const y = py - (KNOB + 1);
  const body = x >= 0 && x < BODY && y >= 0 && y < BODY;
  const knob = (cx: number, cy: number) =>
    (x - cx) ** 2 + (y - cy) ** 2 <= KNOB ** 2;
  if (shape === 'top-right')
    return body || knob(BODY, BODY / 2) || knob(BODY / 2, 0);
  if (shape === 'bottom-right')
    return (body && !knob(BODY / 2, BODY)) || knob(BODY, BODY / 2);
  return (body && !knob(0, BODY / 2)) || knob(BODY / 2, 0);
}

function edge(shape: PieceShape, px: number, py: number) {
  if (!insidePiece(shape, px, py)) return false;
  return (
    !insidePiece(shape, px - 1, py) ||
    !insidePiece(shape, px + 1, py) ||
    !insidePiece(shape, px, py - 1) ||
    !insidePiece(shape, px, py + 1)
  );
}

type Rgb = [number, number, number];

function color(random: Random): Rgb {
  const hue = random.next() * 360;
  const sat = 0.35 + random.next() * 0.4;
  const light = 0.38 + random.next() * 0.3;
  const f = (n: number) => {
    const k = (n + hue / 30) % 12;
    const a = sat * Math.min(light, 1 - light);
    return Math.round(
      255 * (light - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))
    );
  };
  return [f(0), f(8), f(4)];
}

/** Procedural background: gradient, soft blobs and per-pixel noise. */
export function renderBackground(random: Random): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(CANVAS_WIDTH * CANVAS_HEIGHT * 4);
  const [from, to] = [color(random), color(random)];
  const angle = random.next() * Math.PI * 2;
  const [dx, dy] = [Math.cos(angle), Math.sin(angle)];
  const blobs = Array.from({ length: random.int(6, 10) }, () => ({
    x: random.next() * CANVAS_WIDTH,
    y: random.next() * CANVAS_HEIGHT,
    r: 18 + random.next() * 60,
    c: color(random),
    a: 0.25 + random.next() * 0.3,
  }));
  for (let y = 0; y < CANVAS_HEIGHT; y += 1)
    for (let x = 0; x < CANVAS_WIDTH; x += 1) {
      const t = Math.min(
        1,
        Math.max(
          0,
          0.5 + ((x / CANVAS_WIDTH - 0.5) * dx + (y / CANVAS_HEIGHT - 0.5) * dy)
        )
      );
      let rgb: Rgb = [0, 1, 2].map(
        (i) => from[i]! + (to[i]! - from[i]!) * t
      ) as Rgb;
      for (const blob of blobs) {
        const d = Math.hypot(x - blob.x, y - blob.y);
        if (d >= blob.r) continue;
        const a = blob.a * (1 - d / blob.r);
        rgb = rgb.map((v, i) => v * (1 - a) + blob.c[i]! * a) as Rgb;
      }
      const noise = (random.next() - 0.5) * 22;
      const o = (y * CANVAS_WIDTH + x) * 4;
      pixels[o] = rgb[0] + noise;
      pixels[o + 1] = rgb[1] + noise;
      pixels[o + 2] = rgb[2] + noise;
      pixels[o + 3] = 255;
    }
  return pixels;
}

/** Darkens a piece-shaped cutout with a light rim into the background. */
export function carveCutout(
  pixels: Uint8ClampedArray,
  shape: PieceShape,
  left: number,
  top: number,
  darkness: number
) {
  for (let py = 0; py < PIECE_SIZE; py += 1)
    for (let px = 0; px < PIECE_SIZE; px += 1) {
      if (!insidePiece(shape, px, py)) continue;
      const x = left + px;
      const y = top + py;
      if (x < 0 || y < 0 || x >= CANVAS_WIDTH || y >= CANVAS_HEIGHT) continue;
      const o = (y * CANVAS_WIDTH + x) * 4;
      const rim = edge(shape, px, py);
      for (let i = 0; i < 3; i += 1)
        pixels[o + i] = rim
          ? pixels[o + i]! * 0.3 + 235 * 0.7
          : pixels[o + i]! * darkness;
    }
}

/** The piece image: the untouched background under the slot, outlined. */
export function cutPiece(
  background: Uint8ClampedArray,
  shape: PieceShape,
  left: number,
  top: number
): Uint8ClampedArray {
  const piece = new Uint8ClampedArray(PIECE_SIZE * PIECE_SIZE * 4);
  for (let py = 0; py < PIECE_SIZE; py += 1)
    for (let px = 0; px < PIECE_SIZE; px += 1) {
      if (!insidePiece(shape, px, py)) continue;
      const src = ((top + py) * CANVAS_WIDTH + left + px) * 4;
      const dst = (py * PIECE_SIZE + px) * 4;
      const rim = edge(shape, px, py);
      for (let i = 0; i < 3; i += 1)
        piece[dst + i] = rim ? 250 : background[src + i]!;
      piece[dst + 3] = 255;
    }
  return piece;
}
