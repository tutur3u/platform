import type { ReactNode } from 'react';
import type messages from '../../../messages/en.json';
import { DiagramMark } from '../capabilities/product-mark';
import { colors } from './scene-primitives';

export type VisualCopy = typeof messages.pitch.visuals;

export function Label({
  x,
  y,
  children,
  size = 13,
  muted = false,
  anchor = 'middle',
}: {
  x: number;
  y: number;
  children: ReactNode;
  size?: number;
  muted?: boolean;
  anchor?: 'start' | 'middle' | 'end';
}) {
  return (
    <text
      x={x}
      y={y}
      fill={muted ? 'var(--muted-foreground)' : 'var(--foreground)'}
      fontSize={size}
      fontWeight={muted ? 400 : 550}
      textAnchor={anchor}
    >
      {children}
    </text>
  );
}

export function Node({
  x,
  y,
  w = 150,
  h = 78,
  label,
  product,
  tone = 0,
  detail,
}: {
  x: number;
  y: number;
  w?: number;
  h?: number;
  label: string;
  product?: string;
  tone?: number;
  detail?: string;
}) {
  const lines = [''];
  const limit = Math.floor((w - 24) / 6);
  for (const word of label.split(' ')) {
    const last = lines.length - 1;
    const candidate = lines[last] ? `${lines[last]} ${word}` : word;
    if (candidate.length > limit && lines[last]) lines.push(word);
    else lines[last] = candidate;
  }
  const baseline = y + (product ? 57 : h / 2 + 4) - (lines.length - 1) * 7;
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={14}
        fill="var(--background)"
        stroke={colors[tone % 4]}
        strokeWidth={1.5}
      />
      <rect
        x={x + 1}
        y={y + 1}
        width={w - 2}
        height={h - 2}
        rx={13}
        fill={colors[tone % 4]}
        fillOpacity=".05"
      />
      {product && (
        <DiagramMark product={product} x={x + w / 2 - 14} y={y + 11} />
      )}
      <Label x={x + w / 2} y={baseline} size={12}>
        {lines.map((line, i) => (
          <tspan key={`${i}-${line}`} x={x + w / 2} y={baseline + i * 14}>
            {line}
          </tspan>
        ))}
      </Label>
      {detail && (
        <Label x={x + w / 2} y={y + h + 19} size={11} muted>
          {detail}
        </Label>
      )}
    </g>
  );
}

/** Right-angle routes stop at node edges; the arrow has an explicit endpoint. */
export function Connector({
  d,
  x,
  y,
  direction = 'right',
  tone = 0,
  dashed = false,
}: {
  d: string;
  x: number;
  y: number;
  direction?: 'right' | 'left' | 'down' | 'up';
  tone?: number;
  dashed?: boolean;
}) {
  const rotation =
    direction === 'down'
      ? 90
      : direction === 'left'
        ? 180
        : direction === 'up'
          ? 270
          : 0;
  return (
    <g
      stroke={colors[tone % 4]}
      strokeWidth={1.8}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} strokeDasharray={dashed ? '4 6' : undefined} />
      <path
        d="m-6-4 6 4-6 4"
        transform={`translate(${x} ${y}) rotate(${rotation})`}
      />
    </g>
  );
}
