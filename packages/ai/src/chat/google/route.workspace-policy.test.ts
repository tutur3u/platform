import type { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ROUTE_WS = '11111111-1111-4111-8111-111111111111';
const CONTEXT_WS = '33333333-3333-4333-8333-333333333333';
const ACTOR = '44444444-4444-4444-8444-444444444444';

const mocks = vi.hoisted(() => ({
  policy: vi.fn(),
  resolveContext: vi.fn(),
  buildMiraPrompt: vi.fn(),
  getPermissions: vi.fn(),
  resolveTimezone: vi.fn(),
  createTools: vi.fn(),
  authorizeWorkspace: vi.fn(),
  creditPreflight: vi.fn(),
  resolvePlanModel: vi.fn(),
  withAiMemory: vi.fn(),
  streamText: vi.fn(),
  beginPersistence: vi.fn(),
  persistUserMessage: vi.fn(),
  resolveChatId: vi.fn(),
}));

vi.mock('@tuturuuu/utils/workspace-ai-policy-server', () => ({
  workspaceAiPolicyResponse: mocks.policy,
  workspaceAiAllowed: async () => true,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({}),
}));
vi.mock('@tuturuuu/utils/workspace-helper', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@tuturuuu/utils/workspace-helper')
  >()),
  getPermissions: mocks.getPermissions,
}));
vi.mock('../../tools/workspace-context', () => ({
  resolveWorkspaceContextState: mocks.resolveContext,
}));
vi.mock('../mira-prompt', () => ({ buildMiraPrompt: mocks.buildMiraPrompt }));
vi.mock('./mira-timezone', () => ({
  resolveMiraTimezone: mocks.resolveTimezone,
}));
vi.mock('../../tools/mira-tools', () => ({
  createMiraStreamTools: mocks.createTools,
}));
vi.mock('../../tools/mira-sdk-tool-search', () => ({
  createMiraSdkToolSearch: () => ({ tools: {}, prepareStep: undefined }),
}));
vi.mock('../../memory', () => ({ withAiMemory: mocks.withAiMemory }));
vi.mock('../../credits/resolve-plan-model', () => ({
  resolvePlanModel: mocks.resolvePlanModel,
  PlanModelResolutionError: class extends Error {},
}));
vi.mock('./route-credits', () => ({
  performCreditPreflight: mocks.creditPreflight,
}));
vi.mock('./route-auth', () => ({
  authorizeAiWorkspace: mocks.authorizeWorkspace,
  resolveAiRouteAuth: vi.fn(),
  isInternalTuturuuuAiUser: async () => true,
}));
vi.mock('./route-chat-resolution', () => ({
  resolveChatIdForUser: mocks.resolveChatId,
  moveTempFilesToThread: async () => null,
}));
vi.mock('./route-message-preparation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./route-message-preparation')>()),
  prepareProcessedMessages: async () => ({
    processedMessages: [{ role: 'user', content: 'Hello' }],
  }),
  persistLatestUserMessage: mocks.persistUserMessage,
  extractLatestUserMessageContent: () => 'Hello',
}));
vi.mock('./request-persistence-lease', () => ({
  beginAiPersistenceRequest: mocks.beginPersistence,
  createAiPersistenceFinisher: () => vi.fn(),
  releaseAiPersistenceRequest: vi.fn(),
}));
vi.mock('ai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('ai')>()),
  streamText: mocks.streamText,
}));

import { createPOST } from './route';

const disabled = new Set<string>();
const workspaceState = (wsId: string) => ({
  workspaceContextId: wsId,
  wsId,
  name: 'Synthetic',
  personal: false,
  memberCount: 2,
});
const resolveAuth = async () => ({
  ok: true as const,
  supabase: {} as never,
  user: { id: ACTOR, email: 'synthetic@tuturuuu.com' } as never,
});
const request = (body: Record<string, unknown>) =>
  new Request('http://localhost/api/ai/chat', {
    method: 'POST',
    body: JSON.stringify({
      model: 'google/gemini-3.5-flash-lite',
      messages: [{ role: 'user', parts: [{ type: 'text', text: 'Hello' }] }],
      ...body,
    }),
  }) as NextRequest;

function expectNoTargetCreditOrProviderWork() {
  expect(mocks.buildMiraPrompt).not.toHaveBeenCalled();
  expect(mocks.getPermissions).not.toHaveBeenCalled();
  expect(mocks.resolveTimezone).not.toHaveBeenCalled();
  expect(mocks.createTools).not.toHaveBeenCalled();
  expect(mocks.resolvePlanModel).not.toHaveBeenCalled();
  expect(mocks.creditPreflight).not.toHaveBeenCalled();
  expect(mocks.persistUserMessage).not.toHaveBeenCalled();
  expect(mocks.beginPersistence).not.toHaveBeenCalled();
  expect(mocks.withAiMemory).not.toHaveBeenCalled();
  expect(mocks.streamText).not.toHaveBeenCalled();
}

