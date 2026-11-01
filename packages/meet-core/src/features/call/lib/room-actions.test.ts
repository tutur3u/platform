import { expect, it, vi } from 'vitest';
import { createRoomActions } from './room-actions';
import { MeetSignaling } from './signaling';

it('replays the latest lobby name and media after reconnecting', () => {
  const signaling = new MeetSignaling({
    resolveUrl: () => '',
    onMessage: () => {},
    onStatusChange: () => {},
  });
  const send = vi.spyOn(signaling, 'send').mockImplementation(() => {});
  const actions = createRoomActions({ current: signaling });
  const media = {
    audioEnabled: true,
    videoEnabled: false,
    screenEnabled: false,
  };
  actions.setDisplayName('  Alex  ');
  actions.replayPresenceJoin(media);
  expect(send.mock.calls).toEqual([
    [{ type: 'presence.join', displayName: 'Alex' }],
    [{ type: 'presence.join', displayName: 'Alex', media }],
  ]);
  actions.setDisplayName('  ');
  expect(send).toHaveBeenCalledTimes(2);
});
