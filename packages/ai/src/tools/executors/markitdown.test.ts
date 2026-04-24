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
