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

const idle = { audioEnabled: false, videoEnabled: false, screenEnabled: false };

it('renames through the room and replays the room-normalised name on reconnect', async () => {
  const { actions, socket, read } = await connected();
  actions.setDisplayName('Lobby Name');
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
    displayName: 'New Name (normalised)',
    requestId: request.requestId,
  });
  await expect(renamed).resolves.toBeUndefined();
  actions.replayPresenceJoin(idle);
  const [presence, replay] = socket.sent.slice(-2);
  // The lobby name never overwrites the saved one.
  expect(presence).toEqual({ type: 'presence.join', media: idle });
  expect(replay).toMatchObject({
    type: 'participant.rename',
    displayName: 'New Name (normalised)',
  });
});

it('replays a saved name whose rename timed out or never reached the room', async () => {
  const { actions, socket } = await connected();
  actions.setDisplayName('Lobby Name');
  socket.readyState = 3;
  await expect(actions.renameSelf('New Name')).rejects.toThrow(
    'signaling_closed'
  );
  socket.readyState = 1;
  actions.replayPresenceJoin(idle);
  expect(socket.sent.slice(-2)).toEqual([
    { type: 'presence.join', media: idle },
    expect.objectContaining({
      type: 'participant.rename',
      displayName: 'New Name',
    }),
  ]);
});

it('rejects with the room error and stops replaying a locked name', async () => {
  const { actions, socket } = await connected();
  actions.setDisplayName('Lobby Name');
  const renamed = actions.renameSelf('New Name');
  socket.receive({
    type: 'error',
    error: 'display_name_locked',
    requestId: socket.sent.at(-1)!.requestId,
  });
  await expect(renamed).rejects.toThrow('display_name_locked');
  actions.replayPresenceJoin(idle);
  expect(socket.sent.at(-1)).toEqual({
    type: 'presence.join',
    media: idle,
    displayName: 'Lobby Name',
  });
  await expect(actions.renameSelf('   ')).rejects.toThrow('display_name_empty');
});
