import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const list = vi.fn();
  const download = vi.fn();
  const maybeSingle = vi.fn();
  const eq = vi.fn();
  const query = { select: vi.fn(), eq, maybeSingle };
  query.select.mockReturnValue(query);
  eq.mockReturnValue(query);
  return { list, download, maybeSingle, eq, from: vi.fn(() => query) };
});
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({
    from: mocks.from,
    storage: { from: () => ({ list: mocks.list, download: mocks.download }) },
  }),
}));

import { processMessagesWithFiles } from './message-file-processing';

describe('chat attachment ownership boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.list.mockResolvedValue({ data: [], error: null });
  });
  it.each([
    { data: null, error: null },
    { data: null, error: { message: 'lookup failed' } },
  ])(
    'does not list storage for a missing or unreadable source chat',
    async (lookup) => {
      mocks.maybeSingle.mockResolvedValue(lookup);
      await processMessagesWithFiles(
        [{ role: 'user', content: 'hello' }],
        'workspace',
        'mind-or-foreign-chat',
        undefined,
        false,
        'actor'
      );
      expect(mocks.list).not.toHaveBeenCalled();
    }
  );
  it('requires an authenticated owner identity before listing', async () => {
    await processMessagesWithFiles(
      [{ role: 'user', content: 'hello' }],
      'workspace',
      'chat'
    );
    expect(mocks.list).not.toHaveBeenCalled();
  });
  it('scopes the owned source chat before listing its attachments', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { id: 'chat' }, error: null });
    await processMessagesWithFiles(
      [{ role: 'user', content: 'hello' }],
      'workspace',
      'chat',
      undefined,
      false,
      'actor'
    );
    expect(mocks.from).toHaveBeenCalledWith('ai_chats');
    expect(mocks.eq).toHaveBeenCalledWith('id', 'chat');
    expect(mocks.eq).toHaveBeenCalledWith('creator_id', 'actor');
    expect(mocks.list).toHaveBeenCalledWith(
      'workspace/chats/ai/resources/chat',
      expect.any(Object)
    );
  });
});
