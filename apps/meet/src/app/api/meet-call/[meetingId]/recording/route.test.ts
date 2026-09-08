import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  personal: vi.fn(async (_id: string) => 'creator-drive'),
  service: vi.fn(async (_access: unknown, _command: unknown) => ({
    saved: false,
  })),
  remove: vi.fn(async () => undefined),
  metadata: vi.fn(async () => ({ size: 100, contentType: 'video/webm' })),
  upload: vi.fn(async () => ({ provider: 'r2', token: 'synthetic-test' })),
}));
vi.mock('next/server', () => ({ connection: vi.fn() }));
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
  createWorkspaceStorageSignedReadUrl: vi.fn(),
  deleteWorkspaceStorageObjectByPath: mocks.remove,
  createWorkspaceStorageUploadPayload: mocks.upload,
  getWorkspaceStorageObjectMetadataForProvider: mocks.metadata,
  resolveWorkspaceStorageProvider: async () => ({ provider: 'r2' }),
  WorkspaceStorageError: class extends Error {
    constructor(public status: number) {
      super('storage');
    }
  },
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
      await run({
        user: { id: 'recorder' },
        meeting: { creator_id: 'creator' },
      })
    ),
}));

import { POST, PUT } from './route';

const sessionId = '11111111-1111-4111-8111-111111111111';
const params = { params: Promise.resolve({ meetingId: 'room' }) };
const request = (method: string) =>
  new Request('https://meet.test/recording', {
    method,
    body: JSON.stringify({
      sessionId,
      contentType: 'video/webm',
      size: 100,
      storageWsId: 'attacker-drive',
      path: 'attacker-path',
    }),
  });
beforeEach(() => vi.clearAllMocks());
it('authorizes the recording lease before accessing creator storage', async () => {
  mocks.service.mockRejectedValueOnce(new Error('No lease'));
  await expect(POST(request('POST'), params)).rejects.toThrow('No lease');
  expect(mocks.personal).not.toHaveBeenCalled();
  expect(mocks.upload).not.toHaveBeenCalled();
});
it('finalizes only verified metadata at the server-derived creator Drive path', async () => {
  const response = await PUT(request('PUT'), params);
  expect(response.status).toBe(200);
  expect(mocks.personal).toHaveBeenCalledWith('creator');
  expect(mocks.service).toHaveBeenLastCalledWith(expect.anything(), {
    action: 'recording.save',
    sessionId,
    path: `Meet/room/Recordings/${sessionId}.webm`,
    storageWsId: 'creator-drive',
  });
});
it('does not mark a mismatched uploaded object ready', async () => {
  mocks.metadata.mockResolvedValueOnce({
    size: 101,
    contentType: 'video/webm',
  });
  await expect(PUT(request('PUT'), params)).rejects.toMatchObject({
    status: 409,
  });
  expect(mocks.service).toHaveBeenCalledTimes(1);
  expect(mocks.remove).toHaveBeenCalledWith(
    'creator-drive',
    `Meet/room/Recordings/${sessionId}.webm`
  );
});
it('keeps a saved session idempotent without issuing another upload', async () => {
  mocks.service.mockResolvedValueOnce({ saved: true });
  const response = await POST(request('POST'), params);
  expect(await response.json()).toEqual({ alreadySaved: true, ok: true });
  expect(mocks.upload).not.toHaveBeenCalled();
});

it('rejects malformed recording JSON as a client error', async () => {
  for (const handler of [POST, PUT]) {
    await expect(
      handler(
        new Request('https://meet.test/recording', {
          method: 'POST',
          body: '{',
        }),
        params
      )
    ).rejects.toMatchObject({ status: 400 });
  }
});
it('does not reuse uploaded bytes with a different content type', async () => {
  mocks.metadata.mockResolvedValueOnce({
    size: 100,
    contentType: 'audio/webm',
  });
  await expect(POST(request('POST'), params)).rejects.toMatchObject({
    status: 409,
  });
});
