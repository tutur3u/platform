import {
  WHITEBOARD_HEIGHT,
  WHITEBOARD_MAX_STROKE_POINTS,
  WHITEBOARD_PLAIN_PRESSURE,
  WHITEBOARD_WIDTH,
  type WhiteboardColor,
  type WhiteboardInput,
  type WhiteboardPoint,
  type WhiteboardStroke,
} from './stroke';

export type WhiteboardPointer = {
  pointerId: number;
  pointerType: string;
  /** Monotonic milliseconds, such as `PointerEvent.timeStamp`. */
  time: number;
};

export type WhiteboardPointerSample = WhiteboardPointer & {
  /** Board units. */
  x: number;
  y: number;
  pressure?: number;
  tiltX?: number;
  tiltY?: number;
  button?: number;
};

export type WhiteboardStrokeStyle = { color: WhiteboardColor; width: number };

export type WhiteboardPenInputOptions = {
  authorId: string;
  /** The stroke in progress, or null once it ends. */
  onDraft: (stroke: WhiteboardStroke | null) => void;
  onCommit: (stroke: WhiteboardStroke) => void;
  createId?: () => string;
  /** Epoch milliseconds for `startedAt`. */
  now?: () => number;
  /** How long after the pen was last seen a touch still counts as a palm. */
  palmGraceMs?: number;
};

const PALM_GRACE_MS = 500;
const MIN_POINT_DISTANCE = 1;
const MIN_PRESSURE_CHANGE = 0.04;
const EDGE_SLACK = 4;

type Draft = {
  pointerId: number;
  startTime: number;
  stroke: Omit<WhiteboardStroke, 'points'>;
  points: WhiteboardPoint[];
};

function inputOf(pointerType: string): WhiteboardInput {
  return pointerType === 'pen' || pointerType === 'touch'
    ? pointerType
    : 'mouse';
}

function bounded(value: number | undefined, min: number, max: number) {
  const finite = Number.isFinite(value) ? (value as number) : 0;
  return Math.max(min, Math.min(max, finite));
}

function pointOf(
  sample: WhiteboardPointerSample,
  input: WhiteboardInput,
  startTime: number
): WhiteboardPoint {
  // Only a pen reports pressure and tilt worth keeping.
  const pen = input === 'pen';
  return {
    x: Math.round(bounded(sample.x, 0, WHITEBOARD_WIDTH) * 10) / 10,
    y: Math.round(bounded(sample.y, 0, WHITEBOARD_HEIGHT) * 10) / 10,
    pressure: pen
      ? Math.round(
          bounded(sample.pressure ?? WHITEBOARD_PLAIN_PRESSURE, 0, 1) * 1000
        ) / 1000
      : WHITEBOARD_PLAIN_PRESSURE,
    tiltX: pen ? Math.round(bounded(sample.tiltX, -90, 90)) : 0,
    tiltY: pen ? Math.round(bounded(sample.tiltY, -90, 90)) : 0,
    t: Math.max(0, Math.round(sample.time - startTime)),
  };
}

/** Whether a press lands on the board; a little slack forgives its very edge. */
function onBoard(sample: WhiteboardPointerSample) {
  return (
    sample.x >= -EDGE_SLACK &&
    sample.x <= WHITEBOARD_WIDTH + EDGE_SLACK &&
    sample.y >= -EDGE_SLACK &&
    sample.y <= WHITEBOARD_HEIGHT + EDGE_SLACK
  );
}

function moved(from: WhiteboardPoint, to: WhiteboardPoint) {
  return Math.hypot(to.x - from.x, to.y - from.y) >= MIN_POINT_DISTANCE;
}

/**
 * Turns pointer events into strokes. It holds no DOM state, so the same handler
 * serves the drawing surface and tests.
 */
