import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  players: [] as Array<{
    close: ReturnType<typeof vi.fn>;
    interrupt: ReturnType<typeof vi.fn>;
    play: ReturnType<typeof vi.fn>;
    unlock: ReturnType<typeof vi.fn>;
  }>,
}));
vi.mock('./audio', () => ({
  LiveAudioPlayer: class {
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
