import { beforeEach, expect, it, vi } from 'vitest';
import { z } from 'zod';

vi.mock('server-only', () => ({}));
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

const f = vi.hoisted(() => ({
  fetch: vi.fn(),
  tools: vi.fn(),
  execute: vi.fn(),
}));
vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: async () => ({
    env: {
      MEET_LIVE: {
        idFromName: (id: string) => id,
        get: () => ({ fetch: f.fetch }),
      },
    },
  }),
}));
vi.mock('@/features/call/server/room-service', () => ({
  callRoomService: vi.fn(async () => ({})),
  roomRoute: async (
    _request: Request,
    _id: string,
    action: (access: unknown) => unknown
  ) => action({ user: { id: 'authenticated-owner' } }),
}));
vi.mock('@/features/live-assistant/workspace-tools', () => ({
  liveWorkspaceTools: f.tools,
}));

import { POST } from './route';

const sessionId = '00000000-0000-4000-8000-000000000001';
const reviewId = '00000000-0000-4000-8000-000000000002';
const invoke = (approved = true) =>
  POST(
    new Request('https://meet.test/review', {
      method: 'POST',
      body: JSON.stringify({
        sessionId,
        reviewId,
        approved,
        ownerId: 'spoof',
        args: { title: 'spoof' },
      }),
    }),
    { params: Promise.resolve({ meetingId: 'meeting' }) }
  );
beforeEach(() => {
  vi.resetAllMocks();
  f.fetch.mockImplementation(async (_url, options) => {
    const body = JSON.parse(options.body);
    return Response.json(
      body.action === 'claim'
        ? {
            workspaceId: 'selected-workspace',
            timezone: 'UTC',
            toolName: 'create_task',
            args: { title: 'Approved task' },
          }
        : { ok: true }
    );
  });
  f.execute.mockResolvedValue({ id: 'created' });
  f.tools.mockResolvedValue({
    create_task: {
      inputSchema: z.object({ title: z.string() }),
      execute: f.execute,
    },
  });
});
it('executes only the claimed arguments under the authenticated requester', async () => {
  await invoke();
  const claim = JSON.parse(f.fetch.mock.calls[0]![1].body);
  expect(claim.ownerId).toBe('authenticated-owner');
  expect(f.tools).toHaveBeenCalledWith(
    { user: { id: 'authenticated-owner' } },
    'selected-workspace',
    'UTC'
  );
  expect(f.execute).toHaveBeenCalledExactlyOnceWith(
    { title: 'Approved task' },
    { toolCallId: reviewId, messages: [] }
  );
});
it('denial neither resolves workspace credentials nor executes a tool', async () => {
  await invoke(false);
  expect(f.tools).not.toHaveBeenCalled();
  expect(f.execute).not.toHaveBeenCalled();
});
it('does not execute rejected or duplicate claims', async () => {
  f.fetch.mockResolvedValue(new Response('Already handled', { status: 409 }));
  await expect(invoke()).rejects.toThrow('Review unavailable');
  expect(f.tools).not.toHaveBeenCalled();
});
it('revoked membership fails the review without running or retrying the operation', async () => {
  f.tools.mockRejectedValue(new Error('Membership revoked'));
  await invoke();
  expect(f.execute).not.toHaveBeenCalled();
  expect(JSON.parse(f.fetch.mock.calls[1]![1].body)).toMatchObject({
    action: 'finish',
    failed: true,
  });
});
it('does not rerun an operation when reporting its outcome fails', async () => {
  f.fetch
    .mockImplementationOnce(async () =>
      Response.json({
        workspaceId: 'selected-workspace',
        timezone: 'UTC',
        toolName: 'create_task',
        args: { title: 'Approved task' },
      })
    )
    .mockResolvedValue(new Response('Ended', { status: 409 }));
  await expect(invoke()).rejects.toThrow('Action may have completed');
  expect(f.execute).toHaveBeenCalledOnce();
});
