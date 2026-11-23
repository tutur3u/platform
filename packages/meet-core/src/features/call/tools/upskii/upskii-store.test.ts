import type {
  MeetRealtimeClientMessage,
  MeetRealtimeServerMessage,
} from '@tuturuuu/realtime/meet';
import type { UpskiiPresentation } from '@tuturuuu/realtime/meet/room-upskii-presentation';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  closeUpskiiRoom,
  handleUpskiiMessage,
  upskiiRoom,
} from './upskii-store';

const meetingId = 'upskii-store';
const send = vi.fn<(message: MeetRealtimeClientMessage) => boolean>(() => true);
const ready = (role: 'host' | 'speaker', admission = 'admitted') =>
  ({
    type: 'ready',
    role,
    userId: 'self',
    roomId: 'room',
    admission,
  }) as unknown as MeetRealtimeServerMessage;
const lesson = {
  kind: 'lesson' as const,
  id: 'l4',
  title: 'Responsible AI in your class',
  url: 'https://upskii.com/classes/c1/lessons/l4',
};
const presentation: UpskiiPresentation = {
  item: lesson,
  presenterId: 'self',
  startedAt: '2026-12-05T08:00:00Z',
  revision: 1,
};
const sent = (type: string) =>
  send.mock.calls.flatMap(([message]) =>
    message.type === type ? [message as { requestId?: string }] : []
  );
const deliver = (message: MeetRealtimeServerMessage) =>
  handleUpskiiMessage(meetingId, message, send);

beforeEach(() => send.mockClear());
afterEach(() => closeUpskiiRoom(meetingId));

describe('Upskii room store', () => {
  it('reads the room once admitted and shows what the room shares', () => {
    deliver(ready('speaker', 'waiting'));
    expect(sent('upskii.present.read')).toHaveLength(0);
    deliver({
      type: 'admission.result',
      admitted: true,
    } as MeetRealtimeServerMessage);
    const [read] = sent('upskii.present.read');
    expect(read?.requestId).toMatch(/^upskii-read:/);
    deliver({
      type: 'upskii.presentation',
      presentation,
      requestId: read?.requestId,
    });
    expect(upskiiRoom(meetingId).read()).toMatchObject({
      connected: true,
      canPresent: false,
      presentation,
    });
  });

  it('never sends a present or stop for someone who cannot run activities', () => {
    deliver(ready('speaker'));
    upskiiRoom(meetingId).present(lesson);
    upskiiRoom(meetingId).stop();
    expect(sent('upskii.present.set')).toHaveLength(0);
    expect(sent('upskii.present.clear')).toHaveLength(0);
  });

  it('tracks a host request until the room answers it', () => {
    deliver(ready('host'));
    const room = upskiiRoom(meetingId);
    room.present(lesson);
    const [request] = sent('upskii.present.set');
    expect(room.read().request).toEqual({ kind: 'pending', action: 'present' });

    // Another broadcast leaves the request pending; its own answer ends it.
    deliver({ type: 'upskii.presentation', presentation });
    expect(room.read().request.kind).toBe('pending');
    deliver({
      type: 'upskii.presentation',
      presentation,
      requestId: request?.requestId,
    });
    expect(room.read()).toMatchObject({
      presentation,
      request: { kind: 'idle' },
    });
  });

  it('keeps the shown item when the room refuses a change', () => {
    deliver(ready('host'));
    const room = upskiiRoom(meetingId);
    deliver({ type: 'upskii.presentation', presentation });
    room.present({ ...lesson, id: 'l5' });
    const [request] = sent('upskii.present.set');
    deliver({
      type: 'error',
      error: 'upskii_url_rejected',
      requestId: request?.requestId,
    } as MeetRealtimeServerMessage);
    expect(room.read()).toMatchObject({
      presentation,
      request: { kind: 'failed', error: 'upskii_url_rejected' },
    });
    room.dismissError();
    expect(room.read().request).toEqual({ kind: 'idle' });
  });

  it('reports a request it could not send', () => {
    deliver(ready('host'));
    send.mockReturnValueOnce(false);
    upskiiRoom(meetingId).stop();
    expect(upskiiRoom(meetingId).read().request).toEqual({
      kind: 'failed',
      error: 'disconnected',
    });
  });

  it('forgets everything when the room ends', () => {
    deliver(ready('host'));
    deliver({ type: 'upskii.presentation', presentation });
    deliver({ type: 'room.ended' } as MeetRealtimeServerMessage);
    expect(upskiiRoom(meetingId).read()).toMatchObject({
      connected: false,
      presentation: null,
      canPresent: false,
    });
  });
});
