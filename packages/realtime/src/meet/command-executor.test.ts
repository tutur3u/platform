import { describe, expect, it, vi } from 'vitest';
import { MeetCommandExecutor } from './command-executor';
import type { MeetRealtimeClientMessage } from './messages';
import { getMeetRealtimeScopesForRole } from './permissions';
import { meetRealtimeTokenPayloadSchema } from './primitives';
import {
  admitOrHold,
  createMeetRoomSnapshot,
  type MeetRoomOutcome,
  releaseParticipant,
} from './room';

const now = '2026-09-07T15:00:00Z';
const token = meetRealtimeTokenPayloadSchema.parse({
  role: 'host',
  admission: 'open',
  userId: '9b5c036d-d38d-4c12-b8e8-2e0b2b4a2691',
  displayName: 'Host',
  roomId: 'room',
  meetingId: '5e5217de-9bb3-4e20-8d99-526ad3e7e34f',
  wsId: '0f1a64f7-780f-4d30-9d72-5530f204e95c',
  exp: 2000000000,
  limits: {},
  scopes: getMeetRealtimeScopesForRole('host'),
});
const publish = (sessionId = 'pub'): MeetRealtimeClientMessage => ({
  type: 'sfu.tracks.publish',
  sessionDescription: { type: 'offer', sdp: 'test-offer' },
  requestId: 'publish',
  sessionId,
  tracks: [{ location: 'local', trackName: 'audio', mid: '0', kind: 'audio' }],
});
function fixture() {
  let state = admitOrHold(createMeetRoomSnapshot(), token, now).state;
  const results: MeetRoomOutcome[] = [];
  const executor = new MeetCommandExecutor();
  const runSfu = vi
    .fn<() => Promise<unknown>>()
    .mockResolvedValue({ tracks: [] });
  const options = {
    read: () => state,
    commit: (result: MeetRoomOutcome) => {
      state = result.state;
      results.push(result);
    },
    runSfu,
  };
  return {
    executor,
    options,
    results,
    get state() {
      return state;
    },
    set state(next) {
      state = next;
    },
    run: (message: MeetRealtimeClientMessage) =>
      executor.run({ message, token, now }, options),
  };
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
describe('confirmed SFU room transitions', () => {
  it('does not allocate upstream media after a queued participant leaves', async () => {
    const f = fixture();
    const pending = f.run(publish());
    f.state = releaseParticipant(f.state, token.userId, 'room').state;
    await pending;
    expect(f.options.runSfu).not.toHaveBeenCalled();
    expect(f.state.tracks).toEqual({});
    expect(f.results[0]?.reply[0]).toMatchObject({
      type: 'error',
      error: 'participant_left',
    });
  });
  it('publishes only after success and retains concurrent host settings', async () => {
    const f = fixture();
    let resolve!: (value: unknown) => void;
    f.options.runSfu.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        })
    );
    const pending = f.run(publish());
    await tick();
    expect(f.state.tracks).toEqual({});
    expect(f.results).toEqual([]);
    await f.run({
      type: 'room.settings.update',
      settings: { shareNotes: true },
    });
    resolve({ tracks: [] });
    await pending;
    expect(f.state.settings?.shareNotes).toBe(true);
    expect(f.state.tracks['pub:audio']).toBeDefined();
    expect(f.results.at(-1)?.broadcast[0]?.type).toBe('track.published');
  });
  it.each([
    new Error('provider unavailable'),
    { tracks: [{ errorCode: 'not_found_track_error' }] },
  ])('does not announce failed SFU work', async (failure) => {
    const f = fixture();
    if (failure instanceof Error) f.options.runSfu.mockRejectedValue(failure);
    else f.options.runSfu.mockResolvedValue(failure);
    await f.run(publish());
    expect(f.state.tracks).toEqual({});
    expect(f.results[0]?.broadcast).toEqual([]);
    expect(f.results[0]?.reply[0]?.type).toBe('error');
  });
  it('cannot resurrect a participant after they leave during an upstream request', async () => {
    const f = fixture();
    let resolve!: (value: unknown) => void;
    f.options.runSfu.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        })
    );
    const pending = f.run(publish());
    await tick();
    f.state = releaseParticipant(f.state, token.userId, 'room').state;
    resolve({ tracks: [] });
    await pending;
    expect(f.state.tracks).toEqual({});
    expect(f.results[0]?.reply[0]).toMatchObject({ error: 'participant_left' });
  });
  it('serializes publisher replacements so a late result cannot reclaim the track', async () => {
    const f = fixture();
    let resolve!: (value: unknown) => void;
    f.options.runSfu.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        })
    );
    const first = f.run(publish('old'));
    const second = f.run(publish('new'));
    await tick();
    expect(f.options.runSfu).toHaveBeenCalledTimes(1);
    resolve({ tracks: [] });
    await Promise.all([first, second]);
    expect(Object.keys(f.state.tracks)).toEqual(['new:audio']);
    await f.run(publish('old'));
    expect(f.results.at(-1)?.reply[0]).toMatchObject({
      error: 'stale_publication',
    });
    expect(f.options.runSfu).toHaveBeenCalledTimes(2);
  });
  it('rejects closing another participant track before contacting Cloudflare', async () => {
    const f = fixture();
    f.state = {
      ...f.state,
      tracks: {
        'other:audio': {
          sessionId: 'other',
          trackName: 'audio',
          userId: 'other-user',
        },
      },
    };
    await f.run({
      type: 'sfu.tracks.close',
      sessionId: 'other',
      force: true,
      tracks: [{ trackName: 'audio', mid: '0' }],
    });
    expect(f.options.runSfu).not.toHaveBeenCalled();
    expect(f.state.tracks['other:audio']).toBeDefined();
    expect(f.results[0]?.reply[0]).toMatchObject({
      error: 'permission_denied',
    });
  });
  it('retains an existing publication when upstream closure fails', async () => {
    const f = fixture();
    await f.run(publish());
    f.options.runSfu.mockRejectedValue(new Error('failed'));
    await f.run({
      type: 'sfu.tracks.close',
      sessionId: 'pub',
      force: true,
      tracks: [{ trackName: 'audio', mid: '0' }],
    });
    expect(f.state.tracks['pub:audio']).toBeDefined();
    expect(f.results.at(-1)?.broadcast).toEqual([]);
  });
});

it('does not translate a persistence failure into an SFU failure and lets the next command run', async () => {
  const f = fixture();
  const commit = vi
    .fn()
    .mockRejectedValueOnce(new Error('storage unavailable'))
    .mockResolvedValue(undefined);
  const options = { ...f.options, commit };
  await expect(
    f.executor.run({ message: publish(), token, now }, options)
  ).rejects.toThrow('storage unavailable');
  expect(commit).toHaveBeenCalledTimes(1);
  expect(commit.mock.calls[0]?.[0].reply[0].type).toBe('sfu.response');
  await f.executor.run({ message: publish('next'), token, now }, options);
  expect(f.options.runSfu).toHaveBeenCalledTimes(2);
});
