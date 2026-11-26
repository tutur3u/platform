// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  conversation,
  createRequest,
  mocks,
  resetMessageRouteMocks,
  userMessage,
} from './route.test.harness';

describe('native AI denial sanitization', () => {
  beforeEach(() => {
    resetMessageRouteMocks();
  });

  it('forwards allowlisted 403 denial code on native AI stream without leaking upstream text', async () => {
    mocks.createAiChatPost.mockReturnValue(async () =>
      Response.json(
        {
          code: 'CREDITS_EXHAUSTED',
          error: 'Synthetic private balance diagnostic',
        },
        { status: 403 }
      )
    );
    mocks.callPrivateChatRpc.mockImplementation(async (name: string) => {
      if (name === 'chat_send_user_message_idempotent') {
        return { message: userMessage, replayed: false };
      }
      if (name === 'chat_get_conversation') return conversation;
      if (name === 'chat_list_messages') return [userMessage];
      throw new Error(`Unexpected RPC ${name}`);
    });

    const request = createRequest({ miraMode: true });
    request.headers.set('accept', 'application/x-ndjson');
    const { POST } = await import('./route');
    const response = await POST(request as never, {
      params: Promise.resolve({
        conversationId: 'conversation-1',
        wsId: 'workspace-1',
      }),
    });

    expect(response.status).toBe(201);
    const body = await response.text();
    const events = body
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(events).toContainEqual({
      code: 'CREDITS_EXHAUSTED',
      message: 'Assistant response failed. Your message was saved.',
      status: 403,
      type: 'error',
    });
    expect(body).not.toContain('Synthetic private balance diagnostic');
  });

  it('propagates allowlisted 403 denial code on non-streaming JSON without leaking upstream text', async () => {
    mocks.createAiChatPost.mockReturnValue(async () =>
      Response.json(
        {
          code: 'DAILY_LIMIT_REACHED',
          error: 'Synthetic private balance diagnostic',
        },
        { status: 403 }
      )
    );
    mocks.callPrivateChatRpc.mockImplementation(async (name: string) => {
      if (name === 'chat_send_user_message_idempotent') {
        return { message: userMessage, replayed: false };
      }
      if (name === 'chat_get_conversation') return conversation;
      if (name === 'chat_list_messages') return [userMessage];
      throw new Error(`Unexpected RPC ${name}`);
    });

    const request = createRequest({ miraMode: true });
    const { POST } = await import('./route');
    const response = await POST(request as never, {
      params: Promise.resolve({
        conversationId: 'conversation-1',
        wsId: 'workspace-1',
      }),
    });

    expect(response.status).toBe(201);
    const json = await response.json();
    expect(json).toEqual({
      assistantError: 'Assistant response failed. Your message was saved.',
      code: 'DAILY_LIMIT_REACHED',
      message: userMessage,
      messages: [userMessage],
    });
    expect(JSON.stringify(json)).not.toContain(
      'Synthetic private balance diagnostic'
    );
  });

  it('drops non-allowlisted codes on 403/402 native AI denials', async () => {
    const { extractSafeAiDenial } = await import('./ai-stream-error');
    expect(
      extractSafeAiDenial(
        403,
        JSON.stringify({ code: 'SECRET_INTERNAL_CODE', error: 'private info' })
      )
    ).toMatchObject({ code: 'ACCESS_DENIED', status: 403 });
    expect(
      extractSafeAiDenial(
        402,
        JSON.stringify({ code: 'UNKNOWN_BILLING', error: 'private info' })
      )
    ).toMatchObject({ code: 'CREDITS_EXHAUSTED', status: 402 });
    expect(
      extractSafeAiDenial(
        403,
        JSON.stringify({ code: 'DAILY_REQUEST_LIMIT_REACHED' })
      )
    ).toMatchObject({ code: 'DAILY_REQUEST_LIMIT_REACHED', status: 403 });
    expect(
      extractSafeAiDenial(503, JSON.stringify({ code: 'NO_ALLOCATION' }))
    ).toMatchObject({ code: 'NO_ALLOCATION', status: 503 });
    expect(
      extractSafeAiDenial(503, JSON.stringify({ code: 'SECRET_503' }))
    ).toBeNull();
    expect(extractSafeAiDenial(502, '{"code":"CREDITS_EXHAUSTED"}')).toBeNull();
  });
});