describe('shared chat handler workspace AI policy ordering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    disabled.clear();
    mocks.policy.mockImplementation(async (wsId: string | null) =>
      wsId && disabled.has(wsId)
        ? Response.json({ code: 'WORKSPACE_AI_DISABLED' }, { status: 403 })
        : null
    );
    mocks.authorizeWorkspace.mockImplementation(async ({ wsId }) => ({
      ok: true,
      wsId,
    }));
    mocks.resolveContext.mockImplementation(
      async ({ requestedWorkspaceContextId, fallbackWorkspaceId }) =>
        workspaceState(requestedWorkspaceContextId ?? fallbackWorkspaceId)
    );
    mocks.buildMiraPrompt.mockResolvedValue('Synthetic Mira prompt');
    mocks.getPermissions.mockResolvedValue({ withoutPermission: () => false });
    mocks.resolveTimezone.mockResolvedValue({ timezone: 'UTC' });
    mocks.createTools.mockReturnValue({});
    mocks.resolveChatId.mockResolvedValue({
      chatId: '22222222-2222-4222-8222-222222222222',
    });
    mocks.persistUserMessage.mockResolvedValue(null);
    mocks.beginPersistence.mockResolvedValue({ lease: null, response: null });
    mocks.resolvePlanModel.mockResolvedValue({
      modelId: 'google/gemini-3.5-flash-lite',
    });
    mocks.creditPreflight.mockResolvedValue({ cappedMaxOutput: null });
    mocks.withAiMemory.mockResolvedValue({ modelId: 'synthetic' });
    mocks.streamText.mockReturnValue({
      toUIMessageStreamResponse: () => new Response('stream'),
    });
  });

  it('refuses an AI-disabled initial Mira context in an AI-enabled route workspace', async () => {
    disabled.add(CONTEXT_WS);
    const response = await createPOST({ resolveAuth })(
      request({
        wsId: ROUTE_WS,
        workspaceContextId: CONTEXT_WS,
        isMiraMode: true,
      })
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ code: 'WORKSPACE_AI_DISABLED' });
    expect(mocks.policy).toHaveBeenNthCalledWith(1, ROUTE_WS, ACTOR, 'en');
    expect(mocks.policy).toHaveBeenNthCalledWith(
      2,
      CONTEXT_WS,
      ACTOR,
      'en',
      'unknown',
      true
    );
    expect(mocks.resolveContext).toHaveBeenCalledTimes(1);
    expect(mocks.resolveContext).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: ACTOR,
        requestedWorkspaceContextId: CONTEXT_WS,
        fallbackWorkspaceId: ROUTE_WS,
      })
    );
    expectNoTargetCreditOrProviderWork();
  });

  it('streams with the once-resolved context when both workspaces allow AI', async () => {
    const response = await createPOST({ resolveAuth })(
      request({
        wsId: ROUTE_WS,
        workspaceContextId: CONTEXT_WS,
        isMiraMode: true,
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.resolveContext).toHaveBeenCalledTimes(1);
    expect(mocks.buildMiraPrompt).toHaveBeenCalledWith(
      expect.objectContaining({ wsId: CONTEXT_WS })
    );
    expect(mocks.creditPreflight).toHaveBeenCalledTimes(1);
    expect(mocks.streamText).toHaveBeenCalledTimes(1);
    expect(mocks.streamText.mock.calls[0]?.[0].system).toContain(
      'Synthetic Mira prompt'
    );
  });

  it('keeps the route workspace gate ahead of initial context resolution', async () => {
    disabled.add(ROUTE_WS);
    const response = await createPOST({ resolveAuth })(
      request({
        wsId: ROUTE_WS,
        workspaceContextId: CONTEXT_WS,
        isMiraMode: true,
      })
    );

    expect(response.status).toBe(403);
    expect(mocks.policy).toHaveBeenCalledTimes(1);
    expect(mocks.resolveContext).not.toHaveBeenCalled();
    expectNoTargetCreditOrProviderWork();
  });

  it('refuses a disabled subscription workspace before resolving the account model', async () => {
    disabled.add(ROUTE_WS);
    const resolveModel = vi.fn();
    const response = await createPOST({
      resolveAuth,
      subscription: { resolveModel, onError: () => 'Subscription unavailable' },
    })(
      request({
        model: 'chatgpt/oaiapp_test/account-model',
        wsId: ROUTE_WS,
      })
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ code: 'WORKSPACE_AI_DISABLED' });
    expect(resolveModel).not.toHaveBeenCalled();
    expectNoTargetCreditOrProviderWork();
  });

  it('refuses an inaccessible subscription workspace before resolving the account model', async () => {
    mocks.authorizeWorkspace.mockResolvedValue({
      ok: false,
      response: Response.json({ error: 'Forbidden' }, { status: 403 }),
    });
    const resolveModel = vi.fn();
    const response = await createPOST({
      resolveAuth,
      subscription: { resolveModel, onError: () => 'Subscription unavailable' },
    })(
      request({
        model: 'chatgpt/oaiapp_test/account-model',
        wsId: ROUTE_WS,
      })
    );

    expect(response.status).toBe(403);
    expect(resolveModel).not.toHaveBeenCalled();
    expect(mocks.policy).not.toHaveBeenCalled();
    expectNoTargetCreditOrProviderWork();
  });

  it('resolves the account model once the workspace is authorized and allowed', async () => {
    const resolveModel = vi.fn().mockResolvedValue({ modelId: 'account' });
    const response = await createPOST({
      resolveAuth,
      subscription: { resolveModel, onError: () => 'Subscription unavailable' },
    })(
      request({
        model: 'chatgpt/oaiapp_test/account-model',
        wsId: ROUTE_WS,
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.policy).toHaveBeenCalledWith(ROUTE_WS, ACTOR, 'en');
    expect(resolveModel).toHaveBeenCalledWith(
      ACTOR,
      'chatgpt/oaiapp_test/account-model'
    );
    expect(mocks.policy.mock.invocationCallOrder[0]).toBeLessThan(
      resolveModel.mock.invocationCallOrder[0]!
    );
  });
});
