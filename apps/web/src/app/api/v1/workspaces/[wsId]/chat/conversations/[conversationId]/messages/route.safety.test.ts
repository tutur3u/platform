// @vitest-environment node

import { AI_DATA_CONSENT_POLICY_VERSION } from '@tuturuuu/ai/chat/ai-data-consent';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createAdminClientMock,
  mocks,
  resetMessageRouteMocks,
  userMessage,
} from './route.test.harness';

vi.mock('@tuturuuu/utils/ai-data-consent-store', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('@tuturuuu/utils/ai-data-consent-store')
    >();
  return {
    ...actual,
    // The real lookup, reading through this test's admin client double.
    lookupAiDataConsent: async (userId: string, admin?: unknown) =>
      actual.lookupAiDataConsent(
        userId,
        admin ?? (await mocks.createAdminClient())
      ),
  };
});

const consentRpc = vi.fn();

function adminWithConsent(granted: boolean) {
  consentRpc.mockResolvedValue({ data: granted, error: null });
  return {
    ...createAdminClientMock(),
    schema: () => ({ rpc: consentRpc }),
  };
}

function miraRequest(headers: Record<string, string> = {}) {
  return new Request(
    'http://localhost/api/v1/workspaces/workspace-1/chat/conversations/ai-chat-1/messages',
    {
      body: JSON.stringify({
        clientRequestId: '11111111-1111-4111-8111-111111111111',
        content: 'Summarise my week',
        miraMode: true,
      }),
      headers: { 'Content-Type': 'application/json', ...headers },
      method: 'POST',
    }
  );
}

const params = (conversationId: string) => ({
  params: Promise.resolve({ conversationId, wsId: 'workspace-1' }),
});

