import {
  type AiDataScope,
  evaluateWorkspaceAiPolicy,
  type WorkspaceAiPolicy,
} from '@tuturuuu/utils/workspace-ai-policy';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const MEETING_WS = '00000000-0000-4000-8000-0000000000a1';
const TARGET_WS = '00000000-0000-4000-8000-0000000000b2';
const PERSONAL_WS = '00000000-0000-4000-8000-0000000000c3';
const ACTOR = '00000000-0000-4000-8000-0000000000d4';
const sessionId = '00000000-0000-4000-8000-0000000000e5';
const reviewId = '00000000-0000-4000-8000-0000000000f6';

const mocks = vi.hoisted(() => ({
  allowed: vi.fn(),
  cloudflare: vi.fn(),
  fetch: vi.fn(),
  callRoom: vi.fn(),
  catalog: vi.fn(),
  tools: vi.fn(),
  execute: vi.fn(),
}));
vi.mock('@tuturuuu/utils/workspace-ai-policy-server', () => ({
  workspaceAiPolicyResponse: async () => null,
  workspaceAiAllowed: mocks.allowed,
}));
vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: mocks.cloudflare,
}));
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
vi.mock('@tuturuuu/meet-core/features/call/server/room-service', () => ({
  callRoomService: mocks.callRoom,
  personalWorkspace: async () => PERSONAL_WS,
  roomRoute: async (
    _request: Request,
    _id: string,
    work: (access: unknown) => Promise<unknown>
  ) => {
    try {
      return Response.json(
        await work({
          user: { id: ACTOR },
          isHost: true,
          displayName: 'Host',
          meeting: { ws_id: MEETING_WS, name: 'Meeting' },
        })
      );
    } catch (error) {
      return Response.json(
        { error: (error as Error).message },
        { status: (error as { status?: number }).status ?? 500 }
      );
    }
  },
}));
vi.mock('@tuturuuu/meet-core/features/live-assistant/token', () => ({
  signLiveSession: () => 'signed',
}));
vi.mock('@tuturuuu/meet-core/features/live-assistant/workspace-tools', () => ({
  liveWorkspaceCatalog: mocks.catalog,
  liveWorkspaceTools: mocks.tools,
}));
vi.mock('@tuturuuu/meet-core/parley/repository', () => ({
  getScenarioPrompt: async () => undefined,
}));

import { z } from 'zod';
import { POST as review } from './review/route';
import { POST as live } from './route';

const policies = new Map<string, Partial<WorkspaceAiPolicy>>();
const call = (handler: typeof live, body: unknown) =>
  handler(
    new Request('https://meet.tuturuuu.com/api/meet-live/x', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ meetingId: 'meeting' }) }
  );
const start = (workspaceId?: string) =>
  call(live, {
    action: 'start',
    mode: 'personal',
    timezone: 'UTC',
    ...(workspaceId ? { workspaceId } : {}),
  });
const approve = () => call(review, { sessionId, reviewId, approved: true });
const doCalls = (path: string) =>
  mocks.fetch.mock.calls.filter(
    ([url]) => url === `https://live.internal${path}`
  );
const finishBody = () =>
  doCalls('/workspace-review')
    .map(([, init]) => JSON.parse(init.body))
    .find((body) => body.action === 'finish');

