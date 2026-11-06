import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { executeConvertFileToMarkdown } from './markitdown';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  list: vi.fn(),
  sign: vi.fn(),
  fetch: vi.fn(),
  reserve: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({
    from: mocks.from,
    storage: {
      from: () => ({ list: mocks.list, createSignedUrl: mocks.sign }),
    },
  }),
}));
vi.mock('../../credits/reservations', () => ({
  reserveFixedAiCredits: mocks.reserve,
  commitFixedAiCreditReservation: vi.fn(async () => ({ success: true })),
  releaseFixedAiCreditReservation: vi.fn(async () => ({ success: true })),
}));

function mockAccess(owner: string | null, memberWorkspace = 'workspace') {
  mocks.from.mockImplementation((table: string) => {
    const filters = new Map<string, string>();
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn((key: string, value: string) => {
        filters.set(key, value);
        return query;
      }),
      maybeSingle: vi.fn(async () => ({
        data:
          table === 'ai_chats'
            ? owner &&
              filters.get('id') === 'chat' &&
              filters.get('creator_id') === owner
              ? { id: 'chat' }
              : null
            : table === 'workspace_members' &&
                filters.get('ws_id') === memberWorkspace &&
                filters.get('user_id') === 'actor'
              ? { user_id: 'actor' }
              : null,
        error: null,
      })),
    };
    return query;
  });
}

function convert(args: Record<string, unknown>, userId = 'actor') {
  return executeConvertFileToMarkdown(args, {
    userId,
    wsId: 'workspace',
    chatId: 'chat',
    supabase: Object.create(null),
  });
}

describe('Mind and Mira conversion attachment authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('MARKITDOWN_ENDPOINT_URL', 'http://localhost/markitdown');
    vi.stubEnv('MARKITDOWN_ENDPOINT_SECRET', 'fixture-secret');
    mocks.list.mockResolvedValue({
      data: [{ id: 'file', name: 'report.pdf' }],
      error: null,
    });
    mocks.sign.mockResolvedValue({
      data: { signedUrl: 'https://storage.test/fixture' },
      error: null,
    });
    mocks.fetch.mockImplementation(
      async () =>
        new Response(JSON.stringify({ ok: true, markdown: 'fixture' }))
    );
    mocks.reserve.mockResolvedValue({
      success: true,
      reservationId: 'fixture',
    });
    vi.stubGlobal('fetch', mocks.fetch);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it.each([
    {},
    { storagePath: 'report.pdf' },
    { storagePath: 'workspace/chats/ai/resources/chat/report.pdf' },
    { storagePath: 'workspace/chats/ai/resources/temp/report.pdf' },
  ])(
    'denies a Mind thread matching a foreign AI chat before storage access: %j',
    async (args) => {
      mockAccess('another-member');
      expect(await convert(args)).toEqual({
        ok: false,
        error: 'Chat attachments are unavailable.',
      });
      expect(mocks.list).not.toHaveBeenCalled();
      expect(mocks.sign).not.toHaveBeenCalled();
      expect(mocks.fetch).not.toHaveBeenCalled();
      expect(mocks.reserve).not.toHaveBeenCalled();
    }
  );

  it.each([
    'missing-chat',
    'missing-actor',
    'wrong-workspace',
    'lookup-error',
    'lookup-throws',
  ])(
    'fails closed for %s with the same non-disclosing error',
    async (reason) => {
      mockAccess(
        reason === 'missing-chat' ? null : 'actor',
        reason === 'wrong-workspace' ? 'other-workspace' : 'workspace'
      );
      if (reason === 'lookup-error') {
        const query = {
          select: () => query,
          eq: () => query,
          maybeSingle: async () => ({
            data: null,
            error: { message: 'private database detail' },
          }),
        };
        mocks.from.mockReturnValue(query);
      }
      if (reason === 'lookup-throws')
        mocks.from.mockImplementation(() => {
          throw new Error('private database detail');
        });
      expect(
        await convert({}, reason === 'missing-actor' ? '' : 'actor')
      ).toEqual({ ok: false, error: 'Chat attachments are unavailable.' });
      expect(mocks.list).not.toHaveBeenCalled();
      expect(mocks.sign).not.toHaveBeenCalled();
      expect(mocks.fetch).not.toHaveBeenCalled();
      expect(mocks.reserve).not.toHaveBeenCalled();
    }
  );

  it.each([
    {},
    { storagePath: 'workspace/chats/ai/resources/chat/report.pdf' },
  ])(
    'allows an owned chat attachment in the admitted workspace: %j',
    async (args) => {
      mockAccess('actor');
      expect(await convert(args)).toMatchObject({
        ok: true,
        markdown: 'fixture',
      });
      expect(mocks.sign).toHaveBeenCalledWith(
        'workspace/chats/ai/resources/chat/report.pdf',
        120
      );
      expect(mocks.fetch).toHaveBeenCalledOnce();
    }
  );
});
