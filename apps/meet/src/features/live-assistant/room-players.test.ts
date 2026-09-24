import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  players: [] as Array<{
    setVolume: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    interrupt: ReturnType<typeof vi.fn>;
    play: ReturnType<typeof vi.fn>;
    unlock: ReturnType<typeof vi.fn>;
  }>,
}));
vi.mock('./audio', () => ({
  LiveAudioPlayer: class {
    setVolume = vi.fn();
    close = vi.fn();
    interrupt = vi.fn();
    play = vi.fn();
    unlock = vi.fn(async () => {});
    constructor() {
      mocks.players.push(this);
    }
  },
}));

import { RoomAudioPlayers } from './room-players';

it('isolates speaker interruption and removal while keeping other playback active', async () => {
  const room = new RoomAudioPlayers(vi.fn());
  room.activate('a');
  room.activate('b');
  await room.unlock('speaker');
  room.interrupt('a');
  expect(mocks.players[0]!.interrupt).toHaveBeenCalledOnce();
  expect(mocks.players[1]!.interrupt).not.toHaveBeenCalled();
  room.deactivate('a');
  room.play('b', 'AAAA');
  expect(mocks.players[1]!.play).toHaveBeenCalledWith('AAAA');
  expect(mocks.players[1]!.close).not.toHaveBeenCalled();
  room.mute();
  room.activate('c');
  expect(mocks.players[2]!.close).toHaveBeenCalledOnce();
});

it('mute wins over a pending unlock and later sessions remain muted', async () => {
  const room = new RoomAudioPlayers(vi.fn());
  room.activate('delayed');
  let finish!: () => void;
  mocks.players.at(-1)!.unlock.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      })
  );
  const unlocking = room.unlock('speaker');
  room.mute();
  finish();
  expect(await unlocking).toBe(false);
  room.activate('next');
  expect(mocks.players.at(-1)!.close).toHaveBeenCalledOnce();
  expect(mocks.players.at(-1)!.unlock).not.toHaveBeenCalled();
});

it('ignores a removed speaker failing during a pending unlock', async () => {
  const room = new RoomAudioPlayers(vi.fn());
  room.activate('removed');
  let reject!: (error: Error) => void;
  mocks.players.at(-1)!.unlock.mockImplementation(
    () =>
      new Promise<void>((_, fail) => {
        reject = fail;
      })
  );
  room.activate('remaining');
  const remaining = mocks.players.at(-1)!;
  const unlocking = room.unlock('speaker');
  room.deactivate('removed');
  reject(new Error('context closed'));
  expect(await unlocking).toBe(true);
  expect(remaining.close).not.toHaveBeenCalled();
});

it('applies volume to active and newly announced Mira sessions', () => {
  const room = new RoomAudioPlayers(vi.fn());
  room.setVolume(0.3);
  room.activate('first');
  const first = mocks.players.at(-1)!;
  expect(first.setVolume).toHaveBeenLastCalledWith(0.3);
  room.setVolume(0.1);
  expect(first.setVolume).toHaveBeenLastCalledWith(0.1);
  room.activate('second');
  expect(mocks.players.at(-1)!.setVolume).toHaveBeenLastCalledWith(0.1);
});
