import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  beginAiPersistenceRequest,
  claimAiPersistenceRequest,
  completeAiPersistenceRequest,
  createAiPersistenceFinisher,
  releaseAiPersistenceRequest,
} from './request-persistence-lease';

describe('AI persistence request lease', () => {
  const rpc = vi.fn();
  const client = { schema: vi.fn(() => ({ rpc })) };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('claims with a server-generated lease token', async () => {
    rpc.mockResolvedValue({
      data: { retryAfterSeconds: 0, state: 'claimed' },
      error: null,
    });

    const result = await claimAiPersistenceRequest({
      chatId: 'chat-1',
      client,
      content: 'Saved prompt',
      creatorId: 'user-1',
      requestId: '11111111-1111-4111-8111-111111111111',
      source: 'Rewise',
    });

    expect(result.state).toBe('claimed');
    expect(result.leaseToken).toMatch(/^[0-9a-f-]{36}$/);
    expect(rpc).toHaveBeenCalledWith(
      'ai_chat_claim_persistence_request',
      expect.objectContaining({
        p_chat_id: 'chat-1',
        p_content: 'Saved prompt',
        p_creator_id: 'user-1',
        p_lease_token: result.leaseToken,
      })
    );
  });

  it('normalizes an active lease retry delay', async () => {
    rpc.mockResolvedValue({
      data: { retryAfterSeconds: 1.2, state: 'active' },
      error: null,
    });

    const result = await claimAiPersistenceRequest({
      chatId: 'chat-1',
      client,
      content: 'Saved prompt',
      creatorId: 'user-1',
      requestId: '11111111-1111-4111-8111-111111111111',
      source: 'Mira',
    });

    expect(result).toEqual(
      expect.objectContaining({ retryAfterSeconds: 2, state: 'active' })
    );
  });

  it('turns active and completed claims into replayable conflict responses', async () => {
    rpc
      .mockResolvedValueOnce({
        data: { retryAfterSeconds: 9, state: 'active' },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { retryAfterSeconds: 0, state: 'completed' },
        error: null,
      });
    const params = {
      chatId: 'chat-1',
      client,
      content: 'Saved prompt',
      creatorId: 'user-1',
      requestId: '11111111-1111-4111-8111-111111111111',
      source: 'Rewise' as const,
    };

    const active = await beginAiPersistenceRequest(params);
    expect(active.response?.status).toBe(409);
    expect(active.response?.headers.get('Retry-After')).toBe('9');
    await expect(active.response?.json()).resolves.toMatchObject({
      code: 'ai_request_in_progress',
    });

    const completed = await beginAiPersistenceRequest(params);
    expect(completed.response?.status).toBe(409);
    await expect(completed.response?.json()).resolves.toMatchObject({
      code: 'ai_request_completed',
    });
  });

  it('completes and releases through fenced RPCs', async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    const lease = {
      chatId: 'chat-1',
      leaseToken: '22222222-2222-4222-8222-222222222222',
      requestId: '11111111-1111-4111-8111-111111111111',
    };

    await expect(completeAiPersistenceRequest(client, lease)).resolves.toBe(
      true
    );
    await expect(releaseAiPersistenceRequest(client, lease)).resolves.toBe(
      true
    );
    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      'ai_chat_complete_persistence_request',
      'ai_chat_release_persistence_request',
    ]);
  });

  it('rejects malformed claim responses', async () => {
    rpc.mockResolvedValue({ data: { state: 'unknown' }, error: null });

    await expect(
      claimAiPersistenceRequest({
        chatId: 'chat-1',
        client,
        content: 'Saved prompt',
        creatorId: 'user-1',
        requestId: '11111111-1111-4111-8111-111111111111',
        source: 'Rewise',
      })
    ).rejects.toThrow('Invalid AI persistence lease state');
  });

  it('deduplicates overlapping stream callbacks while persistence is pending', async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    let resolvePersistence: ((value: boolean) => void) | undefined;
    const persistence = new Promise<boolean>((resolve) => {
      resolvePersistence = resolve;
    });
    const persist = vi.fn(() => persistence);
    const onSettled = vi.fn();
    const finish = createAiPersistenceFinisher({
      client,
      lease: {
        chatId: 'chat-1',
        leaseToken: '22222222-2222-4222-8222-222222222222',
        requestId: '11111111-1111-4111-8111-111111111111',
      },
      onSettled,
      persist,
    });

    const first = finish('finished');
    const second = finish('aborted');

    expect(persist).toHaveBeenCalledOnce();
    expect(rpc).not.toHaveBeenCalled();
    resolvePersistence?.(true);
    await Promise.all([first, second]);

    expect(persist).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith(
      'ai_chat_complete_persistence_request',
      expect.any(Object)
    );
    expect(onSettled).toHaveBeenCalledOnce();
  });

  it('releases the lease when assistant persistence fails', async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    const finish = createAiPersistenceFinisher({
      client,
      lease: {
        chatId: 'chat-1',
        leaseToken: '22222222-2222-4222-8222-222222222222',
        requestId: '11111111-1111-4111-8111-111111111111',
      },
      onSettled: vi.fn(),
      persist: vi.fn().mockRejectedValue(new Error('insert failed')),
    });

    await expect(finish('failed')).rejects.toThrow('insert failed');
    expect(rpc).toHaveBeenCalledWith(
      'ai_chat_release_persistence_request',
      expect.any(Object)
    );
  });
});
