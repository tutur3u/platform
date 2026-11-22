import { expect, it } from 'vitest';
import {
  admitOrHold,
  createMeetRoomSnapshot,
  meetRealtimeTokenPayloadSchema,
} from './index';
import { type RoomServiceState, roomService } from './room-service';

const uploader = '9b5c036d-d38d-4c12-b8e8-2e0b2b4a2691';
const hostId = '9b5c036d-d38d-4c12-b8e8-2e0b2b4a2692';
const otherId = '9b5c036d-d38d-4c12-b8e8-2e0b2b4a2693';
const fileId = '44444444-4444-4444-8444-444444444444';
const now = '2026-11-23T00:00:00Z';
const token = (userId: string, role: 'host' | 'speaker' = 'speaker') =>
  meetRealtimeTokenPayloadSchema.parse({
    exp: 2000000000,
    limits: {},
    meetingId: '5e5217de-9bb3-4e20-8d99-526ad3e7e34f',
    mode: 'call',
    role,
    roomId: 'room',
    scopes: ['meet:server'],
    userId,
    accountId: userId,
    wsId: '0f1a64f7-780f-4d30-9d72-5530f204e95c',
  });
const member = token(uploader);
const host = token(hostId, 'host');
const other = token(otherId);

function room(extra: Record<string, unknown> = {}): RoomServiceState {
  let state = createMeetRoomSnapshot();
  for (const entry of [member, host, other])
    state = admitOrHold(state, entry, now).state;
  const attached = roomService(state, member, {
    action: 'attach',
    attachment: {
      id: fileId,
      name: 'slide.png',
      size: 10,
      contentType: 'image/png',
      path: `Meet/x/Chat/${fileId}-slide.png`,
      storageWsId: member.wsId,
    },
  }).state;
  return {
    ...attached,
    attachments: {
      [fileId]: { ...attached.attachments![fileId]!, ...extra },
    },
  };
}

it('answers a read with what signing needs and nothing about the uploader', () => {
  const read = roomService(room({ published: true }), other, {
    action: 'attachment',
    id: fileId,
  });
  expect(read.status).toBeUndefined();
  expect(Object.keys(read.body as object).sort()).toEqual([
    'contentType',
    'id',
    'name',
    'path',
    'size',
    'storageWsId',
  ]);
  const raw = JSON.stringify(read.body);
  for (const field of ['ownerAccountId', 'published', 'discarded', uploader])
    expect(raw).not.toContain(field);
});

it('lets only hosts read a withheld file', () => {
  const state = room({ published: true, withheld: true });
  for (const reader of [other, member])
    expect(
      roomService(state, reader, { action: 'attachment', id: fileId }).status
    ).toBe(404);
  expect(
    roomService(state, host, { action: 'attachment', id: fileId }).status
  ).toBeUndefined();
});

it('lets the uploader or a host remove a released file, and nobody else', () => {
  const released = room({ discarded: true, released: true });
  expect(
    roomService(released, other, { action: 'attachment.discard', id: fileId })
      .status
  ).toBe(404);
  for (const remover of [member, host]) {
    const discarded = roomService(released, remover, {
      action: 'attachment.discard',
      id: fileId,
    });
    expect(discarded.body).toMatchObject({ storageWsId: member.wsId });
    const deleted = roomService(discarded.state, remover, {
      action: 'attachment.deleted',
      id: fileId,
    });
    expect(deleted.state.attachments?.[fileId]).toBeUndefined();
  }
  // A host may not remove a file that no deleted answer released.
  expect(
    roomService(room(), host, { action: 'attachment.discard', id: fileId })
      .status
  ).toBe(404);
});
