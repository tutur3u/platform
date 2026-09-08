import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  personal: vi.fn(async () => 'creator-drive'),
  service: vi.fn(async () => ({})),
  upload: vi.fn(
    async (
      _ws: string,
      _path: string,
      _bytes: Uint8Array,
      _options: unknown
    ) => ({})
  ),
  remove: vi.fn(async () => ({})),
}));
vi.mock('@/features/call/lib/call-access', () => ({
  MeetCallAccessError: class extends Error {
    constructor(
      public status: number,
      message: string
    ) {
      super(message);
    }
  },
}));
vi.mock('@tuturuuu/storage-core/workspace-storage-provider', () => ({
  uploadWorkspaceStorageFileDirect: mocks.upload,
  deleteWorkspaceStorageObjectByPath: mocks.remove,
  createWorkspaceStorageSignedReadUrl: vi.fn(),
}));
vi.mock('@/features/call/server/room-service', () => ({
  personalWorkspace: mocks.personal,
  callRoomService: mocks.service,
  roomRoute: async (
    _request: Request,
    _id: string,
    run: (access: unknown) => Promise<unknown>
  ) =>
    Response.json(
      await run({ user: { id: 'guest' }, meeting: { creator_id: 'creator' } })
    ),
}));

import { POST } from './route';

const params = { params: Promise.resolve({ meetingId: 'room' }) };
function request() {
  const form = new FormData();
  form.set('file', new File(['picture'], 'photo.png', { type: 'image/png' }));
  return new Request('https://meet.test/api/meet-call/room/files', {
    method: 'POST',
    body: form,
  });
}
beforeEach(() => vi.clearAllMocks());
it('checks admission before uploading into the creator personal Drive', async () => {
  const response = await POST(request(), params);
  expect(response.status).toBe(200);
  expect(mocks.service).toHaveBeenNthCalledWith(1, expect.anything(), {
    action: 'read',
  });
  expect(mocks.personal).toHaveBeenCalledWith('creator');
  expect(mocks.upload).toHaveBeenCalledWith(
    'creator-drive',
    expect.stringMatching(/^Meet\/room\/Chat\//),
    expect.any(Uint8Array),
    { contentType: 'image/png', upsert: false }
  );
  expect(mocks.service).toHaveBeenLastCalledWith(
    expect.anything(),
    expect.objectContaining({
      action: 'attach',
      attachment: expect.objectContaining({
        storageWsId: 'creator-drive',
        name: 'photo.png',
      }),
    })
  );
  expect(await response.json()).not.toHaveProperty('path');
});
it('does not upload if room admission fails', async () => {
  mocks.service.mockRejectedValueOnce(new Error('Not admitted'));
  await expect(POST(request(), params)).rejects.toThrow('Not admitted');
  expect(mocks.upload).not.toHaveBeenCalled();
});
it('cleans up only this upload when attachment registration fails', async () => {
  mocks.service
    .mockResolvedValueOnce({})
    .mockRejectedValueOnce(new Error('Room ended'));
  await expect(POST(request(), params)).rejects.toThrow('Room ended');
  expect(mocks.remove).toHaveBeenCalledWith(
    'creator-drive',
    mocks.upload.mock.calls[0]?.[1]
  );
});
