import type { MeetRealtimeClientMessage } from '@tuturuuu/realtime/meet';
import { afterEach, expect, it, vi } from 'vitest';
import type { WhiteboardStroke } from './stroke';
import {
  appendWhiteboardStroke,
  clearWhiteboard,
  closeWhiteboardRoom,
  readWhiteboard,
  subscribeWhiteboard,
  undoWhiteboardStroke,
  whiteboardRoom,
} from './whiteboard-store';

const meetingId = 'meeting-board';
const authorId = crypto.randomUUID();
const otherId = crypto.randomUUID();
const stroke = (author = authorId): WhiteboardStroke => ({
  id: crypto.randomUUID(),
  authorId: author,
  input: 'pen',
  color: 'ink',
  width: 6,
  startedAt: 1_700_000_000_000,
  points: [{ x: 10, y: 10, pressure: 0.5, tiltX: 0, tiltY: 0, t: 0 }],
});
const ids = () => readWhiteboard(meetingId).strokes.map((entry) => entry.id);
function open() {
  const room = whiteboardRoom(meetingId);
  const send = vi.fn<(message: MeetRealtimeClientMessage) => boolean>(
    () => true
  );
  room.identify(authorId, false);
  room.open(send);
  room.receive({ type: 'penboard.snapshot', revision: 0, strokes: [] });
  return { room, send };
}

afterEach(() => closeWhiteboardRoom(meetingId));

it('reconciles the optimistic stroke with the server ID and deduplicates the broadcast', () => {
  const { room, send } = open();
  const changed = vi.fn();
  const unsubscribe = subscribeWhiteboard(meetingId, changed);
  const local = stroke();
  appendWhiteboardStroke(meetingId, local);
  appendWhiteboardStroke(meetingId, local);
  expect(ids()).toEqual([local.id]);
  expect(send).toHaveBeenLastCalledWith({
    type: 'penboard.draw',
    stroke: local,
    requestId: local.id,
  });

  const canonical = { ...local, id: crypto.randomUUID() };
  room.receive({
    type: 'penboard.stroke',
    revision: 1,
    stroke: canonical,
    requestId: local.id,
  });
  room.receive({ type: 'penboard.stroke', revision: 1, stroke: canonical });
  expect(ids()).toEqual([canonical.id]);
  expect(readWhiteboard(meetingId).canUndo).toBe(true);
  expect(changed).toHaveBeenCalledTimes(2);

  unsubscribe();
  room.receive({
    type: 'penboard.stroke',
    revision: 2,
    stroke: stroke(otherId),
  });
  expect(changed).toHaveBeenCalledTimes(2);
  expect(readWhiteboard('another-meeting').strokes).toEqual([]);
});

it('rolls back a refusal and repairs a revision gap with one snapshot request', () => {
  const { room, send } = open();
  const local = stroke();
  appendWhiteboardStroke(meetingId, local);
  room.receive({ type: 'error', error: 'penboard_full', requestId: local.id });
  expect(ids()).toEqual([]);

  const remote = stroke(otherId);
  room.receive({ type: 'penboard.stroke', revision: 2, stroke: remote });
  room.receive({ type: 'penboard.stroke', revision: 3, stroke: remote });
  expect(
    send.mock.calls.filter(([message]) => message.type === 'penboard.read')
  ).toHaveLength(2);
  expect(ids()).toEqual([]);
  room.receive({ type: 'penboard.snapshot', revision: 3, strokes: [remote] });
  room.receive({ type: 'penboard.snapshot', revision: 2, strokes: [] });
  expect(ids()).toEqual([remote.id]);
  expect(readWhiteboard(meetingId).canUndo).toBe(false);
});

it('sends undo and clear to the room and replaces the local model from snapshots', () => {
  const { room, send } = open();
  const local = stroke();
  const remote = stroke(otherId);
  room.receive({
    type: 'penboard.snapshot',
    revision: 5,
    strokes: [local, remote],
  });
  undoWhiteboardStroke(meetingId, authorId);
  expect(send).toHaveBeenLastCalledWith({ type: 'penboard.undo' });
  expect(ids()).toEqual([local.id, remote.id]);
  room.receive({ type: 'penboard.snapshot', revision: 6, strokes: [remote] });
  clearWhiteboard(meetingId);
  expect(send).toHaveBeenLastCalledWith({ type: 'penboard.clear' });
  room.receive({ type: 'penboard.snapshot', revision: 7, strokes: [] });
  expect(ids()).toEqual([]);
});

it('clears subscribed customers on room close and ignores stale socket messages', () => {
  const { room } = open();
  const changed = vi.fn();
  const stop = subscribeWhiteboard(meetingId, changed);
  appendWhiteboardStroke(meetingId, stroke());
  closeWhiteboardRoom(meetingId);
  room.receive({ type: 'penboard.snapshot', revision: 8, strokes: [stroke()] });
  expect(ids()).toEqual([]);
  expect(changed).toHaveBeenCalledTimes(2);
  stop();
});
