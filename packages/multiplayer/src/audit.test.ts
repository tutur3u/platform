import { expect, it } from 'vitest';
import { createRoom, joinRoom, projectRoom } from './index';

it('projects audit events using current team visibility and admin permissions', () => {
  const now = Date.now();
  const host = {
    id: 'host',
    name: 'Host',
    email: 'host@tuturuuu.com',
    expires: now + 3600000,
  };
  const alice = {
    id: 'alice',
    name: 'Alice',
    email: 'alice@example.com',
    expires: host.expires,
  };
  const room = createRoom('audit', host, {
    title: 'Audit',
    startsAt: now,
    endsAt: host.expires,
    maxUsers: 4,
    teamCount: 2,
  });
  room.invites.push(alice.email);
  joinRoom(room, alice, 'team-1', false);
  room.audit = [
    { id: 'public', at: now, actor: 'Colab', action: 'created' },
    { id: 'own', at: now, actor: 'Alice', action: 'prompt', teamId: 'team-1' },
    { id: 'other', at: now, actor: 'Bob', action: 'prompt', teamId: 'team-2' },
    {
      id: 'admin',
      at: now,
      actor: 'Host',
      action: 'password',
      adminOnly: true,
    },
  ];
  expect(projectRoom(room, alice).audit?.map((e) => e.id)).toEqual([
    'public',
    'own',
    'other',
  ]);
  room.showcase = false;
  expect(projectRoom(room, alice).audit?.map((e) => e.id)).toEqual([
    'public',
    'own',
  ]);
  expect(projectRoom(room, host).audit).toHaveLength(4);
  delete room.audit;
  expect(projectRoom(room, alice).audit).toEqual([]);
});
