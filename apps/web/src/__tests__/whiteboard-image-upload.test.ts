import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  imageCompression: vi.fn(),
}));

vi.mock('browser-image-compression', () => ({
  default: (...args: Parameters<typeof mocks.imageCompression>) =>
    mocks.imageCompression(...args),
}));

describe('whiteboard image upload optimization', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('optimizes supported raster formats before upload', async () => {
    const optimizedBlob = new Blob(['optimized'], { type: 'image/png' });
    mocks.imageCompression.mockResolvedValue(optimizedBlob);

    const { optimizeWhiteboardImageUpload } = await import(
      '@/lib/whiteboards/image-upload'
    );
    const originalFile = new File(['original'], 'diagram.png', {
      type: 'image/png',
    });

    const result = await optimizeWhiteboardImageUpload(originalFile);

    expect(mocks.imageCompression).toHaveBeenCalledWith(
      originalFile,
      expect.objectContaining({
        fileType: 'image/png',
        maxWidthOrHeight: 4096,
      })
    );
    expect(result).toBeInstanceOf(File);
    expect(result.name).toBe('diagram.png');
    expect(result.type).toBe('image/png');
  });

  it('leaves unsupported formats unchanged', async () => {
    const { optimizeWhiteboardImageUpload } = await import(
      '@/lib/whiteboards/image-upload'
    );
    const originalFile = new File(['vector'], 'diagram.svg', {
      type: 'image/svg+xml',
    });

    const result = await optimizeWhiteboardImageUpload(originalFile);

    expect(mocks.imageCompression).not.toHaveBeenCalled();
    expect(result).toBe(originalFile);
  });
});
