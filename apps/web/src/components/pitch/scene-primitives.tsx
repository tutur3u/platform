import type { ReactNode } from 'react';

export const colors = [
  'var(--pitch-innovation)',
  'var(--pitch-growth)',
  'var(--pitch-energy)',
  'var(--pitch-impact)',
];
export function Dot({
  x,
  y,
  r = 8,
  tone = 0,
}: {
  x: number;
  y: number;
  r?: number;
  tone?: number;
}) {
  return <circle cx={x} cy={y} r={r} fill={colors[tone % 4]} />;
}
export function Tile({
  x,
  y,
  w = 100,
  h = 65,
  tone = 0,
  children,
}: {
  x: number;
  y: number;
  w?: number;
  h?: number;
  tone?: number;
  children?: ReactNode;
}) {
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx="10"
        fill={colors[tone % 4]}
        fillOpacity=".12"
        stroke={colors[tone % 4]}
        strokeWidth="1.5"
      />
      {children}
    </g>
  );
}
export function Wire({
  d,
  tone = 0,
  dashed = false,
}: {
  d: string;
  tone?: number;
  dashed?: boolean;
}) {
  return (
    <path
      d={d}
      fill="none"
      stroke={colors[tone % 4]}
      strokeWidth="2"
      strokeDasharray={dashed ? '5 7' : undefined}
    />
  );
}
export function Rings({ x, y }: { x: number; y: number }) {
  return (
    <g>
      {[45, 80, 120].map((r, i) => (
        <circle
          key={r}
          cx={x}
          cy={y}
          r={r}
          fill="none"
          stroke={colors[i]}
          strokeOpacity=".4"
        />
      ))}
      <Dot x={x} y={y} r={14} />
    </g>
  );
}
