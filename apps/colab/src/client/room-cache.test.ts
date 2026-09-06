import { QueryClient } from '@tanstack/react-query';
import { createRoom, joinRoom, projectRoom } from '@tuturuuu/multiplayer';
import { expect, it } from 'vitest';
import { newestRoomView } from './room-cache';

it('does not restore hidden teams when an older HTTP request finishes after the admin toggle', async () => {
  const now = Date.now();
  const owner = {
    id: 'host',
    email: 'host@tuturuuu.com',
    name: 'Host',
    expires: now + 3600000,
  };
  const viewer = { ...owner, id: 'viewer', email: 'viewer@example.com' };
  const room = createRoom(
    'demo',
    owner,
    {
      title: 'Demo',
      startsAt: now,
      endsAt: now + 3600000,
      teamCount: 2,
      maxUsers: 4,
    },
    now
  );
  room.invites.push(viewer.email);
  joinRoom(room, viewer, 'team-2', false, now);
  room.teams[0]!.prompt = 'Hidden team prompt';
  const visible = projectRoom(room, viewer, [], now);
  room.showcase = false;
  room.revision++;
  const hidden = projectRoom(room, viewer, [], now);
  const client = new QueryClient();
  const queryKey = ['room', room.id];
  let resolve!: (value: typeof visible) => void;
  const pending = client.fetchQuery({
    queryKey,
    queryFn: () =>
      new Promise<typeof visible>((done) => {
        resolve = done;
      }),
    structuralSharing: newestRoomView,
  });
  client.setQueryData(queryKey, hidden);
  resolve(visible);
  await pending;
  expect(client.getQueryData(queryKey)).toEqual(hidden);
  expect(JSON.stringify(client.getQueryData(queryKey))).not.toContain(
    'Hidden team prompt'
  );
  client.setQueryData(queryKey, visible);
  expect(client.getQueryData(queryKey)).toEqual(hidden);
  client.clear();
});