describe('personal Live workspace AI policy', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    policies.clear();
    mocks.allowed.mockImplementation(
      async (wsId: string, scope: AiDataScope, userId: string) =>
        userId === ACTOR &&
        evaluateWorkspaceAiPolicy(
          {
            enabled: undefined,
            education: false,
            scope: undefined,
            ...policies.get(wsId),
          },
          scope
        )
    );
    mocks.cloudflare.mockResolvedValue({
      env: {
        MEET_LIVE: {
          idFromName: (name: string) => name,
          get: () => ({ fetch: mocks.fetch }),
        },
        MEET_REALTIME_TOKEN_SECRET: 'secret',
        GOOGLE_GENERATIVE_AI_API_KEY: 'key',
        MEET_AI_ENABLED_WORKSPACE_IDS: MEETING_WS,
      },
    });
    mocks.callRoom.mockResolvedValue({});
    mocks.catalog.mockResolvedValue([]);
    mocks.execute.mockResolvedValue({ secret: 'target-workspace-data' });
    mocks.tools.mockResolvedValue({
      list_tasks: { inputSchema: z.object({}), execute: mocks.execute },
    });
    mocks.fetch.mockImplementation(async (url: string, init) => {
      const body = JSON.parse(init.body);
      if (url.endsWith('/workspace-review') && body.action === 'claim')
        return Response.json({
          workspaceId: TARGET_WS,
          timezone: 'UTC',
          toolName: 'list_tasks',
          args: {},
        });
      return Response.json({ ok: true });
    });
  });

  it.each([
    ['AI-disabled', { enabled: 'false' }],
    ['education-restricted', { education: true, scope: 'full' }],
    [
      'education learner-data-only',
      { education: true, scope: 'learner-data-only' },
    ],
  ])(
    'refuses a %s tool workspace selected from an AI-enabled meeting before catalog or session work',
    async (_name, policy) => {
      policies.set(TARGET_WS, policy);
      const response = await start(TARGET_WS);
      expect(response.status).toBe(403);
      expect(mocks.allowed).toHaveBeenCalledWith(
        TARGET_WS,
        'learner-data',
        ACTOR
      );
      expect(mocks.catalog).not.toHaveBeenCalled();
      expect(mocks.tools).not.toHaveBeenCalled();
      expect(mocks.fetch).not.toHaveBeenCalled();
    }
  );

  it.each([undefined, TARGET_WS])(
    'refuses personal admission when the personal workspace policy refuses the requester (target %s)',
    async (workspaceId) => {
      policies.set(PERSONAL_WS, { enabled: 'false' });
      const response = await start(workspaceId);
      expect(response.status).toBe(403);
      expect(mocks.allowed).toHaveBeenCalledWith(
        PERSONAL_WS,
        'learner-data',
        ACTOR
      );
      expect(mocks.catalog).not.toHaveBeenCalled();
      expect(mocks.fetch).not.toHaveBeenCalled();
    }
  );

  it('binds the meeting, tool and billing workspaces into the session it starts', async () => {
    const response = await start(TARGET_WS);
    expect(response.status).toBe(200);
    expect(mocks.catalog).toHaveBeenCalledWith(
      expect.anything(),
      TARGET_WS,
      'UTC'
    );
    const [, init] = doCalls('/initialize')[0]!;
    const initialized = JSON.parse(init.body);
    expect(initialized.identity.workspaceId).toBe(MEETING_WS);
    expect(initialized.workspace.id).toBe(TARGET_WS);
    expect(initialized.claims.billingWorkspaceId).toBe(PERSONAL_WS);
  });

  it('withholds an approved tool from a target whose policy now refuses it', async () => {
    policies.set(TARGET_WS, { education: true, scope: 'full' });
    const response = await approve();
    expect(response.status).toBe(200);
    expect(mocks.tools).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(finishBody()).toMatchObject({ failed: true });
    expect(finishBody().result).not.toContain('target-workspace-data');
  });

  it('withholds the result when the target policy is withdrawn during execution', async () => {
    mocks.execute.mockImplementation(async () => {
      policies.set(TARGET_WS, { enabled: 'false' });
      return { secret: 'target-workspace-data' };
    });
    const response = await approve();
    expect(response.status).toBe(200);
    expect(mocks.execute).toHaveBeenCalledTimes(1);
    expect(finishBody()).toMatchObject({ failed: true });
    expect(finishBody().result).not.toContain('target-workspace-data');
  });

  it('delivers an approved result when the target policy allows it', async () => {
    const response = await approve();
    expect(response.status).toBe(200);
    expect(mocks.allowed).toHaveBeenCalledWith(
      TARGET_WS,
      'learner-data',
      ACTOR
    );
    expect(finishBody()).toMatchObject({ failed: false });
    expect(finishBody().result).toContain('target-workspace-data');
  });
});
