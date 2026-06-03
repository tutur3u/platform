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

function createContext(
  overrides: Partial<MiraToolContext> = {}
): MiraToolContext {
  return {
    userId: 'user-1',
    wsId: 'workspace-1',
    chatId: 'chat-1',
    supabase: {} as MiraToolContext['supabase'],
    timezone: 'UTC',
    ...overrides,
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

  it('charges conversion credits for direct YouTube URLs before calling the sidecar', async () => {
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
    expect(result.title).toBe('Video title');
    expect(result.markdown).toBe('# Video transcript');
    expect(result.creditsCharged).toBe(100);
    expect(result.metadataOnly).toBeUndefined();
    expect(result.storagePath).toBeNull();
    expect(list).not.toHaveBeenCalled();
    expect(createSignedUrl).not.toHaveBeenCalled();
    expect(reserveFixedAiCreditsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 100,
        metadata: expect.objectContaining({
          sourceType: 'youtube_url',
          sourceUrl: 'https://youtu.be/dQw4w9WgXcQ',
        }),
        wsId: 'workspace-1',
      }),
      expect.any(Object)
    );
    expect(commitFixedAiCreditReservationMock).toHaveBeenCalledWith(
      'reservation-1',
      expect.objectContaining({
        sourceType: 'youtube_url',
        sourceUrl: 'https://youtu.be/dQw4w9WgXcQ',
      }),
      expect.any(Object)
    );
    const reserveCallOrder =
      reserveFixedAiCreditsMock.mock.invocationCallOrder[0];
    const fetchCallOrder = fetchMock.mock.invocationCallOrder[0];
    expect(reserveCallOrder).toBeDefined();
    expect(fetchCallOrder).toBeDefined();
    expect(reserveCallOrder as number).toBeLessThan(fetchCallOrder as number);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://markitdown:8000/markitdown',
      expect.objectContaining({
        body: expect.stringContaining('"url":"https://youtu.be/dQw4w9WgXcQ"'),
      })
    );
  });

  it('denies user-group files when the caller did not prove group read access', async () => {
    const result = (await executeConvertFileToMarkdown(
      {
        storagePath: 'workspace-1/user-groups/group-1/syllabus.pdf',
      },
      createContext()
    )) as Record<string, unknown>;

    expect(result).toEqual({
      ok: false,
      error: 'You do not have permission to read this user-group file.',
    });
    expect(createAdminClientMock).not.toHaveBeenCalled();
    expect(reserveFixedAiCreditsMock).not.toHaveBeenCalled();
  });

  it('converts user-group files only after caller-provided storage authorization', async () => {
    const createSignedUrl = vi.fn().mockResolvedValue({
      data: { signedUrl: 'https://storage.test/signed-syllabus' },
      error: null,
    });
    const canReadUserGroupStorage = vi.fn().mockResolvedValue(true);
    createAdminClientMock.mockResolvedValue({
      rpc: vi.fn(),
      storage: {
        from: vi.fn().mockReturnValue({
          createSignedUrl,
          list: vi.fn(),
        }),
      },
    });

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          markdown: '# Converted syllabus',
          title: 'Syllabus',
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = (await executeConvertFileToMarkdown(
      {
        storagePath: 'workspace-1/user-groups/group-1/syllabus.pdf',
      },
      createContext({ canReadUserGroupStorage })
    )) as Record<string, unknown>;

    expect(result.ok).toBe(true);
    expect(result.storagePath).toBe(
      'workspace-1/user-groups/group-1/syllabus.pdf'
    );
    expect(canReadUserGroupStorage).toHaveBeenCalledWith({
      groupId: 'group-1',
      storagePath: 'workspace-1/user-groups/group-1/syllabus.pdf',
      wsId: 'workspace-1',
    });
    expect(createSignedUrl).toHaveBeenCalledWith(
      'workspace-1/user-groups/group-1/syllabus.pdf',
      120
    );
    expect(reserveFixedAiCreditsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 100,
        wsId: 'workspace-1',
      }),
      expect.any(Object)
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
          markdown: '# Video transcript',
          title: 'Video title',
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
    expect(result.markdown).toBe('# Video transcript');
    expect(result.creditsCharged).toBe(100);
    expect(reserveFixedAiCreditsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 100,
        metadata: expect.objectContaining({
          sourceType: 'youtube_url',
          sourceUrl: 'https://youtu.be/dQw4w9WgXcQ',
        }),
      }),
      expect.any(Object)
    );
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
    expect(createAdminClientMock).not.toHaveBeenCalled();
    expect(reserveFixedAiCreditsMock).not.toHaveBeenCalled();
  });
});
