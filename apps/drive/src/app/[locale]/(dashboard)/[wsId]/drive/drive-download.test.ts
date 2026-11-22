import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  downloadDriveFiles,
  getSignedLinkStaleTime,
  hasLargeDownload,
  LARGE_DOWNLOAD_BYTES,
  SIGNED_LINK_GC_TIME_MS,
} from './drive-download';

const api = vi.hoisted(() => ({ sign: vi.fn() }));

vi.mock('@tuturuuu/internal-api', () => ({
  createWorkspaceStorageSignedUrl: api.sign,
}));

describe('getSignedLinkStaleTime', () => {
  it('re-signs ten minutes before a reported lifetime ends', () => {
    expect(getSignedLinkStaleTime(3600)).toBe(50 * 60 * 1000);
    expect(getSignedLinkStaleTime(604_800)).toBe((604_800 - 600) * 1000);
  });

  it('keeps half of a short lifetime and falls back to the requested one', () => {
    expect(getSignedLinkStaleTime(600)).toBe(300 * 1000);
    expect(getSignedLinkStaleTime(null)).toBe(50 * 60 * 1000);
    expect(SIGNED_LINK_GC_TIME_MS).toBeGreaterThanOrEqual(3600 * 1000);
  });
});

describe('hasLargeDownload', () => {
  it('flags files at or above the in-memory threshold', () => {
    expect(
      hasLargeDownload([{ id: '1', metadata: { size: LARGE_DOWNLOAD_BYTES } }])
    ).toBe(true);
    expect(hasLargeDownload([{ id: '1', metadata: { size: 10 } }, {}])).toBe(
      false
    );
  });
});

describe('downloadDriveFiles', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('revokes the object URL only after the save has started', async () => {
    vi.useFakeTimers();
    api.sign.mockResolvedValue('https://r2.test/a');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('hello', { status: 200 }))
    );
    const revoke = vi.fn();
    URL.createObjectURL = vi.fn(() => 'blob:a');
    URL.revokeObjectURL = revoke;
    HTMLAnchorElement.prototype.click = vi.fn();

    await downloadDriveFiles('ws', 'docs', [{ id: '1', name: 'a.txt' }]);

    expect(revoke).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(revoke).toHaveBeenCalledWith('blob:a');
  });
});
