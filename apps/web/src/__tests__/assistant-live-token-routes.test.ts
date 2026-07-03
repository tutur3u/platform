import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  assistantChatScopeKey: vi.fn((chatId: string) => `assistant:${chatId}`),
  createClient: vi.fn(),
  createConstrainedLiveToken: vi.fn(),
  ensureAssistantLiveChat: vi.fn(),
  getWorkspaceTier: vi.fn(),
  isFeatureAvailable: vi.fn(),
  loadAssistantLiveSeedHistory: vi.fn(),
  normalizeWorkspaceId: vi.fn(),
  resolveAuthenticatedSessionUser: vi.fn(),
  serverLoggerError: vi.fn(),
  validateAiTempAuthRequest: vi.fn(),
  verifyWorkspaceMembershipType: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: (
    ...args: Parameters<typeof mocks.resolveAuthenticatedSessionUser>
  ) => mocks.resolveAuthenticatedSessionUser(...args),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: (...args: Parameters<typeof mocks.createClient>) =>
    mocks.createClient(...args),
}));

vi.mock('@tuturuuu/utils/ai-temp-auth', () => ({
  validateAiTempAuthRequest: (
    ...args: Parameters<typeof mocks.validateAiTempAuthRequest>
  ) => mocks.validateAiTempAuthRequest(...args),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getWorkspaceTier: (...args: Parameters<typeof mocks.getWorkspaceTier>) =>
    mocks.getWorkspaceTier(...args),
  normalizeWorkspaceId: (
    ...args: Parameters<typeof mocks.normalizeWorkspaceId>
  ) => mocks.normalizeWorkspaceId(...args),
  verifyWorkspaceMembershipType: (
    ...args: Parameters<typeof mocks.verifyWorkspaceMembershipType>
  ) => mocks.verifyWorkspaceMembershipType(...args),
}));

vi.mock('@/lib/feature-tiers', () => ({
  isFeatureAvailable: (...args: Parameters<typeof mocks.isFeatureAvailable>) =>
    mocks.isFeatureAvailable(...args),
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: {
    error: (...args: Parameters<typeof mocks.serverLoggerError>) =>
      mocks.serverLoggerError(...args),
  },
}));

vi.mock('@/lib/live/assistant-history', () => ({
  ensureAssistantLiveChat: (
    ...args: Parameters<typeof mocks.ensureAssistantLiveChat>
  ) => mocks.ensureAssistantLiveChat(...args),
  loadAssistantLiveSeedHistory: (
    ...args: Parameters<typeof mocks.loadAssistantLiveSeedHistory>
  ) => mocks.loadAssistantLiveSeedHistory(...args),
}));

vi.mock('@/lib/live/assistant-tools', () => ({
  ASSISTANT_LIVE_MODEL: 'gemini-3.1-flash-live-preview',
  ASSISTANT_LIVE_TOOL_CONFIG: {
    functionCallingConfig: { mode: 'AUTO' },
  },
  ASSISTANT_LIVE_TOOL_DECLARATIONS: [],
  ASSISTANT_SYSTEM_INSTRUCTION: 'assistant instruction',
}));

vi.mock('@/lib/live/session-scope', () => ({
  assistantChatScopeKey: (
    ...args: Parameters<typeof mocks.assistantChatScopeKey>
  ) => mocks.assistantChatScopeKey(...args),
  WEB_ASSISTANT_LIVE_SCOPE_KEY: 'web-assistant-live',
}));

vi.mock('@/lib/live/token-builder', () => ({
  createConstrainedLiveToken: (
    ...args: Parameters<typeof mocks.createConstrainedLiveToken>
  ) => mocks.createConstrainedLiveToken(...args),
}));

import { POST as assistantLiveTokenPOST } from '@/legacy-api-routes/v1/assistant/live/token/route';
import { POST as webLiveTokenPOST } from '@/legacy-api-routes/v1/live/token/route';

function postRequest(path: string, body: unknown) {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('assistant live token routes', () => {
  const requestSupabase = { auth: {}, from: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue(requestSupabase);
    mocks.resolveAuthenticatedSessionUser.mockResolvedValue({
      user: { id: 'user-1', email: 'user@example.com' },
      authError: null,
    });
    mocks.validateAiTempAuthRequest.mockResolvedValue({ status: 'missing' });
    mocks.normalizeWorkspaceId.mockResolvedValue('personal-workspace-id');
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({ ok: true });
    mocks.getWorkspaceTier.mockResolvedValue('PRO');
    mocks.isFeatureAvailable.mockReturnValue(true);
    mocks.createConstrainedLiveToken.mockResolvedValue('ephemeral-token');
    mocks.ensureAssistantLiveChat.mockResolvedValue({ id: 'chat-1' });
    mocks.loadAssistantLiveSeedHistory.mockResolvedValue([]);
  });

  it('normalizes the web live token workspace with the request Supabase client', async () => {
    const response = await webLiveTokenPOST(
      postRequest('/api/v1/live/token', { wsId: 'personal' })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      token: 'ephemeral-token',
      scopeKey: 'web-assistant-live',
      model: 'gemini-3.1-flash-live-preview',
    });
    expect(mocks.normalizeWorkspaceId).toHaveBeenCalledWith(
      'personal',
      requestSupabase
    );
    expect(mocks.verifyWorkspaceMembershipType).toHaveBeenCalledWith({
      wsId: 'personal-workspace-id',
      userId: 'user-1',
      supabase: requestSupabase,
    });
  });

  it('normalizes the assistant live token workspace with the request Supabase client', async () => {
    const response = await assistantLiveTokenPOST(
      postRequest('/api/v1/assistant/live/token', {
        wsId: 'personal',
        forceFresh: true,
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      token: 'ephemeral-token',
      chatId: 'chat-1',
      scopeKey: 'assistant:chat-1',
      model: 'gemini-3.1-flash-live-preview',
      sessionHandle: null,
      seedHistory: [],
    });
    expect(mocks.normalizeWorkspaceId).toHaveBeenCalledWith(
      'personal',
      requestSupabase
    );
    expect(mocks.ensureAssistantLiveChat).toHaveBeenCalledWith({
      supabase: requestSupabase,
      userId: 'user-1',
      chatId: undefined,
      model: 'gemini-3.1-flash-live-preview',
    });
  });
});
