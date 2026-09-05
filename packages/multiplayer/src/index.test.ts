import { describe, expect, it } from 'vitest';
import {
  createRoom,
  editable,
  type Identity,
  joinRoom,
  memberOf,
  mutateRoom,
  projectRoom,
  staff,
} from './index';

const now = Date.now();
const owner: Identity = {
  id: 'owner',
  email: 'host@tuturuuu.com',
  name: 'Host',
  expires: now + 86400000,
};
const alice: Identity = {
  id: 'alice',
  email: 'alice@example.com',
  name: 'Alice',
  expires: now + 86400000,
};
const bob: Identity = {
  id: 'bob',
  email: 'bob@example.com',
  name: 'Bob',
  expires: now + 86400000,
};
const guest: Identity = {
  id: 'guest:g',
  email: null,
  name: 'Guest',
  expires: now + 86400000,
};
const input = {
  title: 'Workshop',
  startsAt: now,
  endsAt: now + 3600000,
  maxUsers: 4,
  teamCount: 2,
};
function room() {
  const r = createRoom('room', owner, input, now);
  r.invites = [alice.email!, bob.email!];
  return r;
}
describe('server-authoritative room policy', () => {
  it('requires an exact staff email domain', () => {
    for (const email of [
      'host@tuturuuu.com.evil.test',
      'x+tuturuuu.com@example.com',
      '@tuturuuu.com',
      'host@other.com',
      null,
    ])
      expect(staff({ email })).toBe(false);
    expect(staff({ email: 'HOST@TUTURUUU.COM' })).toBe(true);
    expect(() => createRoom('r', alice, input, now)).toThrow('staff_only');
  });
  it('rejects invalid limits and schedules', () => {
    for (const changes of [
      { endsAt: now },
      { endsAt: now + 9 * 3600000 },
      { startsAt: NaN },
      { maxUsers: 101 },
      { maxUsers: 1 },
      { teamCount: 13 },
      { teamCount: 1.5 },
    ])
      expect(() =>
        createRoom('r', owner, { ...input, ...changes }, now)
      ).toThrow();
  });
  it('requires invitations, preserves capacity, and allows idempotent rejoin', () => {
    const r = room();
    r.maxUsers = 2;
    expect(() => joinRoom(r, guest, 'team-1', false, now)).toThrow(
      'not_invited'
    );
    joinRoom(r, alice, 'team-1', false, now);
    joinRoom(r, alice, 'team-1', false, now);
    expect(r.members).toHaveLength(2);
    expect(() => joinRoom(r, bob, 'team-2', false, now)).toThrow('room_full');
  });
  it('enforces guest password expiration and rotation', () => {
    const r = room();
    r.passwordExpires = now - 1;
    expect(() => joinRoom(r, guest, 'team-1', true, now)).toThrow(
      'not_invited'
    );
    r.passwordExpires = now + 1000;
    joinRoom(r, guest, 'team-1', true, now);
    r.guestVersion++;
    expect(() => memberOf(r, guest, now)).toThrow('not_invited');
  });
  it('allows an invited lobby but prevents early edits and late joins', () => {
    const r = room();
    r.startsAt = now + 1000;
    joinRoom(r, alice, 'team-1', false, now);
    expect(() => editable(r, now)).toThrow('room_not_open');
    expect(() => joinRoom(r, bob, 'team-2', false, r.endsAt)).toThrow(
      'room_not_open'
    );
    expect(projectRoom(r, alice, [], r.endsAt).mode).toBe('readonly');
  });
  it('filters other teams, emails and invitations until showcase', () => {
    const r = room();
    joinRoom(r, alice, 'team-1', false, now);
    joinRoom(r, bob, 'team-2', false, now);
    r.teams[1]!.prompt = 'Secret team draft';
    r.passwordHash = 'secret';
    const view = projectRoom(r, alice, ['owner', 'alice', 'bob'], now);
    expect(view.teams).toHaveLength(1);
    expect(view.members.some((m) => m.id === 'bob')).toBe(false);
    expect(view.online).toEqual(['owner', 'alice']);
    expect(JSON.stringify(view)).not.toContain('secret');
    expect(view.invites).toBeUndefined();
    expect(view.members.find((m) => m.id === 'owner')?.email).toBeNull();
    mutateRoom(r, owner, { action: 'showcase', enabled: true }, now);
    expect(projectRoom(r, alice, [], now).teams).toHaveLength(2);
    expect(() =>
      mutateRoom(
        r,
        alice,
        { action: 'prompt', prompt: 'change', revision: 0, teamId: 'team-2' },
        now
      )
    ).not.toThrow();
    expect(r.teams[1]!.prompt).toBe('Secret team draft');
  });
  it('checks delegation, owner protection, read-only and private access', () => {
    const r = room();
    joinRoom(r, alice, 'team-1', false, now);
    joinRoom(r, bob, 'team-2', false, now);
    expect(() =>
      mutateRoom(r, alice, { action: 'showcase', enabled: true }, now)
    ).toThrow('admin_only');
    mutateRoom(
      r,
      owner,
      { action: 'admin', memberId: alice.id, enabled: true },
      now
    );
    expect(() =>
      mutateRoom(
        r,
        alice,
        { action: 'admin', memberId: bob.id, enabled: true },
        now
      )
    ).toThrow('staff_only');
    expect(() =>
      mutateRoom(
        r,
        owner,
        { action: 'admin', memberId: owner.id, enabled: false },
        now
      )
    ).toThrow('owner_protected');
    mutateRoom(r, alice, { action: 'mode', mode: 'readonly' }, now);
    expect(() =>
      mutateRoom(r, bob, { action: 'prompt', prompt: 'x', revision: 0 }, now)
    ).toThrow('room_not_open');
    mutateRoom(r, alice, { action: 'mode', mode: 'private' }, now);
    expect(() => projectRoom(r, bob, [], now)).toThrow('private_room');
    expect(projectRoom(r, alice, [], now).self.admin).toBe(true);
  });
  it('revokes members immediately and detects stale edits', () => {
    const r = room();
    joinRoom(r, alice, 'team-1', false, now);
    mutateRoom(
      r,
      alice,
      { action: 'prompt', prompt: 'First', revision: 0 },
      now
    );
    expect(() =>
      mutateRoom(
        r,
        owner,
        { action: 'prompt', prompt: 'Overwrite', revision: 0 },
        now
      )
    ).toThrow('edit_conflict');
    mutateRoom(r, owner, { action: 'revoke', email: alice.email }, now);
    expect(() => projectRoom(r, alice, [], now)).toThrow('not_invited');
  });
});
