import { describe, expect, it } from 'vitest';
import {
  createRoomAudioGroup,
  microphoneMembers,
  shouldPlayRoomAudio,
  stepRoomAudioGroup,
} from './group';
import {
  fixtureGroup,
  LAPTOPS,
  makeMember,
  REMOTE,
  REMOTE_MIC,
} from './room-fixtures';

const [first, second, third] = LAPTOPS;

describe('same-room group opt-in', () => {
  it('admits only an explicit join for the matching call and code, then expires', () => {
    const group = createRoomAudioGroup({
      callId: 'call',
      code: 'TEST42',
      expiresAtMs: 20,
      speakerMode: 'all',
    });
    const join = {
      kind: 'join',
      callId: 'call',
      code: 'TEST42',
      member: makeMember(first),
      nowMs: 10,
    } as const;
    expect(stepRoomAudioGroup(group, { ...join, callId: 'elsewhere' })).toBe(
      group
    );
    expect(stepRoomAudioGroup(group, { ...join, code: 'WRONG0' })).toBe(group);
    const joined = stepRoomAudioGroup(group, join);
    expect(microphoneMembers(joined).map(({ id }) => id)).toEqual([first]);
    const muted = stepRoomAudioGroup(joined, {
      kind: 'mic',
      id: first,
      preference: 'muted',
      nowMs: 11,
    });
    expect(stepRoomAudioGroup(muted, join)).toBe(muted);
    const expired = stepRoomAudioGroup(muted, { kind: 'expire', nowMs: 20 });
    expect(expired).toEqual({ kind: 'expired' });
    expect(stepRoomAudioGroup(expired, join)).toBe(expired);
    expect(stepRoomAudioGroup(joined, { ...join, nowMs: 21 })).toEqual(expired);
  });

  it('keeps explicit microphone mute across unplug and reconnect', () => {
    const muted = stepRoomAudioGroup(fixtureGroup('all'), {
      kind: 'mic',
      id: first,
      preference: 'muted',
      nowMs: 10,
    });
    const unplugged = stepRoomAudioGroup(muted, {
      kind: 'device-disconnected',
      id: first,
      device: 'microphone',
      nowMs: 20,
    });
    const reconnected = stepRoomAudioGroup(unplugged, {
      kind: 'device-connected',
      id: first,
      device: 'microphone',
      nowMs: 30,
    });
    expect(microphoneMembers(reconnected).map(({ id }) => id)).toEqual([
      second,
      third,
    ]);
    expect(
      shouldPlayRoomAudio(reconnected, REMOTE, {
        ...REMOTE_MIC,
        publisherId: first,
      })
    ).toBe(false);
  });
});

describe('same-room playback', () => {
  it('suppresses only same-group microphones in all-speaker mode', () => {
    const group = fixtureGroup('all');
    const groupMic = { ...REMOTE_MIC, publisherId: first };
    expect(shouldPlayRoomAudio(group, second, groupMic)).toBe(false);
    expect(shouldPlayRoomAudio(group, REMOTE, groupMic)).toBe(true);
    expect(shouldPlayRoomAudio(group, first, REMOTE_MIC)).toBe(true);
    expect(shouldPlayRoomAudio(group, second, REMOTE_MIC)).toBe(true);
    const left = stepRoomAudioGroup(group, {
      kind: 'leave',
      id: second,
      nowMs: 10,
    });
    expect(shouldPlayRoomAudio(left, second, groupMic)).toBe(true);
  });

  it('fails over remote playback past explicitly muted speakers and passes screen audio', () => {
    const group = fixtureGroup('designated');
    const muted = stepRoomAudioGroup(group, {
      kind: 'speaker',
      id: second,
      preference: 'muted',
      nowMs: 10,
    });
    expect(shouldPlayRoomAudio(muted, first, REMOTE_MIC)).toBe(true);
    expect(shouldPlayRoomAudio(muted, third, REMOTE_MIC)).toBe(false);
    const unplugged = stepRoomAudioGroup(muted, {
      kind: 'device-disconnected',
      id: first,
      device: 'speaker',
      nowMs: 20,
    });
    expect(shouldPlayRoomAudio(unplugged, first, REMOTE_MIC)).toBe(false);
    expect(shouldPlayRoomAudio(unplugged, second, REMOTE_MIC)).toBe(false);
    expect(shouldPlayRoomAudio(unplugged, third, REMOTE_MIC)).toBe(true);
    expect(
      shouldPlayRoomAudio(unplugged, third, { ...REMOTE_MIC, muted: true })
    ).toBe(false);
    const screen = {
      ...REMOTE_MIC,
      publisherId: third,
      kind: 'screen',
    } as const;
    expect(shouldPlayRoomAudio(unplugged, second, screen)).toBe(true);
    expect(
      shouldPlayRoomAudio(unplugged, second, { ...screen, muted: true })
    ).toBe(false);

    const disconnected = stepRoomAudioGroup(muted, {
      kind: 'device-disconnected',
      id: first,
      device: 'call',
      nowMs: 20,
    });
    expect(shouldPlayRoomAudio(disconnected, third, REMOTE_MIC)).toBe(true);
    expect(microphoneMembers(disconnected).map(({ id }) => id)).toEqual([
      second,
      third,
    ]);
  });
});
