import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MiraToolContext } from '../mira-tools';
import { executeConvertFileToMarkdown } from './markitdown';

const {
  commitFixedAiCreditReservationMock,
  createAdminClientMock,
  releaseFixedAiCreditReservationMock,
  reserveFixedAiCreditsMock,
} = vi.hoisted(() => ({
  commitFixedAiCreditReservationMock: vi.fn(),
  createAdminClientMock: vi.fn(),
  releaseFixedAiCreditReservationMock: vi.fn(),
  reserveFixedAiCreditsMock: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: createAdminClientMock,
}));

vi.mock('../../credits/reservations', () => ({
  commitFixedAiCreditReservation: commitFixedAiCreditReservationMock,
  releaseFixedAiCreditReservation: releaseFixedAiCreditReservationMock,
  reserveFixedAiCredits: reserveFixedAiCreditsMock,
}));

function createContext(): MiraToolContext {
  return {
    userId: 'user-1',
    wsId: 'workspace-1',
    chatId: 'chat-1',
    supabase: {} as MiraToolContext['supabase'],
    timezone: 'UTC',
  };
}

describe('executeConvertFileToMarkdown', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('MARKITDOWN_ENDPOINT_URL', 'http://markitdown:8000/markitdown');
    vi.stubEnv('MARKITDOWN_ENDPOINT_SECRET', 'secret');

    reserveFixedAiCreditsMock.mockResolvedValue({
      success: true,
      reservationId: 'reservation-1',
      remainingCredits: 900,
      errorCode: null,
    });
    commitFixedAiCreditReservationMock.mockResolvedValue({
      success: true,
      remainingCredits: 900,
      creditsDeducted: 100,
      errorCode: null,
    });
    releaseFixedAiCreditReservationMock.mockResolvedValue({
      success: true,
      remainingCredits: 1000,
      errorCode: null,
    });
  });

  it('treats a filename passed as storagePath as a current chat attachment', async () => {
    const list = vi.fn().mockResolvedValue({
      data: [{ id: 'file-1', name: '123456_report.docx' }],
      error: null,
    });
    const createSignedUrl = vi.fn().mockResolvedValue({
      data: { signedUrl: 'https://storage.test/signed-report' },
      error: null,
    });
    createAdminClientMock.mockResolvedValue({
      rpc: vi.fn(),
      storage: {
        from: vi.fn().mockReturnValue({
          createSignedUrl,
          list,
        }),
      },
    });

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          markdown: '# Converted report',
          title: 'Report',
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = (await executeConvertFileToMarkdown(
      { storagePath: 'report.docx' },
      createContext()
    )) as Record<string, unknown>;

    expect(result.ok).toBe(true);
    expect(result.storagePath).toBe(
      'workspace-1/chats/ai/resources/chat-1/123456_report.docx'
    );
    expect(list).toHaveBeenCalledWith(
      'workspace-1/chats/ai/resources/chat-1',
      expect.objectContaining({ limit: 100 })
    );
    expect(createSignedUrl).toHaveBeenCalledWith(
      'workspace-1/chats/ai/resources/chat-1/123456_report.docx',
      120
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'http://markitdown:8000/markitdown',
      expect.objectContaining({
        body: expect.stringContaining('"filename":"report.docx"'),
      })
    );
  });

  it('converts a direct YouTube URL without looking up chat files', async () => {
    const list = vi.fn();
    const createSignedUrl = vi.fn();
    createAdminClientMock.mockResolvedValue({
      rpc: vi.fn(),
      storage: {
        from: vi.fn().mockReturnValue({
          createSignedUrl,
          list,
        }),
      },
    });

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          markdown: '# Video transcript',
          title: 'Video title',
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = (await executeConvertFileToMarkdown(
      { url: 'https://youtu.be/dQw4w9WgXcQ' },
      createContext()
    )) as Record<string, unknown>;

    expect(result.ok).toBe(true);
    expect(result.url).toBe('https://youtu.be/dQw4w9WgXcQ');
    expect(result.storagePath).toBeNull();
    expect(list).not.toHaveBeenCalled();
    expect(createSignedUrl).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(
      'http://markitdown:8000/markitdown',
      expect.objectContaining({
        body: expect.stringContaining('"url":"https://youtu.be/dQw4w9WgXcQ"'),
      })
    );
    expect(reserveFixedAiCreditsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          sourceType: 'youtube_url',
          sourceUrl: 'https://youtu.be/dQw4w9WgXcQ',
        }),
      }),
      expect.anything()
    );
  });

  it('treats a YouTube URL passed as storagePath as a direct URL', async () => {
    createAdminClientMock.mockResolvedValue({
      rpc: vi.fn(),
      storage: {
        from: vi.fn(),
      },
    });

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          markdown: '# Converted video',
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = (await executeConvertFileToMarkdown(
      { storagePath: 'https://youtu.be/dQw4w9WgXcQ' },
      createContext()
    )) as Record<string, unknown>;

    expect(result.ok).toBe(true);
    expect(result.url).toBe('https://youtu.be/dQw4w9WgXcQ');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://markitdown:8000/markitdown',
      expect.objectContaining({
        body: expect.stringContaining('"url":"https://youtu.be/dQw4w9WgXcQ"'),
      })
    );
  });

  it('rejects non-YouTube direct URLs before reserving credits', async () => {
    const result = (await executeConvertFileToMarkdown(
      { url: 'https://example.com/article' },
      createContext()
    )) as Record<string, unknown>;

    expect(result).toEqual({
      ok: false,
      error:
        'Invalid URL for MarkItDown. Direct URL conversion currently supports HTTPS YouTube links only.',
    });
    expect(createAdminClientMock).not.toHaveBeenCalled();
    expect(reserveFixedAiCreditsMock).not.toHaveBeenCalled();
  });

  it('still rejects full storage paths outside the current workspace', async () => {
    createAdminClientMock.mockResolvedValue({
      rpc: vi.fn(),
      storage: {
        from: vi.fn(),
      },
    });

    const result = (await executeConvertFileToMarkdown(
      {
        storagePath:
          'other-workspace/chats/ai/resources/chat-1/123456_report.docx',
      },
      createContext()
    )) as Record<string, unknown>;

    expect(result).toEqual({
      ok: false,
      error: 'Invalid storagePath for current workspace.',
    });
    expect(reserveFixedAiCreditsMock).not.toHaveBeenCalled();
  });
});
