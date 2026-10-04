import { afterEach, expect, it, vi } from 'vitest';
import { optimizeProfileMediaFile } from './profile-media-optimize';

const source = () => new File(['source'], 'large.png', { type: 'image/png' });
function browser(width = 4000, height = 2000, sizes = [400000]) {
  const revoke = vi.fn();
  vi.stubGlobal('URL', {
    createObjectURL: () => 'blob:synthetic',
    revokeObjectURL: revoke,
  });
  vi.stubGlobal(
    'Image',
    class {
      naturalWidth = width;
      naturalHeight = height;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
  );
  const drawImage = vi.fn();
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({ drawImage }),
    toBlob: vi.fn((callback: (blob: Blob) => void) =>
      callback(
        new Blob([new Uint8Array(sizes.shift() ?? 400000)], {
          type: 'image/webp',
        })
      )
    ),
  };
  vi.stubGlobal('document', { createElement: () => canvas });
  return { canvas, revoke, drawImage };
}
afterEach(() => vi.unstubAllGlobals());
it.each(['avatar', 'banner'] as const)(
  'resizes %s before transport with truthful filename and MIME',
  async (kind) => {
    const { canvas, revoke } = browser();
    const result = await optimizeProfileMediaFile(source(), kind);
    expect(result.name).toBe(`${kind}.webp`);
    expect(result.type).toBe('image/webp');
    expect(result.size).toBeLessThanOrEqual(
      kind === 'avatar' ? 1000000 : 2000000
    );
    expect(canvas.width).toBe(kind === 'avatar' ? 1024 : 2560);
    expect(canvas.height).toBe(kind === 'avatar' ? 512 : 1280);
    expect(revoke).toHaveBeenCalledWith('blob:synthetic');
  }
);
it('lowers quality and dimensions until the final limit is met', async () => {
  const { canvas } = browser(2000, 2000, [1000001, 1000001, 1000001, 1000000]);
  expect((await optimizeProfileMediaFile(source(), 'avatar')).size).toBe(
    1000000
  );
  expect(canvas.toBlob).toHaveBeenCalledTimes(4);
  expect(canvas.width).toBe(717);
});
it('cleans up after unsafe decoded dimensions', async () => {
  const { revoke, drawImage } = browser(10000, 10000);
  await expect(optimizeProfileMediaFile(source(), 'banner')).rejects.toThrow(
    'Invalid profile image'
  );
  expect(drawImage).not.toHaveBeenCalled();
  expect(revoke).toHaveBeenCalled();
});
it('rejects unsupported files before decoding', async () => {
  await expect(
    optimizeProfileMediaFile(
      new File(['svg'], 'art.svg', { type: 'image/svg+xml' }),
      'avatar'
    )
  ).rejects.toThrow('Invalid profile image');
});
