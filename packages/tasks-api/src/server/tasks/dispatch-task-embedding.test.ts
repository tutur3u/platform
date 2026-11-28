import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  generateTaskEmbedding: vi.fn(async () => undefined),
  lookupAiDataConsent: vi.fn(),
}));

vi.mock('@tuturuuu/utils/ai-data-consent-store', () => ({
  AI_DATA_CONSENT_POLICY_VERSION: 'test',
  lookupAiDataConsent: mocks.lookupAiDataConsent,
}));
vi.mock('./generate-task-embedding', () => ({
  generateTaskEmbedding: mocks.generateTaskEmbedding,
}));

import { dispatchTaskEmbedding } from './dispatch-task-embedding';

const options = {
  supabase: {} as never,
  taskId: 'task-1',
  taskName: 'Write report',
  userId: 'user-1',
  wsId: 'ws-1',
};

const request = (headers: Record<string, string> = {}) =>
  new Request('https://tasks.tuturuuu.com/api/v1/workspaces/ws-1/tasks', {
    headers,
    method: 'POST',
  });

describe('dispatchTaskEmbedding', () => {
  beforeEach(() => vi.clearAllMocks());

  it('skips Gemini embeddings for native callers without AI data consent', async () => {
    mocks.lookupAiDataConsent.mockResolvedValue(false);

    await dispatchTaskEmbedding(
      request({ authorization: 'Bearer supabase-jwt' }),
      options
    );

    expect(mocks.lookupAiDataConsent).toHaveBeenCalledWith('user-1', undefined);
    expect(mocks.generateTaskEmbedding).not.toHaveBeenCalled();
  });

  it('embeds for consenting native callers and cookie sessions', async () => {
    mocks.lookupAiDataConsent.mockResolvedValue(true);

    await dispatchTaskEmbedding(
      request({ authorization: 'Bearer supabase-jwt' }),
      options
    );
    await dispatchTaskEmbedding(request(), options);

    expect(mocks.generateTaskEmbedding).toHaveBeenCalledTimes(2);
    expect(mocks.lookupAiDataConsent).toHaveBeenCalledTimes(1);
  });

  it('honors the consent requirement of an originating request', async () => {
    mocks.lookupAiDataConsent.mockResolvedValue(false);

    await dispatchTaskEmbedding(request(), {
      ...options,
      aiConsentRequired: true,
    });

    expect(mocks.generateTaskEmbedding).not.toHaveBeenCalled();
  });
});
