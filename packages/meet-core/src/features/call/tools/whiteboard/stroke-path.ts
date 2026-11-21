import { pressureWidth, type WhiteboardPoint } from './stroke';

const CHUNK_POINTS = 64;

const n = (value: number) => String(Math.round(value * 100) / 100);

/** A filled disc at one point. Its winding matches `link`, so the two merge. */
function dot(point: WhiteboardPoint, radius: number) {
  // Round the radius before doubling it. An arc whose radius is even a hair
  // over half its span is drawn off-centre, which shows as a bump on the edge.
  const r = Math.round(radius * 100) / 100;
  const half = `a${r} ${r} 0 1 0 `;
  return `M${n(point.x - r)} ${n(point.y)}${half}${n(r * 2)} 0${half}${n(r * -2)} 0z`;
}

/**
 * The tapered body between two neighbouring points: the band between the two
 * lines that touch both discs, so the outline stays smooth as width changes.
 */
function link(
  from: WhiteboardPoint,
  fromRadius: number,
  to: WhiteboardPoint,
  toRadius: number
) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return '';
  const taper = (fromRadius - toRadius) / length;
  // One disc already covers the other.
  if (Math.abs(taper) >= 1) return '';
  const spread = Math.sqrt(1 - taper * taper);
  const ux = dx / length;
  const uy = dy / length;
  // Directions from each centre to where the two lines touch its disc.
  const ax = ux * taper - uy * spread;
  const ay = uy * taper + ux * spread;
  const bx = ux * taper + uy * spread;
  const by = uy * taper - ux * spread;
  return (
    `M${n(from.x + ax * fromRadius)} ${n(from.y + ay * fromRadius)}` +
    `L${n(to.x + ax * toRadius)} ${n(to.y + ay * toRadius)}` +
    `L${n(to.x + bx * toRadius)} ${n(to.y + by * toRadius)}` +
    `L${n(from.x + bx * fromRadius)} ${n(from.y + by * fromRadius)}z`
  );
}

/**
 * SVG path data for a pressure-sensitive stroke, as filled shapes rather than
 * one stroked line, because the width changes along it. Points are grouped in
 * chunks so a growing stroke only rewrites its last chunk.
 */
export function strokePathChunks(
  points: readonly WhiteboardPoint[],
  width: number,
  chunkPoints = CHUNK_POINTS
) {
  const chunks: string[] = [];
  for (let start = 0; start < points.length; start += chunkPoints) {
    const end = Math.min(start + chunkPoints, points.length);
    let data = '';
    for (let index = start; index < end; index++) {
      const point = points[index];
      if (!point) continue;
      const radius = pressureWidth(width, point.pressure) / 2;
      data += dot(point, radius);
      const next = points[index + 1];
      if (next) {
        data += link(
          point,
          radius,
          next,
          pressureWidth(width, next.pressure) / 2
        );
      }
    }
    chunks.push(data);
  }
  return chunks;
}