export function createWhiteboardPenInput(options: WhiteboardPenInputOptions) {
  const createId = options.createId ?? (() => crypto.randomUUID());
  const now = options.now ?? Date.now;
  const palmGraceMs = options.palmGraceMs ?? PALM_GRACE_MS;
  const pensDown = new Set<number>();
  let penSeenAt = Number.NEGATIVE_INFINITY;
  let draft: Draft | null = null;

  const snapshot = (current: Draft): WhiteboardStroke => ({
    ...current.stroke,
    points: current.points.slice(),
  });

  function publish() {
    options.onDraft(draft ? snapshot(draft) : null);
  }

  function seePen(pointer: WhiteboardPointer) {
    if (inputOf(pointer.pointerType) !== 'pen') return false;
    penSeenAt = Math.max(penSeenAt, pointer.time);
    return true;
  }

  function release(pointer: WhiteboardPointer) {
    if (seePen(pointer)) pensDown.delete(pointer.pointerId);
  }

  /** Long strokes continue as a new stroke, so no stroke grows without bound. */
  function split(current: Draft, last: WhiteboardPoint): Draft {
    options.onCommit(snapshot(current));
    return {
      pointerId: current.pointerId,
      startTime: current.startTime + last.t,
      stroke: {
        ...current.stroke,
        id: createId(),
        startedAt: current.stroke.startedAt + last.t,
      },
      points: [{ ...last, t: 0 }],
    };
  }

  return {
    /** Returns whether the pointer started a stroke. */
    down(sample: WhiteboardPointerSample, style: WhiteboardStrokeStyle) {
      const input = inputOf(sample.pointerType);
      if (seePen(sample)) {
        pensDown.add(sample.pointerId);
      } else if (
        input === 'touch' &&
        (pensDown.size > 0 || sample.time - penSeenAt < palmGraceMs)
      ) {
        return false;
      }
      if (
        // A palm that landed before the pen stops drawing.
        (input === 'pen' && draft?.stroke.input === 'touch') ||
        // A repeated down for the drawing pointer means its release was missed.
        draft?.pointerId === sample.pointerId
      ) {
        draft = null;
        publish();
      }
      if (draft || (sample.button ?? 0) !== 0 || !onBoard(sample)) return false;
      draft = {
        pointerId: sample.pointerId,
        startTime: sample.time,
        stroke: {
          id: createId(),
          authorId: options.authorId,
          input,
          color: style.color,
          width: style.width,
          startedAt: now(),
        },
        points: [pointOf(sample, input, sample.time)],
      };
      publish();
      return true;
    },

    /** Accepts every sample of one move, including coalesced ones. */
    move(samples: readonly WhiteboardPointerSample[]) {
      let changed = false;
      for (const sample of samples) {
        // A hovering pen keeps palm rejection active between strokes.
        seePen(sample);
        if (draft?.pointerId !== sample.pointerId) continue;
        const last = draft.points.at(-1);
        if (!last) continue;
        let point = pointOf(sample, draft.stroke.input, draft.startTime);
        if (
          !moved(last, point) &&
          Math.abs(point.pressure - last.pressure) < MIN_PRESSURE_CHANGE
        ) {
          continue;
        }
        if (draft.points.length >= WHITEBOARD_MAX_STROKE_POINTS) {
          draft = split(draft, last);
          point = pointOf(sample, draft.stroke.input, draft.startTime);
        }
        draft.points.push(point);
        changed = true;
      }
      if (changed) publish();
    },

    /** Position is optional so a release always ends the stroke. */
    up(pointer: WhiteboardPointer | WhiteboardPointerSample) {
      release(pointer);
      if (draft?.pointerId !== pointer.pointerId) return;
      const last = draft.points.at(-1);
      if (last && 'x' in pointer) {
        // A lifted pointer reports no pressure; keep the last one it had.
        const point = pointOf(
          { ...pointer, pressure: last.pressure },
          draft.stroke.input,
          draft.startTime
        );
        if (moved(last, point)) draft.points.push(point);
      }
      const stroke = snapshot(draft);
      draft = null;
      options.onCommit(stroke);
      publish();
    },

    /** Discards the stroke in progress for this pointer. */
    cancel(pointer: WhiteboardPointer) {
      release(pointer);
      if (draft?.pointerId !== pointer.pointerId) return;
      draft = null;
      publish();
    },
  };
}

export type WhiteboardPenInput = ReturnType<typeof createWhiteboardPenInput>;
