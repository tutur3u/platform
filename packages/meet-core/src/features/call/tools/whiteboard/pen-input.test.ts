import { expect, it } from 'vitest';
import {
  createWhiteboardPenInput,
  type WhiteboardPointerSample,
} from './pen-input';
import {
  pressureWidth,
  WHITEBOARD_HEIGHT,
  WHITEBOARD_MAX_STROKE_POINTS,
  WHITEBOARD_WIDTH,
  type WhiteboardStroke,
} from './stroke';

const style = { color: 'blue', width: 6 } as const;

function board() {
  const committed: WhiteboardStroke[] = [];
  const drafts: (WhiteboardStroke | null)[] = [];
  let ids = 0;
  const input = createWhiteboardPenInput({
    authorId: 'ana',
    onDraft: (stroke) => drafts.push(stroke),
    onCommit: (stroke) => committed.push(stroke),
    createId: () => `stroke-${++ids}`,
    now: () => 1_700_000_000_000,
  });
  return { input, committed, drafts };
}

const pen = (
  time: number,
  x: number,
  y: number,
  extra: Partial<WhiteboardPointerSample> = {}
): WhiteboardPointerSample => ({
  pointerId: 1,
  pointerType: 'pen',
  time,
  x,
  y,
  pressure: 0.5,
  tiltX: 0,
  tiltY: 0,
  button: 0,
  ...extra,
});

const touch = (
  time: number,
  x: number,
  y: number,
  pointerId = 2
): WhiteboardPointerSample => ({
  pointerId,
  pointerType: 'touch',
  time,
  x,
  y,
  pressure: 1,
  button: 0,
});

const mouse = (
  time: number,
  x: number,
  y: number,
  button = 0
): WhiteboardPointerSample => ({
  pointerId: 9,
  pointerType: 'mouse',
  time,
  x,
  y,
  pressure: 0.5,
  button,
});

it('widens a pen stroke as pressure rises', () => {
  const { input, committed } = board();
  expect(input.down(pen(0, 100, 100, { pressure: 0.1 }), style)).toBe(true);
  input.move([
    pen(8, 120, 100, { pressure: 0.5 }),
    pen(16, 140, 100, { pressure: 0.9 }),
  ]);
  input.up(pen(24, 160, 100, { pressure: 0 }));

  const [stroke] = committed;
  expect(stroke?.input).toBe('pen');
  expect(stroke?.points.map((point) => point.pressure)).toEqual([
    0.1, 0.5, 0.9, 0.9,
  ]);
  const widths = stroke?.points.map((point) =>
    pressureWidth(stroke.width, point.pressure)
  );
  expect(widths?.[0]).toBeCloseTo(2.4);
  expect(widths?.[1]).toBeCloseTo(6);
  expect(widths?.[2]).toBeCloseTo(9.6);
  // The lifted pen reports no pressure, so the stroke ends at its last width.
  expect(widths?.[3]).toBeCloseTo(9.6);
});

it('stores the pen tilt on every point of the stroke', () => {
  const { input, committed } = board();
  input.down(pen(0, 100, 100, { tiltX: 32, tiltY: -14 }), style);
  input.move([pen(8, 130, 120, { tiltX: 41.6, tiltY: -20.2 })]);
  input.up(pen(16, 160, 140, { tiltX: 120, tiltY: -120 }));

  expect(
    committed[0]?.points.map((point) => [point.tiltX, point.tiltY])
  ).toEqual([
    [32, -14],
    [42, -20],
    [90, -90],
  ]);
});

it('does not draw a touch that lands while a pen is down', () => {
  const { input, committed, drafts } = board();
  input.down(pen(0, 100, 100), style);
  expect(input.down(touch(5, 600, 700), style)).toBe(false);
  input.move([touch(10, 640, 720), pen(12, 140, 100)]);
  input.up(touch(20, 660, 730));
  input.up(pen(30, 180, 100));

  expect(committed).toHaveLength(1);
  expect(committed[0]?.input).toBe('pen');
  expect(committed[0]?.points.map((point) => [point.x, point.y])).toEqual([
    [100, 100],
    [140, 100],
    [180, 100],
  ]);
  expect(drafts.every((draft) => draft === null || draft.input === 'pen')).toBe(
    true
  );
});

