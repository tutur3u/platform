import { describe, expect, it } from 'vitest';
import type { PlaybackTrack } from './group';
import { selectionChecksum, trialPlayback } from './playback-trial';

const selected = ['room-b', 'room-a'];
const present = new Set([...selected, 'remote']);
const tracks = [
  { kind: 'microphone', publisherId: 'room-a', muted: false, enabled: true },
  { kind: 'microphone', publisherId: 'room-b', muted: true, enabled: false },
  { kind: 'microphone', publisherId: 'remote', muted: false, enabled: true },
  { kind: 'screen', publisherId: 'room-a', muted: false, enabled: true },
  { kind: 'screen', publisherId: 'remote', muted: true, enabled: false },
] satisfies Array<PlaybackTrack & { enabled: boolean }>;
const trial = (listenerId: string, roster = present, code = 'ROOM42') =>
  trialPlayback({
    callId: 'call',
    code,
    connected: true,
    listenerId,
    present: roster,
    selected,
  });

describe('local playback trial', () => {
  it('suppresses peer mics without modifying screens or tracks', () => {
    const original = tracks.map((track) => ({ ...track }));
    expect(tracks.map(trial('room-a').suppresses)).toEqual([
      false,
      true,
      false,
      false,
      false,
    ]);
    expect(tracks.map(trial('room-b').suppresses)).toEqual([
      true,
      false,
      true,
      false,
      false,
    ]);
    expect(tracks.map(trial('remote').suppresses)).toEqual([
      false,
      false,
      false,
      false,
      false,
    ]);
    expect(tracks).toEqual(original);
  });

  it('restores normal playback on opt-out and elects after roster loss', () => {
    const remoteMic = tracks[2]!;
    expect(trial('room-b').speaker).toBe('room-a');
    expect(trial('room-b').suppresses(remoteMic)).toBe(true);
    expect(trial('room-b', present, '').suppresses(remoteMic)).toBe(false);
    const disconnected = trialPlayback({
      callId: 'call',
      code: 'ROOM42',
      connected: false,
      listenerId: 'room-a',
      present,
      selected,
    });
    expect(disconnected.suppresses(remoteMic)).toBe(true);
    expect(disconnected.suppresses(tracks[3]!)).toBe(false);
    const after = trial('room-b', new Set(['room-b', 'remote']));
    expect(after.speaker).toBe('room-b');
    expect(after.suppresses(remoteMic)).toBe(false);
  });

  it('checks the selection independently of ordering and presence', () => {
    expect(selectionChecksum(selected)).toBe(
      selectionChecksum(['room-a', 'room-b'])
    );
    expect(selectionChecksum(selected)).not.toBe(
      selectionChecksum(['room-b', 'remote'])
    );
  });
});
