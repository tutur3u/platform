import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { z } from 'zod';

vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/meet-core/features/call/lib/call-access', () => ({
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
vi.mock('@tuturuuu/meet-core/features/call/server/room-service', () => ({
  callRoomService: vi.fn(async () => ({})),
  roomRoute: async (
    _request: Request,
    _id: string,
    action: (access: unknown) => unknown
  ) =>
    action({
      user: { id: 'authenticated-owner' },
      meeting: { ws_id: '00000000-0000-4000-8000-0000000000a1' },
    }),
}));
vi.mock('@tuturuuu/meet-core/features/live-assistant/workspace-tools', () => ({
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
  // The Worker context crosses the app/core adapter package boundary.
  vi.stubGlobal(Symbol.for('__cloudflare-context__'), {
    env: {
      MEET_LIVE: {
        idFromName: (id: string) => id,
        get: () => ({ fetch: f.fetch }),
      },
      MEET_AI_PROTECTED_WORKSPACE_IDS: '00000000-0000-4000-8000-0000000000ee',
      MEET_AI_ENABLED_WORKSPACE_IDS: '00000000-0000-4000-8000-0000000000a1',
      MEET_AI_DISABLED: 'false',
    },
  });
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
afterEach(() => {
  vi.unstubAllGlobals();
});
it.each([
  'absent runtime context',
  'claimed arguments with a spoofed owner',
  'explicit rejection',
  'duplicate claim',
  'revoked membership',
  'uncertain outcome reporting',
])(
  'denies workspace review before %s can execute an operation',
  async (scenario) => {
    if (scenario === 'absent runtime context')
      vi.stubGlobal(Symbol.for('__cloudflare-context__'), undefined);
    if (scenario === 'duplicate claim')
      f.fetch.mockResolvedValue(
        new Response('Already handled', { status: 409 })
      );
    if (scenario === 'revoked membership')
      f.tools.mockRejectedValue(new Error('Membership revoked'));
    if (scenario === 'uncertain outcome reporting')
      f.fetch.mockResolvedValue(new Response('Ended', { status: 409 }));
    await expect(
      invoke(scenario !== 'explicit rejection')
    ).rejects.toMatchObject({
      status: 403,
      message: 'Workspace and room actions are unavailable in Private Mira.',
    });
    expect(f.fetch).not.toHaveBeenCalled();
    expect(f.tools).not.toHaveBeenCalled();
    expect(f.execute).not.toHaveBeenCalled();
  }
);
it('denies review writes outside the Meet AI allowlist before any Durable Object or tool call', async () => {
  for (const MEET_AI_ENABLED_WORKSPACE_IDS of [
    undefined,
    '',
    '*',
    '00000000-0000-4000-8000-0000000000a2',
  ]) {
    vi.stubGlobal(Symbol.for('__cloudflare-context__'), {
      env: {
        MEET_LIVE: {
          idFromName: (id: string) => id,
          get: () => ({ fetch: f.fetch }),
        },
        MEET_AI_PROTECTED_WORKSPACE_IDS: '00000000-0000-4000-8000-0000000000ee',
        MEET_AI_ENABLED_WORKSPACE_IDS,
        MEET_AI_DISABLED: MEET_AI_ENABLED_WORKSPACE_IDS ? 'false' : 'true',
      },
    });
    for (const approved of [true, false])
      await expect(invoke(approved)).rejects.toMatchObject({ status: 403 });
  }
  expect(f.fetch).not.toHaveBeenCalled();
  expect(f.tools).not.toHaveBeenCalled();
  expect(f.execute).not.toHaveBeenCalled();
});