it('keeps rejecting a palm that stays down after the pen lifts', () => {
  const { input, committed } = board();
  input.down(pen(0, 100, 100), style);
  input.down(touch(5, 600, 700), style);
  input.up(pen(30, 180, 100));
  input.move([touch(2000, 640, 720)]);
  input.up(touch(2100, 660, 730));

  expect(committed).toHaveLength(1);
});

it('drops a palm stroke when the pen comes down after it', () => {
  const { input, committed, drafts } = board();
  expect(input.down(touch(0, 600, 700), style)).toBe(true);
  input.move([touch(8, 640, 720)]);
  expect(input.down(pen(16, 100, 100), style)).toBe(true);
  input.move([touch(24, 680, 740), pen(24, 140, 100)]);
  input.up(touch(32, 700, 750));
  input.up(pen(40, 180, 100));

  expect(committed.map((stroke) => stroke.input)).toEqual(['pen']);
  expect(drafts).toContain(null);
});

it('treats a touch as a palm while the pen hovers or has just lifted', () => {
  const { input, committed } = board();
  input.down(pen(0, 100, 100), style);
  input.up(pen(100, 180, 100));
  expect(input.down(touch(400, 600, 700), style)).toBe(false);
  input.up(touch(450, 600, 700));

  // Hovering between strokes counts as the pen still being in use.
  input.move([pen(900, 200, 200, { pressure: 0 })]);
  expect(input.down(touch(1200, 600, 700), style)).toBe(false);
  input.up(touch(1250, 600, 700));

  expect(input.down(touch(2000, 600, 700), style)).toBe(true);
  input.up(touch(2050, 640, 700));
  expect(committed.map((stroke) => stroke.input)).toEqual(['pen', 'touch']);
});

it('draws a plain stroke with a mouse', () => {
  const { input, committed } = board();
  expect(input.down(mouse(0, 50, 50), style)).toBe(true);
  input.move([mouse(8, 90, 50), mouse(16, 130, 80)]);
  input.up({ ...mouse(24, 170, 110), pressure: 0 });

  const [stroke] = committed;
  expect(stroke).toMatchObject({
    id: 'stroke-1',
    authorId: 'ana',
    input: 'mouse',
    color: 'blue',
    width: 6,
    startedAt: 1_700_000_000_000,
  });
  expect(stroke?.points).toEqual([
    { x: 50, y: 50, pressure: 0.5, tiltX: 0, tiltY: 0, t: 0 },
    { x: 90, y: 50, pressure: 0.5, tiltX: 0, tiltY: 0, t: 8 },
    { x: 130, y: 80, pressure: 0.5, tiltX: 0, tiltY: 0, t: 16 },
    { x: 170, y: 110, pressure: 0.5, tiltX: 0, tiltY: 0, t: 24 },
  ]);
  expect(
    stroke?.points.every(
      (point) => pressureWidth(stroke.width, point.pressure) === 6
    )
  ).toBe(true);
});

it('ignores pressure from a finger', () => {
  const { input, committed } = board();
  input.down(touch(0, 50, 50), style);
  input.up(touch(8, 90, 50));
  expect(committed[0]?.points.map((point) => point.pressure)).toEqual([
    0.5, 0.5,
  ]);
});

it('draws only with the primary button', () => {
  const { input, committed } = board();
  expect(input.down(mouse(0, 50, 50, 2), style)).toBe(false);
  input.move([mouse(8, 90, 50, 2)]);
  input.up(mouse(16, 90, 50, 2));
  // A pen eraser tip is a different button too.
  expect(input.down(pen(20, 50, 50, { button: 5 }), style)).toBe(false);
  input.up(pen(30, 50, 50, { button: 5 }));
  expect(committed).toEqual([]);
});

it('records a tap as a single dot', () => {
  const { input, committed } = board();
  input.down(pen(0, 300, 300, { pressure: 0.7 }), style);
  input.up(pen(40, 300, 300, { pressure: 0 }));
  expect(committed[0]?.points).toEqual([
    { x: 300, y: 300, pressure: 0.7, tiltX: 0, tiltY: 0, t: 0 },
  ]);
});

