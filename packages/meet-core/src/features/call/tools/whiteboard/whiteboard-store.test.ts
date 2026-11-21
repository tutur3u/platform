import { afterEach, expect, it, vi } from 'vitest';
import type { WhiteboardPoint, WhiteboardStroke } from './stroke';
import {
  appendWhiteboardStroke,
  clearWhiteboard,
  readWhiteboard,
  subscribeWhiteboard,
  undoWhiteboardStroke,
} from './whiteboard-store';

const meetingId = 'meeting-board';

const point = (x: number, y: number, pressure = 0.5): WhiteboardPoint => ({
  x,
  y,
  pressure,
  tiltX: 0,
  tiltY: 0,
  t: 0,
});

const stroke = (id: string, authorId: string): WhiteboardStroke => ({
  id,
  authorId,
  input: 'pen',
  color: 'ink',
  width: 6,
  startedAt: 1_700_000_000_000,
  points: [point(10, 10), point(40, 10)],
});

const ids = () => readWhiteboard(meetingId).strokes.map((entry) => entry.id);

afterEach(() => clearWhiteboard(meetingId));

it('appends strokes from two participants to one board', () => {
  const changed = vi.fn();
  const unsubscribe = subscribeWhiteboard(meetingId, changed);
  appendWhiteboardStroke(meetingId, stroke('a1', 'ana'));
  appendWhiteboardStroke(meetingId, stroke('b1', 'binh'));
  expect(ids()).toEqual(['a1', 'b1']);
  expect(changed).toHaveBeenCalledTimes(2);

  unsubscribe();
  appendWhiteboardStroke(meetingId, stroke('a2', 'ana'));
  expect(changed).toHaveBeenCalledTimes(2);
  expect(readWhiteboard('another-meeting').strokes).toEqual([]);
});

it('keeps one copy of a stroke that is delivered twice', () => {
  const before = readWhiteboard(meetingId);
  appendWhiteboardStroke(meetingId, { ...stroke('a1', 'ana'), points: [] });
  expect(readWhiteboard(meetingId)).toBe(before);

  appendWhiteboardStroke(meetingId, stroke('a1', 'ana'));
  const once = readWhiteboard(meetingId);
  appendWhiteboardStroke(meetingId, stroke('a1', 'ana'));
  expect(readWhiteboard(meetingId)).toBe(once);
  expect(ids()).toEqual(['a1']);
});

it('undoes only the latest stroke of the participant who asked', () => {
  appendWhiteboardStroke(meetingId, stroke('a1', 'ana'));
  appendWhiteboardStroke(meetingId, stroke('b1', 'binh'));
  appendWhiteboardStroke(meetingId, stroke('a2', 'ana'));
  appendWhiteboardStroke(meetingId, stroke('b2', 'binh'));

  undoWhiteboardStroke(meetingId, 'ana');
  expect(ids()).toEqual(['a1', 'b1', 'b2']);
  undoWhiteboardStroke(meetingId, 'ana');
  undoWhiteboardStroke(meetingId, 'ana');
  expect(ids()).toEqual(['b1', 'b2']);

  clearWhiteboard(meetingId);
  expect(ids()).toEqual([]);
});
