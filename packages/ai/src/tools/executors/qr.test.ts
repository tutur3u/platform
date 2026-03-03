import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MiraToolContext } from '../mira-tools';
import { executeCreateQrCode } from './qr';

const { qrcodeToDataUrlMock, createAdminClientMock } = vi.hoisted(() => ({
  qrcodeToDataUrlMock: vi.fn(),
  createAdminClientMock: vi.fn(),
}));

vi.mock('qrcode', () => ({
  default: {
    toDataURL: qrcodeToDataUrlMock,
  },
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: createAdminClientMock,
}));

function createContext(): MiraToolContext {
  return {
    userId: 'user-1',
    wsId: 'ws-1',
    supabase: {} as MiraToolContext['supabase'],
    timezone: 'Asia/Saigon',
  };
}

describe('executeCreateQrCode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns validation error when value is blank', async () => {
    const result = (await executeCreateQrCode(
      { value: '   ' },
      createContext()
    )) as {
      success: boolean;
      error?: string;
    };

    expect(result.success).toBe(false);
    expect(result.error).toContain('required');
  });

  it('generates, uploads, and returns signed URL', async () => {
    qrcodeToDataUrlMock.mockResolvedValue('data:image/png;base64,QUJD');

    const upload = vi.fn().mockResolvedValue({ error: null });
    const createSignedUrl = vi.fn().mockResolvedValue({
      data: { signedUrl: 'https://example.com/signed-qr.png' },
      error: null,
    });

    createAdminClientMock.mockResolvedValue({
      storage: {
        from: vi.fn().mockReturnValue({
          upload,
          createSignedUrl,
        }),
      },
    });

    const result = (await executeCreateQrCode(
      {
        value: 'https://tuturuuu.com',
        size: 640,
        foregroundColor: '#112233',
        backgroundColor: '#FFFFFF',
        fileName: 'Team QR',
      },
      createContext()
    )) as Record<string, unknown>;

    expect(result.success).toBe(true);
    expect(result.qrCodeUrl).toBe('https://example.com/signed-qr.png');
    expect(result.downloadUrl).toBe('https://example.com/signed-qr.png');
    expect(result.storagePath).toEqual(
      expect.stringContaining('ws-1/drive/mira/qr/')
    );
    expect(result.fileName).toBe('Team-QR.png');
    expect(result.foregroundColor).toBe('#112233'.toUpperCase());

    expect(qrcodeToDataUrlMock).toHaveBeenCalledWith(
      'https://tuturuuu.com',
      expect.objectContaining({
        width: 640,
        color: {
          dark: '#112233'.toUpperCase(),
          light: '#FFFFFF',
        },
      })
    );
  });

  it('returns error when upload fails', async () => {
    qrcodeToDataUrlMock.mockResolvedValue('data:image/png;base64,QUJD');

    const upload = vi.fn().mockResolvedValue({
      error: { message: 'storage upload failed' },
    });
    const createSignedUrl = vi.fn();

    createAdminClientMock.mockResolvedValue({
      storage: {
        from: vi.fn().mockReturnValue({
          upload,
          createSignedUrl,
        }),
      },
    });

    const result = (await executeCreateQrCode(
      { value: 'https://tuturuuu.com' },
      createContext()
    )) as {
      success: boolean;
      error?: string;
    };

    expect(result.success).toBe(false);
    expect(result.error).toContain('Upload failed');
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it('returns error when signed URL creation fails', async () => {
    qrcodeToDataUrlMock.mockResolvedValue('data:image/png;base64,QUJD');

    const upload = vi.fn().mockResolvedValue({ error: null });
    const createSignedUrl = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'signed URL unavailable' },
    });

    createAdminClientMock.mockResolvedValue({
      storage: {
        from: vi.fn().mockReturnValue({
          upload,
          createSignedUrl,
        }),
      },
    });

    const result = (await executeCreateQrCode(
      { value: 'https://tuturuuu.com' },
      createContext()
    )) as {
      success: boolean;
      error?: string;
    };

    expect(result.success).toBe(false);
    expect(result.error).toContain('Signed URL failed');
  });

  it('clamps size to supported bounds', async () => {
    qrcodeToDataUrlMock.mockResolvedValue('data:image/png;base64,QUJD');

    const upload = vi.fn().mockResolvedValue({ error: null });
    const createSignedUrl = vi.fn().mockResolvedValue({
      data: { signedUrl: 'https://example.com/signed-qr.png' },
      error: null,
    });

    createAdminClientMock.mockResolvedValue({
      storage: {
        from: vi.fn().mockReturnValue({
          upload,
          createSignedUrl,
        }),
      },
    });

    await executeCreateQrCode(
      { value: 'https://tuturuuu.com', size: 64 },
      createContext()
    );

    await executeCreateQrCode(
      { value: 'https://tuturuuu.com', size: 9999 },
      createContext()
    );

    expect(qrcodeToDataUrlMock).toHaveBeenNthCalledWith(
      1,
      'https://tuturuuu.com',
      expect.objectContaining({ width: 128 })
    );
    expect(qrcodeToDataUrlMock).toHaveBeenNthCalledWith(
      2,
      'https://tuturuuu.com',
      expect.objectContaining({ width: 2048 })
    );
  });

  it('falls back to default colors for invalid color values', async () => {
    qrcodeToDataUrlMock.mockResolvedValue('data:image/png;base64,QUJD');

    const upload = vi.fn().mockResolvedValue({ error: null });
    const createSignedUrl = vi.fn().mockResolvedValue({
      data: { signedUrl: 'https://example.com/signed-qr.png' },
      error: null,
    });

    createAdminClientMock.mockResolvedValue({
      storage: {
        from: vi.fn().mockReturnValue({
          upload,
          createSignedUrl,
        }),
      },
    });

    await executeCreateQrCode(
      {
        value: 'https://tuturuuu.com',
        foregroundColor: 'rgb(0,0,0)',
        backgroundColor: '#12',
      },
      createContext()
    );

    expect(qrcodeToDataUrlMock).toHaveBeenCalledWith(
      'https://tuturuuu.com',
      expect.objectContaining({
        color: {
          dark: '#000000',
          light: '#FFFFFF',
        },
      })
    );
  });
});