it('discards a cancelled stroke and draws again afterwards', () => {
  const { input, committed, drafts } = board();
  input.down(pen(0, 100, 100), style);
  input.move([pen(8, 140, 100)]);
  input.cancel(pen(16, 140, 100));
  expect(committed).toEqual([]);
  expect(drafts.at(-1)).toBeNull();

  input.down(mouse(600, 50, 50), style);
  input.up(mouse(700, 90, 50));
  expect(committed).toHaveLength(1);
});

it('ends the stroke when the release carries no position', () => {
  const { input, committed, drafts } = board();
  input.down(pen(0, 100, 100), style);
  input.move([pen(8, 140, 100)]);
  input.up({ pointerId: 1, pointerType: 'pen', time: 16 });
  expect(committed[0]?.points).toHaveLength(2);
  expect(drafts.at(-1)).toBeNull();
});

it('lets one pointer draw at a time', () => {
  const { input, committed } = board();
  input.down(mouse(0, 50, 50), style);
  expect(input.down(touch(4, 600, 700, 3), style)).toBe(false);
  input.move([touch(8, 640, 700, 3), mouse(8, 90, 50)]);
  input.up(touch(12, 640, 700, 3));
  input.up(mouse(16, 130, 50));
  expect(committed).toHaveLength(1);
  expect(committed[0]?.points).toHaveLength(3);
});

it('skips samples that neither move nor change pressure', () => {
  const { input, committed } = board();
  input.down(pen(0, 100, 100, { pressure: 0.5 }), style);
  input.move([
    pen(4, 100.3, 100.2, { pressure: 0.51 }),
    pen(8, 100.4, 100.1, { pressure: 0.8 }),
    pen(12, 130, 100, { pressure: 0.8 }),
  ]);
  input.up(pen(16, 130.2, 100, { pressure: 0 }));
  expect(committed[0]?.points.map((point) => point.t)).toEqual([0, 8, 12]);
});

it('keeps points on the board when the pointer leaves it', () => {
  const { input, committed } = board();
  input.down(mouse(0, -2, 20.26), style);
  input.move([mouse(8, 5000, 5000)]);
  input.up(mouse(16, Number.NaN, -3));
  expect(committed[0]?.points.map((point) => [point.x, point.y])).toEqual([
    [0, 20.3],
    [WHITEBOARD_WIDTH, WHITEBOARD_HEIGHT],
    [0, 0],
  ]);
});

it('ignores a press beside the board but still counts that pen as down', () => {
  const { input, committed } = board();
  expect(input.down(mouse(0, -40, 100), style)).toBe(false);
  input.up(mouse(8, 100, 100));
  expect(input.down(pen(20, 100, WHITEBOARD_HEIGHT + 60), style)).toBe(false);
  expect(input.down(touch(24, 600, 700), style)).toBe(false);
  input.up(touch(28, 600, 700));
  input.up(pen(32, 100, 100));
  expect(committed).toEqual([]);
});

it('continues a very long stroke as a new stroke', () => {
  const { input, committed } = board();
  input.down(pen(0, 0, 100), style);
  const total = WHITEBOARD_MAX_STROKE_POINTS + 10;
  for (let index = 1; index <= total; index++) {
    input.move([pen(index, (index % 500) * 2, 100 + Math.floor(index / 500))]);
  }
  input.up({ pointerId: 1, pointerType: 'pen', time: total + 1 });

  expect(committed.map((stroke) => stroke.id)).toEqual([
    'stroke-1',
    'stroke-2',
  ]);
  const [first, second] = committed;
  expect(first?.points).toHaveLength(WHITEBOARD_MAX_STROKE_POINTS);
  // The second stroke starts where the first one stopped.
  const seam = first?.points.at(-1);
  expect(second?.points[0]).toEqual({ ...seam, t: 0 });
  expect(second?.startedAt).toBe((first?.startedAt ?? 0) + (seam?.t ?? 0));
  expect(second?.points).toHaveLength(12);
});
