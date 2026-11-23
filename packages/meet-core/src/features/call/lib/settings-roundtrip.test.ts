import {
  admitOrHold,
  applyMeetRoomCommand,
  createMeetRoomSnapshot,
  getMeetRealtimeScopesForRole,
  type MeetRealtimeServerMessage,
  MeetCommandExecutor,
  meetRealtimeTokenPayloadSchema,
  readMeetClientFrame,
} from '@tuturuuu/realtime/meet';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toolActivityId } from '../stage-layout/activity-ids';
import { meetToolsFor } from '../tools/registry';
import { INITIAL_CALL_STATE, reduceCallState } from './call-state';
import { createRoomActions } from './room-actions';
import { MeetSignaling } from './signaling';

const now = '2026-09-07T14:00:00.000Z';
const id = (n: number) =>
  `9b5c036d-d38d-4c12-b8e8-${String(n).padStart(12, '0')}`;
const token = (n: number) => {
  const role = n === 1 ? 'host' : 'speaker';
  return meetRealtimeTokenPayloadSchema.parse({
    role,
    admission: role === 'host' ? 'open' : 'lobby',
    userId: id(n),
    accountId: id(n),
    displayName: `person ${n}`,
    roomId: 'test',
    meetingId: '5e5217de-9bb3-4e20-8d99-526ad3e7e34f',
    wsId: '0f1a64f7-780f-4d30-9d72-5530f204e95c',
    exp: 2_000_000_000,
    limits: {},
    scopes: getMeetRealtimeScopesForRole(role),
  });
};
const [host, member] = [token(1), token(2)];

/** How the room behaves: as built, as an older room that drops new keys, or silent. */
type Room = 'current' | 'drops-new-keys' | 'silent';
const room = { snapshot: createMeetRoomSnapshot(), mode: 'current' as Room };
const executor = new MeetCommandExecutor();
const sockets: BridgeSocket[] = [];

class BridgeSocket extends EventTarget {
  static OPEN = 1;
  readyState = 0;
  actor = host;
  constructor() {
    super();
    sockets.push(this);
  }
  open() {
    this.readyState = 1;
    this.dispatchEvent(new Event('open'));
  }
  close() {
    this.readyState = 3;
  }
  deliver(message: MeetRealtimeServerMessage) {
    this.dispatchEvent(
      new MessageEvent('message', { data: JSON.stringify(message) })
    );
  }
  send(raw: string) {
    if (raw === 'meet:ping' || room.mode === 'silent') return;
    const json = JSON.parse(raw);
    if (room.mode === 'drops-new-keys' && json.settings)
      delete json.settings.defaultActivity;
    const frame = readMeetClientFrame(json);
    if (!frame.success) return this.deliver(frame.reply);
    void executor.run(
      {
        message: frame.data,
        token: this.actor,
        now,
        notesEligible: true,
        requireAdmission: true,
      },
      {
        read: () => room.snapshot,
        commit: (result) => {
          room.snapshot = result.state;
          for (const message of [...result.reply, ...result.broadcast])
            this.deliver(message);
        },
        runSfu: async () => ({}),
      }
    );
  }
}

async function connect(actor = host) {
  let state = INITIAL_CALL_STATE;
  const failures: string[] = [];
  const signalingRef: { current: MeetSignaling | null } = { current: null };
  const signaling = new MeetSignaling({
    resolveUrl: () => 'ws://room.test',
    onMessage: (message) => {
      state = reduceCallState(state, message);
    },
  });
  signalingRef.current = signaling;
  signaling.connect();
  await Promise.resolve();
  const socket = sockets.at(-1)!;
  socket.actor = actor;
  socket.open();
  const actions = createRoomActions(signalingRef);
  actions.watchSettingsFailures((error) => failures.push(error.message));
  return { actions, failures, signaling, state: () => state };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('WebSocket', BridgeSocket);
  room.mode = 'current';
  room.snapshot = admitOrHold(createMeetRoomSnapshot(), host, now).state;
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  sockets.length = 0;
});

describe('a host settings write, from the client to the room and back', () => {
  it.each(meetToolsFor({ assessment: true }).map((tool) => [tool.id] as const))(
    'sets %s as the default activity and clears it',
    async (toolId) => {
      const { actions, failures, state } = await connect();
      await actions.updateSettings({ defaultActivity: toolActivityId(toolId) });
      expect(failures).toEqual([]);
      expect(state().settings.defaultActivity).toBe(toolActivityId(toolId));
      expect(room.snapshot.settings?.defaultActivity).toBe(
        toolActivityId(toolId)
      );
      await actions.updateSettings({ defaultActivity: null });
      expect(failures).toEqual([]);
      expect(state().settings.defaultActivity).toBeNull();
    }
  );

  it('turns automatic admission on and admits the signed-in people waiting', async () => {
    room.snapshot = admitOrHold(room.snapshot, member, now).state;
    expect(room.snapshot.waiting[member.userId]).toBeDefined();
    const { actions, failures, state } = await connect();
    await actions.updateSettings({ skipLobby: true });
    expect(failures).toEqual([]);
    expect(state().settings.skipLobby).toBe(true);
    expect(room.snapshot.presence[member.userId]).toBeDefined();
    expect(room.snapshot.waiting[member.userId]).toBeUndefined();
  });

  it('tells the host when the room refuses the change', async () => {
    room.snapshot = applyMeetRoomCommand(
      admitOrHold(room.snapshot, member, now).state,
      {
        message: {
          type: 'admission.decide',
          userId: member.userId,
          admit: true,
        },
        token: host,
        now,
        notesEligible: true,
      }
    ).state;
    expect(room.snapshot.presence[member.userId]).toBeDefined();
    const { actions, failures } = await connect(member);
    await actions.updateSettings({ skipLobby: true });
    expect(failures).toEqual(['permission_denied']);
  });

  it('tells the host when the connection is closed', async () => {
    const { actions, failures, signaling } = await connect();
    signaling.close();
    await actions.updateSettings({ defaultActivity: 'tool:live-qa' });
    expect(failures).toEqual(['signaling_closed']);
  });

  it('stops reporting once the watcher is removed', async () => {
    const signalingRef: { current: MeetSignaling | null } = { current: null };
    const actions = createRoomActions(signalingRef);
    const reported: string[] = [];
    const stop = actions.watchSettingsFailures((error) =>
      reported.push(error.message)
    );
    await actions.updateSettings({ skipLobby: true });
    stop();
    await actions.updateSettings({ skipLobby: true });
    expect(reported).toEqual(['signaling_closed']);
  });

  it('tells the host when an older room accepts the write but drops the value', async () => {
    room.mode = 'drops-new-keys';
    const { actions, failures, state } = await connect();
    await actions.updateSettings({ defaultActivity: 'tool:live-qa' });
    expect(failures).toEqual(['settings_not_applied']);
    expect(state().settings.defaultActivity).toBeUndefined();
  });

  it('tells the host when the room never answers', async () => {
    room.mode = 'silent';
    const { actions, failures } = await connect();
    const write = actions.updateSettings({ defaultActivity: 'tool:live-qa' });
    await vi.advanceTimersByTimeAsync(15_000);
    await write;
    expect(failures).toEqual(['signaling_timeout']);
  });
});
