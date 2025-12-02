import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  MAX_IMAGE_SIZE,
  MAX_VIDEO_SIZE,
  DEFAULT_WORKSPACE_STORAGE_QUOTA,
  formatBytes,
  StorageQuotaError,
  checkStorageQuota,
  getImageDimensions,
  getVideoDimensions,
} from '../media-utils';

describe('media-utils', () => {
  describe('constants', () => {
    it('should have correct size limits', () => {
      expect(MAX_IMAGE_SIZE).toBe(5 * 1024 * 1024); // 5MB
      expect(MAX_VIDEO_SIZE).toBe(50 * 1024 * 1024); // 50MB
      expect(DEFAULT_WORKSPACE_STORAGE_QUOTA).toBe(100 * 1024 * 1024); // 100MB
    });
  });

  describe('formatBytes', () => {
    it('should format 0 bytes correctly', () => {
      expect(formatBytes(0)).toBe('0 Bytes');
    });

    it('should format bytes correctly', () => {
      expect(formatBytes(500)).toBe('500 Bytes');
    });

    it('should format kilobytes correctly', () => {
      expect(formatBytes(1024)).toBe('1 KB');
      expect(formatBytes(1536)).toBe('1.5 KB');
    });

    it('should format megabytes correctly', () => {
      expect(formatBytes(1048576)).toBe('1 MB');
      expect(formatBytes(5242880)).toBe('5 MB');
    });

    it('should format gigabytes correctly', () => {
      expect(formatBytes(1073741824)).toBe('1 GB');
    });

    it('should round to 2 decimal places', () => {
      expect(formatBytes(1536000)).toBe('1.46 MB');
    });
  });

  describe('StorageQuotaError', () => {
    it('should create error with correct message', () => {
      const error = new StorageQuotaError(
        96 * 1024 * 1024, // 96MB current
        14 * 1024 * 1024, // 14MB file
        100 * 1024 * 1024 // 100MB quota
      );

      expect(error.name).toBe('StorageQuotaError');
      expect(error.message).toContain('Storage quota exceeded');
      expect(error.message).toContain('96 MB');
      expect(error.message).toContain('14 MB');
      expect(error.message).toContain('110 MB');
      expect(error.message).toContain('100 MB');
      expect(error.currentUsage).toBe(96 * 1024 * 1024);
      expect(error.fileSize).toBe(14 * 1024 * 1024);
      expect(error.quota).toBe(100 * 1024 * 1024);
    });

    it('should be instanceof Error', () => {
      const error = new StorageQuotaError(0, 0, 0);
      expect(error instanceof Error).toBe(true);
      expect(error instanceof StorageQuotaError).toBe(true);
    });
  });

  describe('checkStorageQuota', () => {
    let mockSupabaseClient: any;

    beforeEach(() => {
      mockSupabaseClient = {
        storage: {
          from: vi.fn().mockReturnThis(),
          list: vi.fn(),
        },
      };
    });

    it('should pass when quota is not exceeded', async () => {
      mockSupabaseClient.storage.list
        // First call: check if workspace folder exists
        .mockResolvedValueOnce({
          data: [],
          error: null,
        })
        // Second call: get all files in workspace
        .mockResolvedValueOnce({
          data: [
            { name: 'file1.jpg', metadata: { size: 1024 * 1024 } }, // 1MB
            { name: 'file2.jpg', metadata: { size: 2 * 1024 * 1024 } }, // 2MB
          ],
          error: null,
        })
        // Third call: check for subfolders (none in this case)
        .mockResolvedValueOnce({ data: [], error: null });

      await expect(
        checkStorageQuota(
          mockSupabaseClient,
          'workspace-1',
          5 * 1024 * 1024,
          100 * 1024 * 1024
        )
      ).resolves.toBeUndefined();
    });

    it('should throw StorageQuotaError when quota exceeded', async () => {
      mockSupabaseClient.storage.list
        // First call: check if workspace folder exists
        .mockResolvedValueOnce({
          data: [],
          error: null,
        })
        // Second call: get all files in workspace
        .mockResolvedValueOnce({
          data: [
            { name: 'file1.jpg', metadata: { size: 95 * 1024 * 1024 } }, // 95MB
          ],
          error: null,
        })
        // Third call: check for subfolders (none in this case)
        .mockResolvedValueOnce({ data: [], error: null });

      await expect(
        checkStorageQuota(
          mockSupabaseClient,
          'workspace-1',
          10 * 1024 * 1024,
          100 * 1024 * 1024
        )
      ).rejects.toThrow(StorageQuotaError);
    });

    it('should not block upload if list fails', async () => {
      const consoleWarnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => {});

      mockSupabaseClient.storage.list.mockResolvedValueOnce({
        data: null,
        error: new Error('Network error'),
      });

      await expect(
        checkStorageQuota(mockSupabaseClient, 'workspace-1', 5 * 1024 * 1024)
      ).resolves.toBeUndefined();

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Failed to check storage quota:',
        expect.any(Error)
      );

      consoleWarnSpy.mockRestore();
    });

    it('should calculate folder sizes recursively', async () => {
      mockSupabaseClient.storage.list
        // First call: check if workspace folder exists
        .mockResolvedValueOnce({
          data: [],
          error: null,
        })
        // Second call: get root folder contents
        .mockResolvedValueOnce({
          data: [
            { name: 'file1.jpg', metadata: { size: 1024 * 1024 } }, // 1MB
            { name: 'subfolder' }, // No metadata = folder
          ],
          error: null,
        })
        // Third call: get subfolder contents
        .mockResolvedValueOnce({
          data: [{ name: 'file2.jpg', metadata: { size: 2 * 1024 * 1024 } }], // 2MB
          error: null,
        })
        // Fourth call: check subfolder's children
        .mockResolvedValueOnce({
          data: [],
          error: null,
        });

      await expect(
        checkStorageQuota(
          mockSupabaseClient,
          'workspace-1',
          5 * 1024 * 1024,
          100 * 1024 * 1024
        )
      ).resolves.toBeUndefined();
    });

    it('should use default quota if not specified', async () => {
      mockSupabaseClient.storage.list
        // First call: check if workspace folder exists
        .mockResolvedValueOnce({
          data: [],
          error: null,
        })
        // Second call: get all files in workspace
        .mockResolvedValueOnce({
          data: [{ name: 'file1.jpg', metadata: { size: 95 * 1024 * 1024 } }],
          error: null,
        })
        // Third call: check for subfolders (none in this case)
        .mockResolvedValueOnce({ data: [], error: null });

      // Should use DEFAULT_WORKSPACE_STORAGE_QUOTA (100MB)
      await expect(
        checkStorageQuota(mockSupabaseClient, 'workspace-1', 10 * 1024 * 1024)
      ).rejects.toThrow(StorageQuotaError);
    });

    it('should handle errors during calculation gracefully', async () => {
      const consoleWarnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => {});

      mockSupabaseClient.storage.list
        .mockResolvedValueOnce({
          data: [{ name: 'file1.jpg', metadata: { size: 1024 } }],
          error: null,
        })
        .mockRejectedValueOnce(new Error('Calculation error'));

      await expect(
        checkStorageQuota(mockSupabaseClient, 'workspace-1', 5 * 1024 * 1024)
      ).resolves.toBeUndefined();

      expect(consoleWarnSpy).toHaveBeenCalled();
      consoleWarnSpy.mockRestore();
    });
  });

  describe('getImageDimensions', () => {
    it('should resolve with image dimensions', async () => {
      const mockFile = new File([''], 'test.jpg', { type: 'image/jpeg' });

      class MockImage {
        naturalWidth = 800;
        naturalHeight = 600;
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        src = '';

        constructor() {
          // Auto-trigger onload when src is set
          setTimeout(() => {
            if (this.onload) this.onload();
          }, 0);
        }
      }

      global.Image = MockImage as any;
      global.URL.createObjectURL = vi.fn(() => 'blob:test');
      global.URL.revokeObjectURL = vi.fn();

      const result = await getImageDimensions(mockFile);

      expect(result).toEqual({ width: 800, height: 600 });
      expect(global.URL.createObjectURL).toHaveBeenCalledWith(mockFile);
      expect(global.URL.revokeObjectURL).toHaveBeenCalledWith('blob:test');
    });

    it('should reject on image load error', async () => {
      const mockFile = new File([''], 'test.jpg', { type: 'image/jpeg' });

      class MockImage {
        naturalWidth = 0;
        naturalHeight = 0;
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        src = '';

        constructor() {
          // Auto-trigger onerror when src is set
          setTimeout(() => {
            if (this.onerror) this.onerror();
          }, 0);
        }
      }

      global.Image = MockImage as any;
      global.URL.createObjectURL = vi.fn(() => 'blob:test');
      global.URL.revokeObjectURL = vi.fn();

      await expect(getImageDimensions(mockFile)).rejects.toThrow(
        'Failed to load image'
      );
      expect(global.URL.revokeObjectURL).toHaveBeenCalledWith('blob:test');
    });
  });

  describe('getVideoDimensions', () => {
    it('should resolve with video dimensions', async () => {
      const mockFile = new File([''], 'test.mp4', { type: 'video/mp4' });

      const mockVideo = {
        videoWidth: 1920,
        videoHeight: 1080,
        onloadedmetadata: null as any,
        onerror: null as any,
        src: '',
      };

      global.URL.createObjectURL = vi.fn(() => 'blob:test');
      global.URL.revokeObjectURL = vi.fn();

      // Mock document.createElement for video
      const originalCreateElement = document.createElement.bind(document);
      document.createElement = vi.fn((tagName: string) => {
        if (tagName === 'video') return mockVideo as any;
        return originalCreateElement(tagName);
      });

      const promise = getVideoDimensions(mockFile);

      // Trigger onloadedmetadata
      setTimeout(() => mockVideo.onloadedmetadata?.(), 0);

      const result = await promise;

      expect(result).toEqual({ width: 1920, height: 1080 });
      expect(global.URL.revokeObjectURL).toHaveBeenCalledWith('blob:test');

      // Restore
      document.createElement = originalCreateElement;
    });

    it('should reject on video load error', async () => {
      const mockFile = new File([''], 'test.mp4', { type: 'video/mp4' });

      const mockVideo = {
        videoWidth: 0,
        videoHeight: 0,
        onloadedmetadata: null as any,
        onerror: null as any,
        src: '',
      };

      global.URL.createObjectURL = vi.fn(() => 'blob:test');
      global.URL.revokeObjectURL = vi.fn();

      const originalCreateElement = document.createElement.bind(document);
      document.createElement = vi.fn((tagName: string) => {
        if (tagName === 'video') return mockVideo as any;
        return originalCreateElement(tagName);
      });

      const promise = getVideoDimensions(mockFile);

      // Trigger onerror
      setTimeout(() => mockVideo.onerror?.(), 0);

      await expect(promise).rejects.toThrow('Failed to load video');
      expect(global.URL.revokeObjectURL).toHaveBeenCalledWith('blob:test');

      // Restore
      document.createElement = originalCreateElement;
    });
  });
});
