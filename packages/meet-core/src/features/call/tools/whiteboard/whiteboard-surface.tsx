'use client';

import { memo, type PointerEvent, useId, useState } from 'react';
import {
  createWhiteboardPenInput,
  type WhiteboardPointer,
  type WhiteboardPointerSample,
} from './pen-input';
import {
  WHITEBOARD_HEIGHT,
  WHITEBOARD_STROKE_WIDTH,
  WHITEBOARD_WIDTH,
  type WhiteboardColor,
  type WhiteboardStroke,
} from './stroke';
import { strokePathChunks } from './stroke-path';
import { appendWhiteboardStroke } from './whiteboard-store';

export const whiteboardInkClass: Record<WhiteboardColor, string> = {
  ink: 'text-foreground',
  blue: 'text-dynamic-blue',
  green: 'text-dynamic-green',
  red: 'text-dynamic-red',
};

/** The visible sheet, inset so its outline is not cut off at the edge. */
const paper = {
  x: 2,
  y: 2,
  width: WHITEBOARD_WIDTH - 4,
  height: WHITEBOARD_HEIGHT - 4,
  rx: 32,
};

type SurfaceEvent = PointerEvent<SVGSVGElement>;

function pointerOf(event: SurfaceEvent): WhiteboardPointer {
  return {
    pointerId: event.pointerId,
    pointerType: event.pointerType,
    time: event.timeStamp,
  };
}

/** Every position the pointer reported for this event, in board units. */
function samplesOf(event: SurfaceEvent): WhiteboardPointerSample[] {
  const box = event.currentTarget.getBoundingClientRect();
  const scale = Math.min(
    box.width / WHITEBOARD_WIDTH,
    box.height / WHITEBOARD_HEIGHT
  );
  if (!(scale > 0)) return [];
  const left = box.left + (box.width - WHITEBOARD_WIDTH * scale) / 2;
  const top = box.top + (box.height - WHITEBOARD_HEIGHT * scale) / 2;
  const native = event.nativeEvent;
  // A pen reports faster than the screen refreshes; keep the points in between.
  const coalesced =
    event.type === 'pointermove' ? (native.getCoalescedEvents?.() ?? []) : [];
  return (coalesced.length > 0 ? coalesced : [native]).map((entry) => ({
    ...pointerOf(event),
    time: entry.timeStamp,
    x: (entry.clientX - left) / scale,
    y: (entry.clientY - top) / scale,
    pressure: entry.pressure,
    tiltX: entry.tiltX,
    tiltY: entry.tiltY,
    button: native.button,
  }));
}

const StrokeShape = memo(function StrokeShape({
  stroke,
}: {
  stroke: WhiteboardStroke;
}) {
  return (
    <g className={whiteboardInkClass[stroke.color]} fill="currentColor">
      {strokePathChunks(stroke.points, stroke.width).map((data, chunk) => (
        // Chunks never reorder: a stroke only grows at its end.
        <path key={chunk} d={data} />
      ))}
    </g>
  );
});

/**
 * The board and its pointer handling. Give it a `key` of the meeting and author:
 * its pen keeps the ones it started with.
 */
export function WhiteboardSurface({
  meetingId,
  authorId,
  color,
  label,
  strokes,
}: {
  meetingId: string;
  authorId: string;
  color: WhiteboardColor;
  label: string;
  strokes: readonly WhiteboardStroke[];
}) {
  const paperId = useId();
  const [draft, setDraft] = useState<WhiteboardStroke | null>(null);
  const [pen] = useState(() =>
    createWhiteboardPenInput({
      authorId,
      onDraft: setDraft,
      onCommit: (stroke) => appendWhiteboardStroke(meetingId, stroke),
    })
  );

  const start = (event: SurfaceEvent) => {
    const [sample] = samplesOf(event);
    if (!sample) return;
    if (!pen.down(sample, { color, width: WHITEBOARD_STROKE_WIDTH })) return;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // The stroke still follows the pointer while it stays over the board.
    }
  };

  // A stroke can reach the board a render before its draft clears.
  const live =
    draft && strokes.every((stroke) => stroke.id !== draft.id) ? draft : null;

  return (
    // A short panel squeezes this box. The board inside keeps its shape, so it
    // is drawn in the picture rather than as the element's own border.
    <div className="relative aspect-4/3 min-h-40 w-full shrink">
      <svg
        role="img"
        aria-label={label}
        className="absolute inset-0 size-full cursor-crosshair touch-none select-none"
        viewBox={`0 0 ${WHITEBOARD_WIDTH} ${WHITEBOARD_HEIGHT}`}
        onPointerDown={start}
        onPointerMove={(event) => pen.move(samplesOf(event))}
        onPointerUp={(event) => pen.up(samplesOf(event)[0] ?? pointerOf(event))}
        onPointerCancel={(event) => pen.cancel(pointerOf(event))}
        onLostPointerCapture={(event) => pen.cancel(pointerOf(event))}
      >
        <defs>
          <clipPath id={paperId}>
            <rect {...paper} />
          </clipPath>
        </defs>
        <rect
          {...paper}
          className="fill-card stroke-border"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
        <g clipPath={`url(#${paperId})`}>
          {(live ? [...strokes, live] : strokes).map((stroke) => (
            <StrokeShape key={stroke.id} stroke={stroke} />
          ))}
        </g>
      </svg>
    </div>
  );
}
