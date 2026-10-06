// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  assistantMessage,
  conversation,
  createAdminClientMock,
  createRequest,
  mocks,
  resetMessageRouteMocks,
  userMessage,
} from './route.test.harness';

describe('native AI durable receipt cleanup boundary', () => {
  beforeEach(resetMessageRouteMocks);

  for (const streaming of [false, true]) {
    for (const failure of ['admin', 'delete'] as const) {
      it(`retains the saved ${streaming ? 'stream' : 'JSON'} receipt after ${failure} cleanup throws`, async () => {
        let saved = false;
        const admin = createAdminClientMock();
        mocks.createAdminClient.mockImplementation(async () => {
          if (saved && failure === 'admin')
            throw new Error('cleanup unavailable');
          return admin;
        });
        const originalFrom = admin.from.getMockImplementation()!;
        admin.from.mockImplementation(() => {
          const result = originalFrom();
          if (saved && failure === 'delete') {
            result.delete.mockReturnValue({
              eq: vi.fn(async () => {
                throw new Error('cleanup unavailable');
              }),
            });
          }
          return result;
        });
        mocks.callPrivateChatRpc.mockImplementation(async (name: string) => {
          if (name === 'chat_send_user_message_idempotent') {
            return { message: userMessage, replayed: false };
          }
          if (name === 'chat_get_conversation') return conversation;
          if (name === 'chat_list_messages') return [userMessage];
          if (name === 'chat_persist_ai_message_batch_idempotent') {
            saved = true;
            return { messages: [assistantMessage], replayed: false };
          }
          throw new Error(`Unexpected RPC ${name}`);
        });
        const request = createRequest();
        if (streaming) request.headers.set('accept', 'application/x-ndjson');
        const { POST } = await import('./route');
        const response = await POST(request as never, {
          params: Promise.resolve({
            conversationId: 'conversation-1',
            wsId: 'workspace-1',
          }),
        });
        expect(response.status).toBe(201);
        if (streaming) {
          const events = (await response.text())
            .trim()
            .split('\n')
            .map((line) => JSON.parse(line));
          expect(saved).toBe(true);
          expect(events).toContainEqual({
            type: 'messages',
            messages: [assistantMessage],
          });
          expect(events.at(-1)).toEqual({ type: 'done' });
          expect(events.some((event) => event.type === 'error')).toBe(false);
        } else {
          await expect(response.json()).resolves.toEqual({
            message: assistantMessage,
            messages: [userMessage, assistantMessage],
          });
        }
        expect(saved).toBe(true);
        const writes = mocks.callPrivateChatRpc.mock.calls.filter(
          ([name]) => name === 'chat_persist_ai_message_batch_idempotent'
        );
        expect(writes).toHaveLength(1);
        expect(writes[0]?.[1]).toEqual(
          expect.objectContaining({
            p_actor_user_id: 'user-1',
            p_ws_id: 'workspace-1',
            p_request_id: 'message-1',
          })
        );
      });
    }
  }

  it('keeps a genuine streaming persistence denial failed and skips cleanup', async () => {
    mocks.callPrivateChatRpc.mockImplementation(async (name: string) => {
      if (name === 'chat_send_user_message_idempotent') {
        return { message: userMessage, replayed: false };
      }
      if (name === 'chat_get_conversation') return conversation;
      if (name === 'chat_list_messages') return [userMessage];
      if (name === 'chat_persist_ai_message_batch_idempotent') {
        throw new Error('chat_manage_permission_required');
      }
      throw new Error(`Unexpected RPC ${name}`);
    });
    const request = createRequest();
    request.headers.set('accept', 'application/x-ndjson');
    const { POST } = await import('./route');
    const response = await POST(request as never, {
      params: Promise.resolve({
        conversationId: 'conversation-1',
        wsId: 'workspace-1',
      }),
    });
    const events = (await response.text())
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(events.some((event) => event.type === 'error')).toBe(true);
    expect(events.some((event) => event.type === 'messages')).toBe(false);
    expect(events.at(-1)).toEqual({ type: 'done' });
    expect(mocks.deleteWorkspaceStorageFolderByPath).not.toHaveBeenCalled();
  });
});
