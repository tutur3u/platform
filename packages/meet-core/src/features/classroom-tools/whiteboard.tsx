'use client';

import {
  PenTool,
  Square,
  StickyNote,
  Trash2,
  Type,
  Undo2,
} from '@tuturuuu/icons';
import {
  type BoardItem,
  type BoardPoint,
  boardColors,
  BOARD_HEIGHT,
  BOARD_WIDTH,
  MAX_STROKE_POINTS,
} from '@tuturuuu/realtime/meet/classroom-tools-schema';
import type { WhiteboardView } from '@tuturuuu/realtime/meet/room-whiteboard';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { type PointerEvent, useRef, useState } from 'react';

const colors: Record<BoardItem['color'], string> = {
  ink: 'text-foreground',
  blue: 'text-dynamic-blue',
  green: 'text-dynamic-green',
  red: 'text-dynamic-red',
};
const tools = [
  { id: 'stroke', icon: PenTool },
  { id: 'shape', icon: Square },
  { id: 'sticky', icon: StickyNote },
  { id: 'text', icon: Type },
] as const;

type Draft = { pointerId: number; points: BoardPoint[]; width: number };

function addPoint(points: BoardPoint[], point: BoardPoint) {
  const last = points.at(-1);
  if (last?.[0] === point[0] && last[1] === point[1]) return points;
  // Keep both ends and retain the full shape when a long stroke reaches the cap.
  const sampled =
    points.length === MAX_STROKE_POINTS
      ? points.filter((_, index) => index % 2 === 0)
      : points;
  return [...sampled, point];
}

function plot(event: PointerEvent<SVGSVGElement>): BoardPoint | null {
  const svg = event.currentTarget;
  const matrix = svg.getScreenCTM();
  if (!matrix) return null;
  const point = svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  const { x, y } = point.matrixTransform(matrix.inverse());
  return [
    Math.round(Math.max(0, Math.min(BOARD_WIDTH, x))),
    Math.round(Math.max(0, Math.min(BOARD_HEIGHT, y))),
  ];
}

