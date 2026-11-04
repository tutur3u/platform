import { expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({
  policy: vi.fn(async () => false),
  execute: vi.fn(),
  context: vi.fn(async () => ({
    wsId: 'off',
    workspaceContextId: 'off',
    name: 'Off',
  })),
}));
vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/utils/workspace-ai-policy-server', () => ({
  workspaceAiAllowed: f.policy,
}));
vi.mock('@tuturuuu/ai/embeddings/metered', () => ({
  createMeteredTextEmbedding: f.execute,
}));
vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: async () => ({
    user: { id: 'synthetic-user' },
  }),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: async () => ({}),
  createAdminClient: async () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ single: async () => ({ data: { name: 'Synthetic' } }) }),
      }),
    }),
  }),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  normalizeWorkspaceId: async () => 'off',
  verifyWorkspaceMembershipType: async () => ({ ok: true }),
  getWorkspaceTier: async () => 'PRO',
  getPermissions: async () => ({}),
}));
vi.mock('@/lib/feature-tiers', () => ({ isFeatureAvailable: () => true }));
vi.mock('../../../packages/ai/src/tools/workspace-context', () => ({
  resolveWorkspaceContextState: f.context,
  getWorkspaceContextWorkspaceId: () => 'on',
  listAccessibleWorkspaceSummaries: async () => [],
}));
vi.mock('@tuturuuu/meet-core/features/meeting-ai/server/room-gate', () => ({
  assertMeetAiRoom: async () => {},
}));
vi.mock('@tuturuuu/meet-core/parley/repository', () => ({
  getScenarioPrompt: vi.fn(),
}));
vi.mock('@tuturuuu/meet-core/runtime', () => ({ MEETING_APP: 'meet' }));
vi.mock(
  '../../../packages/meet-core/src/features/call/server/room-service',
  () => ({
    personalWorkspace: async () => 'personal',
    callRoomService: vi.fn(),
  })
);
vi.mock(
  '../../../packages/meet-core/src/features/call/server/chat-model',
  () => ({
    getMeetChatModel: async () => {
      throw new Error('model reached');
    },
  })
);
vi.mock(
  '../../../packages/meet-core/src/features/call/server/chat-billing',
  () => ({ billMeetChat: vi.fn() })
);
vi.mock(
  '../../../packages/meet-core/src/features/meeting-ai/server/provider-transport',
  () => ({ meetingProviderTransport: vi.fn() })
);
vi.mock('@tuturuuu/ai/credits/check-credits', () => ({
  checkAiCredits: vi.fn(),
}));
vi.mock('@tuturuuu/ai/credits/cap-output-tokens', () => ({
  capMaxOutputTokensByCredits: vi.fn(),
}));
vi.mock('@tuturuuu/ai/meetings/chat', () => ({ answerMeetChat: vi.fn() }));
vi.mock('@tuturuuu/ai/meetings/workspace-tools', () => ({
  createMeetWorkspaceTools: vi.fn(),
}));
it('R2 refuses an AI-on session tool call targeting AI-off workspace', async () => {
  const { POST } = await import(
    '../../../apps/web/src/legacy-api-routes/v1/live/tools/execute/route'
  );
  const response = await POST(
    new Request('https://synthetic.test', {
      method: 'POST',
      body: JSON.stringify({
        wsId: 'off',
        functionName: 'dismiss_visualization',
        args: {},
      }),
    })
  );
  expect(response.status).toBe(403);
  expect(f.policy).toHaveBeenCalledWith(
    'off',
    'unknown',
    'synthetic-user',
    true
  );
});
it('R3 refuses context switching to an AI-off workspace', async () => {
  const { executeSetWorkspaceContext } = await import(
    '../../../packages/ai/src/tools/executors/workspace'
  );
  const ctx = { wsId: 'on', userId: 'synthetic-user', supabase: {} };
  const result = await executeSetWorkspaceContext({ workspaceId: 'off' }, ctx);
  expect(result).toHaveProperty('error');
  expect(ctx).not.toHaveProperty('workspaceContext');
});
it('R4 refuses an AI-off tool workspace before loading model or workspace data', async () => {
  const { generateMeetAssistant } = await import(
    '../../../packages/meet-core/src/features/call/server/assistant-generation'
  );
  await expect(
    generateMeetAssistant(
      { user: { id: 'synthetic-user' }, meeting: { ws_id: 'on' } },
      { messageId: 'synthetic-message', timezone: 'UTC', workspaceId: 'off' }
    )
  ).rejects.toThrow(/AI.*unavailable/);
});
it('R4 personal assistant checks policy with requester identity', async () => {
  const { answerPersonalMeetChat } = await import(
    '../../../packages/meet-core/src/features/call/server/personal-assistant'
  );
  await expect(
    answerPersonalMeetChat('synthetic-user', {
      question: 'test',
      timezone: 'UTC',
      history: [],
    })
  ).rejects.toThrow(/AI.*unavailable/);
  expect(f.policy).toHaveBeenCalledWith(
    'personal',
    'learner-data',
    'synthetic-user'
  );
});
