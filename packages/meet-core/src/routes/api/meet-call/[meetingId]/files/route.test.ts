import { expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({
  callRoomService: vi.fn(),
  signedRead: vi.fn(async () => 'https://storage.test/signed'),
}));

vi.mock('next/server', () => ({ connection: async () => undefined }));
vi.mock('@tuturuuu/utils/meet-url', () => ({
  meetPathForRequest: (path: string) => `https://meet.test${path}`,
}));
vi.mock('@tuturuuu/meet-core/features/call/lib/call-access', () => {
  class MeetCallAccessError extends Error {
    constructor(
      public status: number,
      message: string
    ) {
      super(message);
    }
  }
  return { MeetCallAccessError };
});
vi.mock('@tuturuuu/meet-core/features/call/server/read-upload', () => ({
  readBoundedFormData: vi.fn(),
}));
vi.mock('@tuturuuu/storage-core/workspace-storage-provider', () => ({
  createWorkspaceStorageSignedReadUrl: fixture.signedRead,
  deleteWorkspaceStorageObjectByPath: vi.fn(),
  uploadWorkspaceStorageFileDirect: vi.fn(),
}));
vi.mock('@tuturuuu/meet-core/features/call/server/room-service', () => ({
  callRoomService: fixture.callRoomService,
  personalWorkspace: vi.fn(),
  roomRoute: async (
    _request: Request,
    _meetingId: string,
    work: (access: unknown) => Promise<unknown>
  ) => {
    const result = await work({});
    return result instanceof Response ? result : Response.json(result);
  },
}));

import { GET } from './route';

const meetingId = '5e5217de-9bb3-4e20-8d99-526ad3e7e34f';
const id = '44444444-4444-4444-8444-444444444444';

it('returns only the file name, size, type and a fresh read URL', async () => {
  // Even if the room ever returned more, the route passes on only these.
  fixture.callRoomService.mockResolvedValue({
    id,
    name: 'slide.png',
    size: 10,
    contentType: 'image/png',
    path: `Meet/${meetingId}/Chat/${id}-slide.png`,
    storageWsId: '0f1a64f7-780f-4d30-9d72-5530f204e95c',
    ownerAccountId: '9b5c036d-d38d-4c12-b8e8-2e0b2b4a2691',
    published: true,
    discarded: false,
    withheld: false,
  });
  const response = await GET(
    new Request(`https://meet.test/api/meet-call/${meetingId}/files?id=${id}`),
    { params: Promise.resolve({ meetingId }) }
  );
  const body = await response.json();
  expect(Object.keys(body).sort()).toEqual([
    'contentType',
    'id',
    'name',
    'size',
    'url',
  ]);
  expect(body).toMatchObject({ id, name: 'slide.png', size: 10 });
  expect(body.url).toContain('download=1');
  const raw = JSON.stringify(body);
  for (const field of [
    'ownerAccountId',
    'published',
    'discarded',
    'withheld',
    'path',
    'storageWsId',
    '9b5c036d',
  ])
    expect(raw).not.toContain(field);
  expect(fixture.callRoomService).toHaveBeenCalledWith(expect.anything(), {
    action: 'attachment',
    id,
  });
});
