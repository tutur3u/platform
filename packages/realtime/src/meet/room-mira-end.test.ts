import { describe, expect, it } from 'vitest';
import { admitOrHold, createMeetRoomSnapshot } from './index';
import { applyMiraRoomConsent } from './room-mira-consent';
import {
  acceptMira,
  miraChoice,
  miraToken,
  withConfirm,
} from './room-mira.fixtures';
import { endMeetRoom } from './room-ending';
import type { RoomServiceState } from './room-service';

const host = '00000000-0000-4000-8000-0000000000a1';
const guest = '00000000-0000-4000-8000-0000000000b2';

function liveRoom() {
  let state: RoomServiceState = createMeetRoomSnapshot();
  for (const id of [host, guest])
    state = admitOrHold(state, miraToken(id), '2026-11-24T00:00:00Z').state;
  state = acceptMira(state, host);
  for (const id of [host, guest]) {
    const run = (next: RoomServiceState, input: object) =>
      applyMiraRoomConsent(next, miraToken(id), input)!;
    state = withConfirm(run(state, miraChoice(state, 'on')), run).state;
  }
  return state;
}

describe('an ended room and room Mira state', () => {
  it('keeps no acceptor name or per-account choices once it has ended', () => {
    const live = liveRoom();
    expect(live.miraRoom?.acceptance?.acceptorAccountId).toBe(host);
    expect(Object.keys(live.miraRoom?.choices ?? {})).toHaveLength(2);

    const ended = endMeetRoom(live, '2026-11-24T01:00:00Z') as RoomServiceState;
    expect(ended.ended).toBe(true);
    expect('miraRoom' in ended).toBe(false);
    // The rest of the ended room is untouched by this.
    expect(ended.presence).toEqual({});
    expect(ended.endedAt).toBe('2026-11-24T01:00:00Z');
  });

  it('answers a Mira read from an ended room with a refusal, not stale state', () => {
    const ended = endMeetRoom(liveRoom(), '2026-11-24T01:00:00Z');
    const result = applyMiraRoomConsent(
      ended as RoomServiceState,
      miraToken(guest),
      { action: 'mira.room.read' }
    );
    expect(result?.status).toBe(403);
    expect(JSON.stringify(result?.body)).not.toContain(host);
  });

  it('ends a room that never had Mira without adding any', () => {
    const ended = endMeetRoom(
      createMeetRoomSnapshot(),
      '2026-11-24T01:00:00Z'
    ) as RoomServiceState;
    expect('miraRoom' in ended).toBe(false);
  });
});