export function Whiteboard({
  view,
  busy,
  onDraw,
  onUndo,
  onClear,
}: {
  view: WhiteboardView & { items: BoardItem[] };
  busy: boolean;
  onDraw: (item: BoardItem) => void;
  onUndo: () => void;
  onClear: () => void;
}) {
  const t = useTranslations('meet.classroom_tools.whiteboard');
  const [tool, setTool] = useState<BoardItem['kind']>('stroke');
  const [color, setColor] = useState<BoardItem['color']>('ink');
  const [label, setLabel] = useState('');
  const [preview, setPreview] = useState<Draft | null>(null);
  const draft = useRef<Draft | null>(null);
  const penSeenAt = useRef(-Infinity);

  function update(next: Draft | null) {
    draft.current = next;
    setPreview(next);
  }

  function start(event: PointerEvent<SVGSVGElement>) {
    if (event.pointerType === 'pen') penSeenAt.current = performance.now();
    if (
      busy ||
      draft.current ||
      !event.isPrimary ||
      event.button !== 0 ||
      (event.pointerType === 'touch' &&
        performance.now() - penSeenAt.current < 700)
    )
      return;
    const point = plot(event);
    if (!point) return;
    const [x, y] = point;
    const id = crypto.randomUUID();
    switch (tool) {
      case 'stroke':
        event.currentTarget.setPointerCapture(event.pointerId);
        update({
          pointerId: event.pointerId,
          points: [point],
          width: event.pointerType === 'pen' ? 1 + event.pressure * 7 : 3,
        });
        return;
      case 'shape':
        onDraw({ kind: tool, id, color, x, y });
        return;
      default:
        if (label.trim()) {
          onDraw({ kind: tool, id, color, x, y, label });
          setLabel('');
        }
    }
  }

  function move(event: PointerEvent<SVGSVGElement>) {
    if (event.pointerType === 'pen') penSeenAt.current = performance.now();
    const current = draft.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const point = plot(event);
    if (point) update({ ...current, points: addPoint(current.points, point) });
  }

  function end(event: PointerEvent<SVGSVGElement>, save: boolean) {
    const current = draft.current;
    if (!current || current.pointerId !== event.pointerId) return;
    update(null);
    if (!save || busy) return;
    const point = plot(event);
    onDraw({
      kind: 'stroke',
      id: crypto.randomUUID(),
      color,
      width: current.width,
      points: point ? addPoint(current.points, point) : current.points,
    });
  }

  return (
    <div className="grid gap-3">
      <div
        role="group"
        aria-label={t('drawing_tools')}
        className="flex flex-wrap items-center gap-1"
      >
        {tools.map(({ id, icon: Icon }) => (
          <Button
            key={id}
            type="button"
            size="icon"
            variant={tool === id ? 'secondary' : 'ghost'}
            aria-label={t(id)}
            title={t(id)}
            aria-pressed={tool === id}
            disabled={!!preview || busy}
            onClick={() => setTool(id)}
          >
            <Icon />
          </Button>
        ))}
        {boardColors.map((id) => (
          <Button
            key={id}
            type="button"
            size="icon"
            variant={color === id ? 'secondary' : 'ghost'}
            aria-label={t(`color_${id}`)}
            title={t(`color_${id}`)}
            aria-pressed={color === id}
            disabled={!!preview || busy}
            onClick={() => setColor(id)}
          >
            <span
              className={cn('size-3 rounded-full bg-current', colors[id])}
            />
          </Button>
        ))}
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label={t('undo')}
          title={t('undo')}
          disabled={!view.canUndo || busy || !!preview}
          onClick={onUndo}
        >
          <Undo2 />
        </Button>
        {view.canClear && (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label={t('clear')}
            title={t('clear')}
            disabled={busy || !!preview}
            onClick={onClear}
          >
            <Trash2 />
          </Button>
        )}
      </div>
      {(tool === 'sticky' || tool === 'text') && (
        <Input
          aria-label={t('label')}
          placeholder={t('label_placeholder')}
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          maxLength={60}
        />
      )}
      <svg
        aria-label={t('drawing_surface')}
        className="aspect-[900/460] w-full touch-none select-none rounded-md border bg-muted/30"
        viewBox={`0 0 ${BOARD_WIDTH} ${BOARD_HEIGHT}`}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={(event) => end(event, true)}
        onPointerCancel={(event) => end(event, false)}
        onLostPointerCapture={(event) => end(event, false)}
      >
        {view.items.map((item) => (
          <Drawing key={item.id} item={item} />
        ))}
        {preview && (
          <Drawing
            item={{
              kind: 'stroke',
              id: 'preview',
              color,
              points: preview.points,
              width: preview.width,
            }}
          />
        )}
      </svg>
    </div>
  );
}

function Drawing({ item }: { item: BoardItem }) {
  const className = colors[item.color];
  if (item.kind === 'stroke') {
    const [first] = item.points;
    if (item.points.length === 1 && first)
      return (
        <circle
          className={className}
          fill="currentColor"
          cx={first[0]}
          cy={first[1]}
          r={item.width / 2}
        />
      );
    return (
      <polyline
        className={className}
        fill="none"
        stroke="currentColor"
        strokeWidth={item.width}
        strokeLinecap="round"
        strokeLinejoin="round"
        points={item.points.map(([x, y]) => `${x},${y}`).join(' ')}
      />
    );
  }
  const x = Math.min(item.x, BOARD_WIDTH - 168);
  const y = Math.min(item.y, BOARD_HEIGHT - 52);
  return (
    <g className={className}>
      {item.kind !== 'text' && (
        <rect
          x={x}
          y={y}
          width={item.kind === 'shape' ? 116 : 168}
          height="48"
          rx="5"
          fill={item.kind === 'sticky' ? 'currentColor' : 'none'}
          fillOpacity="0.15"
          stroke="currentColor"
          strokeWidth="2"
        />
      )}
      {item.kind !== 'shape' && (
        <svg x={x + 8} y={y} width={152} height={48}>
          <title>{item.label}</title>
          <text x={0} y={30} fontSize="16" fill="currentColor">
            {item.label}
          </text>
        </svg>
      )}
    </g>
  );
}
