import type { MeetRealtimeServerMessage } from '@tuturuuu/realtime/meet';
import { afterEach, expect, it, vi } from 'vitest';
import { INITIAL_CALL_STATE, reduceCallState } from './call-state';
import { createRoomActions } from './room-actions';
import { MeetSignaling } from './signaling';

class Socket extends EventTarget {
  static OPEN = 1;
  static last: Socket | null = null;
  readyState = 0;
  sent: Array<{ type: string; displayName?: string; requestId?: string }> = [];
  constructor() {
    super();
    Socket.last = this;
  }
  send(raw: string) {
    this.sent.push(JSON.parse(raw));
  }
  open() {
    this.readyState = 1;
    this.dispatchEvent(new Event('open'));
    this.receive({ type: 'ready', userId: 'self', admission: 'admitted' });
  }
  receive(message: object) {
    this.dispatchEvent(
      new MessageEvent('message', { data: JSON.stringify(message) })
    );
  }
  close() {
    this.readyState = 3;
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  Socket.last = null;
});

const admitted = {
  ...INITIAL_CALL_STATE,
  admission: 'admitted' as const,
  selfUserId: 'self',
  participants: {
    self: { userId: 'self', displayName: 'Old Name' },
    other: { userId: 'other', displayName: 'Other' },
  } as never,
};

it('applies a rename to the named participant only, without a rejoin', () => {
  const next = reduceCallState(admitted, {
    type: 'participant.renamed',
    userId: 'self',
    displayName: 'New Name',
  });
  expect(next.participants.self?.displayName).toBe('New Name');
  expect(next.participants.other).toBe(admitted.participants.other);
  expect(next.admission).toBe('admitted');
  expect(
    reduceCallState(admitted, {
      type: 'participant.renamed',
      userId: 'missing',
      displayName: 'Ghost',
    })
  ).toBe(admitted);
});

async function connected() {
  vi.stubGlobal('WebSocket', Socket);
  let state = admitted;
  const signaling = new MeetSignaling({
    resolveUrl: () => 'ws://test',
    onMessage: (message: MeetRealtimeServerMessage) => {
      state = reduceCallState(state, message);
    },
  });
  signaling.connect();
  await vi.waitFor(() => expect(Socket.last).not.toBeNull());
  Socket.last!.open();
  const actions = createRoomActions({ current: signaling });
  return { actions, socket: Socket.last!, read: () => state };
}

it('renames through the room, resolves on its acknowledgement and replays the name', async () => {
  const { actions, socket, read } = await connected();
  actions.previewDisplayName('self', 'New Name');
  expect(read().participants.self?.displayName).toBe('New Name');
  const renamed = actions.renameSelf('  New Name ');
  const request = socket.sent.at(-1)!;
  expect(request).toMatchObject({
    type: 'participant.rename',
    displayName: 'New Name',
  });
  socket.receive({
    type: 'participant.renamed',
    userId: 'self',
    displayName: 'New Name',
    requestId: request.requestId,
  });
  await expect(renamed).resolves.toBeUndefined();
  // A reconnect announces the new name again.
  actions.replayPresenceJoin({
    audioEnabled: false,
    videoEnabled: false,
    screenEnabled: false,
  });
  expect(socket.sent.at(-1)).toMatchObject({
    type: 'presence.join',
    displayName: 'New Name',
  });
});

it('rejects with the room error so the caller can roll back', async () => {
  const { actions, socket } = await connected();
  const renamed = actions.renameSelf('New Name');
  socket.receive({
    type: 'error',
    error: 'display_name_locked',
    requestId: socket.sent.at(-1)!.requestId,
  });
  await expect(renamed).rejects.toThrow('display_name_locked');
  await expect(actions.renameSelf('   ')).rejects.toThrow('display_name_empty');
});