describe('chat message route safety gates', () => {
  beforeEach(() => {
    resetMessageRouteMocks();
    consentRpc.mockReset();
  });

  it('refuses a native Mira send without stored AI data consent', async () => {
    mocks.isAiChatConversationId.mockReturnValue(true);
    mocks.getAiChatId.mockReturnValue('ai-chat-1');
    mocks.createAdminClient.mockResolvedValue(adminWithConsent(false));

    const { POST } = await import('./route');
    const response = await POST(
      miraRequest({ Authorization: 'Bearer mobile-jwt' }) as never,
      params('ai-chat-1')
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      code: 'ai_consent_required',
      message: 'ai_consent_required',
    });
    expect(consentRpc).toHaveBeenCalledWith('has_ai_data_consent', {
      p_user_id: 'user-1',
      p_policy_version: AI_DATA_CONSENT_POLICY_VERSION,
    });
    // Nothing reached the model route or the message store.
    expect(mocks.createAiChatPost).not.toHaveBeenCalled();
    expect(mocks.callPrivateChatRpc).not.toHaveBeenCalled();
    expect(mocks.listAiChatMessages).not.toHaveBeenCalled();
  });

  it('refuses when the consent lookup fails (fails closed)', async () => {
    mocks.isAiChatConversationId.mockReturnValue(true);
    mocks.getAiChatId.mockReturnValue('ai-chat-1');
    consentRpc.mockResolvedValue({ data: null, error: { code: '57014' } });
    mocks.createAdminClient.mockResolvedValue({
      ...createAdminClientMock(),
      schema: () => ({ rpc: consentRpc }),
    });

    const { POST } = await import('./route');
    const response = await POST(
      miraRequest({ Authorization: 'Bearer mobile-jwt' }) as never,
      params('ai-chat-1')
    );

    expect(response.status).toBe(403);
    expect(mocks.createAiChatPost).not.toHaveBeenCalled();
  });

  it('lets a consented native Mira send continue past the gate', async () => {
    mocks.isAiChatConversationId.mockReturnValue(true);
    mocks.getAiChatId.mockReturnValue('ai-chat-1');
    mocks.createAdminClient.mockResolvedValue(adminWithConsent(true));

    const { POST } = await import('./route');
    const response = await POST(
      miraRequest({ Authorization: 'Bearer mobile-jwt' }) as never,
      params('ai-chat-1')
    );

    expect(consentRpc).toHaveBeenCalledWith('has_ai_data_consent', {
      p_user_id: 'user-1',
      p_policy_version: AI_DATA_CONSENT_POLICY_VERSION,
    });
    const body = (await response.json().catch(() => ({}))) as {
      code?: string;
    };
    expect(body.code).not.toBe('ai_consent_required');
  });

  it('does not consult consent for browser (cookie) sessions', async () => {
    mocks.isAiChatConversationId.mockReturnValue(true);
    mocks.getAiChatId.mockReturnValue('ai-chat-1');
    mocks.createAdminClient.mockResolvedValue(adminWithConsent(false));

    const { POST } = await import('./route');
    await POST(miraRequest() as never, params('ai-chat-1'));

    expect(consentRpc).not.toHaveBeenCalledWith(
      'has_ai_data_consent',
      expect.anything()
    );
  });

  it('refuses a native follow-up to a native AI conversation before storing it', async () => {
    mocks.createAdminClient.mockResolvedValue(adminWithConsent(false));
    mocks.callPrivateChatRpc.mockImplementation(async (fn: string) =>
      fn === 'chat_get_conversation' ? { id: 'c-ai', type: 'ai' } : null
    );

    const { POST } = await import('./route');
    const response = await POST(
      new Request(
        'http://localhost/api/v1/workspaces/workspace-1/chat/conversations/22222222-2222-4222-8222-222222222222/messages',
        {
          body: JSON.stringify({ content: 'hi Mira' }),
          headers: {
            Authorization: 'Bearer mobile-jwt',
            'Content-Type': 'application/json',
          },
          method: 'POST',
        }
      ) as never,
      params('22222222-2222-4222-8222-222222222222')
    );

    expect(response.status).toBe(403);
    expect(mocks.callPrivateChatRpc).not.toHaveBeenCalledWith(
      'chat_send_message',
      expect.anything()
    );
    expect(mocks.createAiChatPost).not.toHaveBeenCalled();
  });

  it('refuses with 503 when the conversation cannot be loaded (fails closed)', async () => {
    mocks.createAdminClient.mockResolvedValue(adminWithConsent(false));
    mocks.callPrivateChatRpc.mockImplementation(async (fn: string) => {
      if (fn === 'chat_get_conversation') throw new Error('timeout');
      return null;
    });

    const { POST } = await import('./route');
    const response = await POST(
      new Request(
        'http://localhost/api/v1/workspaces/workspace-1/chat/conversations/22222222-2222-4222-8222-222222222222/messages',
        {
          body: JSON.stringify({ content: 'hi Mira' }),
          headers: {
            Authorization: 'Bearer mobile-jwt',
            'Content-Type': 'application/json',
          },
          method: 'POST',
        }
      ) as never,
      params('22222222-2222-4222-8222-222222222222')
    );

    expect(response.status).toBe(503);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(mocks.callPrivateChatRpc).not.toHaveBeenCalledWith(
      'chat_send_message',
      expect.anything()
    );
    expect(mocks.createAiChatPost).not.toHaveBeenCalled();
  });

  it('never gates a native message to a people conversation', async () => {
    mocks.createAdminClient.mockResolvedValue(adminWithConsent(false));
    mocks.callPrivateChatRpc.mockImplementation(async (fn: string) =>
      fn === 'chat_get_conversation' ? { id: 'c-dm', type: 'direct' } : null
    );

    const { POST } = await import('./route');
    await POST(
      new Request(
        'http://localhost/api/v1/workspaces/workspace-1/chat/conversations/22222222-2222-4222-8222-222222222222/messages',
        {
          body: JSON.stringify({ content: 'hi' }),
          headers: {
            Authorization: 'Bearer mobile-jwt',
            'Content-Type': 'application/json',
          },
          method: 'POST',
        }
      ) as never,
      params('22222222-2222-4222-8222-222222222222')
    );

    expect(mocks.callPrivateChatRpc).toHaveBeenCalledWith(
      'chat_send_message',
      expect.anything()
    );
  });

  it('returns 403 when SQL refuses a message across a block', async () => {
    mocks.createAdminClient.mockResolvedValue(adminWithConsent(true));
    mocks.callPrivateChatRpc.mockRejectedValue({
      code: '42501',
      message: 'chat_blocked',
    });

    const { POST } = await import('./route');
    const response = await POST(
      new Request(
        'http://localhost/api/v1/workspaces/workspace-1/chat/conversations/22222222-2222-4222-8222-222222222222/messages',
        {
          body: JSON.stringify({ content: 'hi' }),
          headers: {
            Authorization: 'Bearer mobile-jwt',
            'Content-Type': 'application/json',
          },
          method: 'POST',
        }
      ) as never,
      params('22222222-2222-4222-8222-222222222222')
    );

    expect(response.status).toBe(403);
    expect(mocks.publishChatRealtimeEvent).not.toHaveBeenCalled();
    expect(mocks.notifyChatMessageRecipients).not.toHaveBeenCalled();
  });

  it('hides messages from people the reader blocked', async () => {
    mocks.callPrivateChatRpc.mockImplementation(async (fn: string) => {
      if (fn === 'chat_list_blocked_users') {
        return [{ userId: 'blocked-user' }];
      }
      return [
        {
          ...userMessage,
          id: 'm1',
          senderId: 'friend',
          sender: { id: 'friend' },
        },
        {
          ...userMessage,
          id: 'm2',
          senderId: 'blocked-user',
          sender: { id: 'blocked-user' },
        },
      ];
    });

    const { GET } = await import('./route');
    const response = await GET(
      new Request(
        'http://localhost/api/v1/workspaces/workspace-1/chat/conversations/22222222-2222-4222-8222-222222222222/messages'
      ) as never,
      params('22222222-2222-4222-8222-222222222222')
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { messages: { id: string }[] };
    expect(body.messages.map((message) => message.id)).toEqual(['m1']);
  });
});
