import { describe, expect, it } from 'vitest';
import {
  createRoom,
  joinRoom,
  mutateRoom,
  normalizeRoom,
  projectRoom,
  seedRecords,
  starterScenarios,
} from './index';

const now = Date.now();
const host = {
  id: 'host',
  email: 'host@tuturuuu.com',
  name: 'Host',
  expires: now + 3600000,
};
const attendee = {
  id: 'attendee',
  email: 'member@rmit.edu.vn',
  name: 'Member',
  expires: now + 3600000,
};
const makeRoom = () =>
  createRoom(
    crypto.randomUUID(),
    host,
    { title: 'RISE', startsAt: null, endsAt: null, maxUsers: 10, teamCount: 4 },
    now
  );
describe('RISE learning and role boundaries', () => {
  it('isolates starter scenarios and evidence between rooms', () => {
    const first = makeRoom();
    first.scenario.brief = 'Private team modification';
    first.teams[0]!.records.find(
      (record) => record.id === 'rise-induction-brief'
    )!.content = 'Private edit';
    const second = makeRoom();
    expect(second.scenario.id).toBe('rise-induction-post');
    expect(second.scenario.brief).not.toBe(first.scenario.brief);
    expect(
      second.teams[0]!.records.find(
        (record) => record.id === 'rise-induction-brief'
      )!.content
    ).not.toBe('Private edit');
    expect(
      seedRecords().find((record) => record.id === 'rise-induction-brief')!
        .content
    ).toContain('FICTIONAL REHEARSAL');
  });
  it('adds the mission without replacing a room’s selected scenario or edited records', () => {
    const room = makeRoom();
    room.scenarios = [starterScenarios()[1]!];
    room.scenario = room.scenarios[0]!;
    room.teams[0]!.records[0]!.content = 'Edited source';
    normalizeRoom(room);
    normalizeRoom(room);
    expect(room.scenario.id).toBe('rise-pathways');
    expect(
      room.scenarios.filter((item) => item.id === 'rise-induction-post')
    ).toHaveLength(1);
    expect(room.teams[0]!.records[0]!.content).toBe('Edited source');
  });
  it('denies external workshop creation and promotion, and repairs legacy admin access', () => {
    expect(() => createRoom('room', attendee, { title: 'No' }, now)).toThrow(
      'staff_only'
    );
    const room = makeRoom();
    room.invites.push(attendee.email);
    joinRoom(room, attendee, 'team-1', false, now);
    expect(() =>
      mutateRoom(
        room,
        host,
        { action: 'admin', memberId: attendee.id, enabled: true },
        now
      )
    ).toThrow('staff_only');
    room.members.find((member) => member.id === attendee.id)!.admin = true;
    expect(projectRoom(room, attendee, [], now).self.admin).toBe(false);
    expect(() =>
      mutateRoom(room, attendee, { action: 'showcase', enabled: false }, now)
    ).toThrow('admin_only');
    normalizeRoom(room);
    expect(
      room.members.find((member) => member.id === attendee.id)!.admin
    ).toBe(false);
    mutateRoom(
      room,
      attendee,
      { action: 'prompt', prompt: 'My team instructions', revision: 0 },
      now
    );
    expect(room.teams[0]!.prompt).toBe('My team instructions');
  });
  it('keeps sponsorship receipt identifiers visible only to hosts', () => {
    const room = makeRoom();
    room.invites.push(attendee.email);
    joinRoom(room, attendee, 'team-1', false, now);
    room.sponsorship = {
      credits: 2,
      calls: 1,
      receipts: [
        {
          requestId: 'private-request',
          runId: 'ledger-run',
          credits: 2,
          operation: 'compile',
          teamId: 'team-2',
          at: now,
        },
      ],
    };
    expect(projectRoom(room, attendee, [], now).sponsorship?.receipts).toEqual(
      []
    );
    expect(projectRoom(room, host, [], now).sponsorship?.receipts).toHaveLength(
      1
    );
  });
});
