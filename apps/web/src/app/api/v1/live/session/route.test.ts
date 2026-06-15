import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  normalizeWorkspaceId: vi.fn(),
  resolveAuthenticatedSessionUser: vi.fn(),
  serverLoggerError: vi.fn(),
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

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  normalizeWorkspaceId: (
    ...args: Parameters<typeof mocks.normalizeWorkspaceId>
  ) => mocks.normalizeWorkspaceId(...args),
  verifyWorkspaceMembershipType: (
    ...args: Parameters<typeof mocks.verifyWorkspaceMembershipType>
  ) => mocks.verifyWorkspaceMembershipType(...args),
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: {
    error: (...args: Parameters<typeof mocks.serverLoggerError>) =>
      mocks.serverLoggerError(...args),
  },
}));

import { POST } from '@/app/api/v1/live/session/route';
import {
  assistantChatScopeKey,
  LIVE_SESSION_HANDLE_MAX_LENGTH,
  WEB_ASSISTANT_LIVE_SCOPE_KEY,
} from '@/lib/live/session-scope';

const ASSISTANT_CHAT_ID = '123e4567-e89b-42d3-a456-426614174000';
const USER_ID = 'user-1';
const WS_ID = 'workspace-1';

type QueryResult = {
  data: unknown;
  error: { message: string } | null;
};

function createQueryBuilder({
  maybeSingle = { data: null, error: null },
  upsert = { data: null, error: null },
}: {
  maybeSingle?: QueryResult;
  upsert?: QueryResult;
} = {}) {
  const builder = {
    eq: vi.fn(),
    gt: vi.fn(),
    maybeSingle: vi.fn(),
    select: vi.fn(),
    upsert: vi.fn(),
  };

  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  builder.gt.mockReturnValue(builder);
  builder.maybeSingle.mockResolvedValue(maybeSingle);
  builder.upsert.mockResolvedValue(upsert);

  return builder;
}

function postRequest(body: unknown) {
  return new Request('http://localhost/api/v1/live/session', {
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  });
}

describe('live session route', () => {
  let aiChatsBuilder: ReturnType<typeof createQueryBuilder>;
  let liveSessionsBuilder: ReturnType<typeof createQueryBuilder>;

  beforeEach(() => {
    vi.clearAllMocks();

    aiChatsBuilder = createQueryBuilder({
      maybeSingle: {
        data: { id: ASSISTANT_CHAT_ID },
        error: null,
      },
    });
    liveSessionsBuilder = createQueryBuilder();

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'ai_chats') {
          return aiChatsBuilder;
        }

        if (table === 'live_api_sessions') {
          return liveSessionsBuilder;
        }

        throw new Error(`Unexpected table: ${table}`);
      }),
    };

    mocks.createClient.mockResolvedValue(supabase);
    mocks.resolveAuthenticatedSessionUser.mockResolvedValue({
      authError: null,
      user: { id: USER_ID },
    });
    mocks.normalizeWorkspaceId.mockResolvedValue(WS_ID);
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({ ok: true });
  });

  it('rejects arbitrary scope keys before opening a session table write path', async () => {
    const response = await POST(
      postRequest({
        scopeKey: 'attacker:1',
        sessionHandle: 'session-handle',
        wsId: 'personal',
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'Invalid scopeKey',
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(liveSessionsBuilder.upsert).not.toHaveBeenCalled();
  });

  it('rejects oversized session handles before opening a session table write path', async () => {
    const response = await POST(
      postRequest({
        scopeKey: WEB_ASSISTANT_LIVE_SCOPE_KEY,
        sessionHandle: 'x'.repeat(LIVE_SESSION_HANDLE_MAX_LENGTH + 1),
        wsId: 'personal',
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'Invalid sessionHandle',
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(liveSessionsBuilder.upsert).not.toHaveBeenCalled();
  });

  it('persists fixed server-minted scopes for workspace members', async () => {
    const response = await POST(
      postRequest({
        scopeKey: WEB_ASSISTANT_LIVE_SCOPE_KEY,
        sessionHandle: 'session-handle',
        wsId: 'personal',
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(mocks.verifyWorkspaceMembershipType).toHaveBeenCalledWith({
      supabase: expect.any(Object),
      userId: USER_ID,
      wsId: WS_ID,
    });
    expect(aiChatsBuilder.select).not.toHaveBeenCalled();
    expect(liveSessionsBuilder.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        scope_key: WEB_ASSISTANT_LIVE_SCOPE_KEY,
        session_handle: 'session-handle',
        user_id: USER_ID,
        ws_id: WS_ID,
      }),
      { onConflict: 'user_id,ws_id,scope_key' }
    );
  });

  it('persists assistant chat scopes only after verifying chat ownership', async () => {
    const scopeKey = assistantChatScopeKey(ASSISTANT_CHAT_ID);
    const response = await POST(
      postRequest({
        scopeKey,
        sessionHandle: 'session-handle',
        wsId: 'personal',
      })
    );

    expect(response.status).toBe(200);
    expect(aiChatsBuilder.select).toHaveBeenCalledWith('id');
    expect(aiChatsBuilder.eq).toHaveBeenCalledWith('id', ASSISTANT_CHAT_ID);
    expect(aiChatsBuilder.eq).toHaveBeenCalledWith('creator_id', USER_ID);
    expect(liveSessionsBuilder.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        scope_key: scopeKey,
        session_handle: 'session-handle',
      }),
      { onConflict: 'user_id,ws_id,scope_key' }
    );
  });

  it('rejects assistant chat scopes that do not belong to the user', async () => {
    aiChatsBuilder.maybeSingle.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    const response = await POST(
      postRequest({
        scopeKey: assistantChatScopeKey(ASSISTANT_CHAT_ID),
        sessionHandle: 'session-handle',
        wsId: 'personal',
      })
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: 'Invalid scopeKey',
    });
    expect(liveSessionsBuilder.upsert).not.toHaveBeenCalled();
  });
});
