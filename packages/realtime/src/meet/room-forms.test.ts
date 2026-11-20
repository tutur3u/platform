import { describe, expect, it } from 'vitest';
import { meetRealtimeTokenPayloadSchema } from './primitives';
import { createMeetRoomSnapshot } from './room';
import { endMeetRoom } from './room-ending';
import { applyRoomForms } from './room-forms';
import { roomService } from './room-service';

const flags = {
  MEET_FORMS_ENABLED: 'true',
  MEET_FORMS_EXTENDED_ENABLED: 'true',
};
const applyForms = (
  state: Parameters<typeof applyRoomForms>[0],
  token: Parameters<typeof applyRoomForms>[1],
  command: unknown
) => applyRoomForms(state, token, command, flags);

const service = (
  state: Parameters<typeof roomService>[0],
  token: Parameters<typeof roomService>[1],
  command: unknown
) => roomService(state, token, command, undefined, flags);

const wsId = '10000000-0000-4000-8000-000000000001';
const meetingId = '10000000-0000-4000-8000-000000000002';
const userId = '10000000-0000-4000-8000-000000000003';
const launchId = '10000000-0000-4000-8000-000000000004';
const formId = '10000000-0000-4000-8000-000000000005';
const versionId = '10000000-0000-4000-8000-000000000006';

const host = meetRealtimeTokenPayloadSchema.parse({
  wsId,
  meetingId,
  userId,
  roomId: `${wsId}:${meetingId}`,
  role: 'host',
  exp: 2000000000,
  limits: {},
  scopes: ['meet:server', 'meet:workspace-member'],
});
const guest = { ...host, role: 'speaker' as const, scopes: ['meet:server'] };
const launch = { launchId, formId, versionId, form: { id: formId, wsId } };
const create = { action: 'forms.launch', launch };
const get = { action: 'forms.get', launchId };

function admittedRoom() {
  return {
    ...createMeetRoomSnapshot(),
    approved: { [userId]: { userId, displayName: 'Guest' } },
  };
}

describe('room Forms admission', () => {
  it('requires a room-bound server capability and admission', () => {
    const room = admittedRoom();
    expect(applyForms(room, { ...guest, scopes: [] }, get)).toMatchObject({
      status: 403,
    });
    expect(applyForms(room, { ...guest, roomId: wsId }, get)).toMatchObject({
      status: 403,
    });
    expect(applyForms(createMeetRoomSnapshot(), guest, get)).toMatchObject({
      status: 403,
    });
    expect(applyForms({ ...room, ended: true }, guest, get)).toMatchObject({
      status: 409,
    });
  });

  it('lets admitted guests read launches but denies host commands', () => {
    const room = admittedRoom();
    expect(applyForms(room, guest, create)).toMatchObject({ status: 403 });
    expect(
      applyForms(room, { ...host, scopes: ['meet:server'] }, create)
    ).toMatchObject({ status: 403 });
    const stored = applyForms(room, host, create);
    expect(stored?.body).toEqual(launch);
    expect(stored && applyForms(stored.state, guest, get)?.body).toEqual(
      launch
    );
    expect(applyForms(room, guest, get)).toMatchObject({ status: 404 });
    expect(
      stored &&
        applyForms(stored.state, guest, {
          ...get,
          action: 'forms.results_scope',
        })
    ).toMatchObject({ status: 403 });
  });

  it('rejects another workspace and replays a stable launch only once', () => {
    const room = admittedRoom();
    expect(
      applyForms(room, host, {
        ...create,
        launch: { ...launch, form: { ...launch.form, wsId: meetingId } },
      })
    ).toMatchObject({ status: 403 });
    const stored = applyForms(room, host, create);
    expect(stored?.body).toEqual(launch);
    if (!stored) throw new Error('Expected stored launch');
    expect(applyForms(stored.state, host, create)?.state).toBe(stored.state);
    expect(
      applyForms(stored.state, host, {
        ...create,
        launch: { ...launch, versionId: meetingId },
      })
    ).toMatchObject({ status: 409 });
  });
});

const publishedLaunch = { ...launch, publication: true };
const readPublished = { ...get, publication: true };
const managePublished = { ...readPublished, action: 'forms.results_scope' };

function launchPublication() {
  const stored = service(admittedRoom(), host, {
    action: 'forms.launch',
    launch: publishedLaunch,
  });
  expect(stored.status).toBeUndefined();
  expect(stored.body).toEqual({ ...publishedLaunch, roomId: host.roomId });
  return stored.state;
}

describe('published Forms via room-service', () => {
  it('changes no room state unless the required flags are explicitly enabled', () => {
    const state = admittedRoom();
    expect(roomService(state, host, create)).toMatchObject({
      state,
      status: 404,
    });
    const launch = { action: 'forms.launch', launch: publishedLaunch };
    expect(
      roomService(state, host, launch, undefined, {
        MEET_FORMS_EXTENDED_ENABLED: 'true',
      })
    ).toMatchObject({ state, status: 404 });
    expect(
      roomService(state, host, launch, undefined, {
        MEET_FORMS_ENABLED: 'true',
      })
    ).toMatchObject({ state, status: 404 });
  });

  it('binds both the participant and manager reads to the launch meeting', () => {
    const state = launchPublication();
    const foreignMeetingId = '10000000-0000-4000-8000-000000000007';
    const foreignHost = {
      ...host,
      meetingId: foreignMeetingId,
      roomId: `${wsId}:${foreignMeetingId}`,
    };
    for (const request of [readPublished, managePublished]) {
      expect(service(state, host, request).body).toEqual({
        ...publishedLaunch,
        roomId: host.roomId,
      });
      expect(service(admittedRoom(), foreignHost, request).status).toBe(404);
      expect(service(state, foreignHost, request).status).toBe(404);
    }
  });

  it('refuses ended and previously closed launches after room restoration', () => {
    const state = launchPublication();
    const ended = endMeetRoom(state, '2026-11-19T02:00:00Z');
    const restored = { ...ended, ended: false };
    for (const request of [readPublished, managePublished]) {
      expect(service(ended, host, request).status).toBe(409);
      expect(service(restored, host, request).status).toBe(404);
    }
    expect(
      service(restored, host, {
        action: 'forms.launch',
        launch: publishedLaunch,
      }).status
    ).toBe(409);
  });
});
