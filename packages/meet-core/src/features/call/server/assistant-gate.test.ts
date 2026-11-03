import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  cloudflare: vi.fn(),
  callRoom: vi.fn(),
  bill: vi.fn(),
  personalChat: vi.fn(),
  readBody: vi.fn(),
  credits: vi.fn(),
  model: vi.fn(),
}));
const { AccessError } = vi.hoisted(() => ({
  AccessError: class extends Error {
    constructor(
      public status: number,
      message: string
    ) {
      super(message);
    }
  },
}));
vi.mock('@tuturuuu/meet-core/features/call/lib/call-access', () => ({
  MeetCallAccessError: AccessError,
}));
vi.mock('../lib/call-access', () => ({ MeetCallAccessError: AccessError }));
vi.mock('server-only', () => ({}));
vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: mocks.cloudflare,
}));
vi.mock('@tuturuuu/meet-core/parley/repository', () => ({
  getScenarioPrompt: vi.fn(),
}));
vi.mock('../../meeting-ai/server/provider-transport', () => ({
  meetingProviderTransport: vi.fn(),
}));
vi.mock('@tuturuuu/ai/credits/cap-output-tokens', () => ({
  capMaxOutputTokensByCredits: vi.fn(),
}));
vi.mock('@tuturuuu/ai/credits/check-credits', () => ({
  checkAiCredits: mocks.credits,
}));
vi.mock('@tuturuuu/ai/meetings/workspace-tools', () => ({
  createMeetWorkspaceTools: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: vi.fn(),
  verifyWorkspaceMembershipType: vi.fn(),
}));
vi.mock('./chat-billing', () => ({ billMeetChat: mocks.bill }));
vi.mock('./chat-model', () => ({ getMeetChatModel: mocks.model }));
vi.mock('./personal-chat-body', () => ({
  readPersonalChatBody: mocks.readBody,
}));
vi.mock('./personal-chat-request', () => ({
  requestPersonalMeetChat: mocks.personalChat,
}));
vi.mock('./room-service', () => ({
  callRoomService: mocks.callRoom,
  personalWorkspace: vi.fn(async () => 'personal-ws'),
  roomRoute: async (
    _request: Request,
    _id: string,
    work: (access: unknown) => Promise<unknown>
  ) => {
    try {
      return Response.json(await work(access));
    } catch (error) {
      return Response.json(
        { error: (error as Error).message },
        { status: (error as { status?: number }).status ?? 500 }
      );
    }
  },
}));
vi.mock('@tuturuuu/meet-core/features/call/server/room-service', () => ({
  callRoomService: mocks.callRoom,
  roomRoute: async (
    _request: Request,
    _id: string,
    work: (access: unknown) => Promise<unknown>
  ) => {
    try {
      return Response.json(await work(access));
    } catch (error) {
      return Response.json(
        { error: (error as Error).message },
        { status: (error as { status?: number }).status ?? 500 }
      );
    }
  },
}));
vi.mock('@tuturuuu/meet-core/features/call/server/personal-chat-body', () => ({
  readPersonalChatBody: mocks.readBody,
}));
vi.mock(
  '@tuturuuu/meet-core/features/call/server/personal-chat-request',
  () => ({ requestPersonalMeetChat: mocks.personalChat })
);

const access = {
  user: { id: 'actor' },
  isHost: false,
  meeting: { id: 'meeting', ws_id: 'meeting-ws' },
};

import { POST as personal } from '../../../routes/api/meet-call/[meetingId]/assistant/personal/route';
import { POST as review } from '../../../routes/api/meet-call/[meetingId]/assistant/review/route';
import { POST as assistant } from '../../../routes/api/meet-call/[meetingId]/assistant/route';
import { generateMeetAssistant } from './assistant-generation';

const bind = (allowlist?: string) =>
  mocks.cloudflare.mockResolvedValue({
    env: { MEET_AI_ENABLED_WORKSPACE_IDS: allowlist },
  });
const ctx = { params: Promise.resolve({ meetingId: 'meeting' }) };
const send = (handler: typeof assistant, body: unknown) =>
  handler(
    new Request('https://meet.tuturuuu.com/api/meet-call/x/assistant', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
    ctx
  );
const noAiWork = () => {
  expect(mocks.callRoom).not.toHaveBeenCalled();
  expect(mocks.bill).not.toHaveBeenCalled();
  expect(mocks.personalChat).not.toHaveBeenCalled();
  expect(mocks.credits).not.toHaveBeenCalled();
  expect(mocks.model).not.toHaveBeenCalled();
};

describe('assistant mutations workspace gate', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.readBody.mockResolvedValue({
      requestId: '00000000-0000-4000-8000-0000000000e1',
      startedAt: 1,
      question: 'hi',
      history: [],
      timezone: 'UTC',
    });
  });

  it.each([undefined, '', 'other-ws'])(
    'denies generation, personal chat and review writes (allowlist %j) before any room, credit or model call',
    async (allowlist) => {
      bind(allowlist);
      await expect(
        generateMeetAssistant(access as never, {
          messageId: 'm',
          timezone: 'UTC',
        })
      ).rejects.toMatchObject({ status: 403 });
      expect(
        (await send(assistant, { messageId: 'm', timezone: 'UTC' })).status
      ).toBe(403);
      expect(
        (
          await send(personal, {
            requestId: '00000000-0000-4000-8000-0000000000e1',
            startedAt: 1,
            question: 'hi',
            history: [],
            timezone: 'UTC',
          })
        ).status
      ).toBe(403);
      for (const action of ['approve', 'deny', 'share', 'discard'])
        expect(
          (await send(review, { messageId: 'm', revision: 0, action })).status
        ).toBe(403);
      noAiWork();
    }
  );

  it('admits a listed workspace to the personal assistant write', async () => {
    bind('meeting-ws');
    mocks.personalChat.mockResolvedValue({ text: 'ok' });
    const response = await send(personal, {
      requestId: '00000000-0000-4000-8000-0000000000e1',
      startedAt: 1,
      question: 'hi',
      history: [],
      timezone: 'UTC',
    });
    expect(response.status).toBe(200);
    expect(mocks.personalChat).toHaveBeenCalledOnce();
  });
});
