import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  checkStorageQuota,
  DEFAULT_WORKSPACE_STORAGE_QUOTA,
  formatBytes,
  getImageDimensions,
  getVideoDimensions,
  getWorkspaceStorageLimit,
  getWorkspaceStorageUsage,
  MAX_IMAGE_SIZE,
  MAX_VIDEO_SIZE,
  StorageQuotaError,
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
        rpc: vi.fn(),
      };
    });

    it('should pass when quota is not exceeded', async () => {
      // Mock get_workspace_drive_size returns 3MB usage
      mockSupabaseClient.rpc
        .mockResolvedValueOnce({ data: 3 * 1024 * 1024, error: null }) // current usage
        .mockResolvedValueOnce({ data: 100 * 1024 * 1024, error: null }); // storage limit

      await expect(
        checkStorageQuota(mockSupabaseClient, 'workspace-1', 5 * 1024 * 1024)
      ).resolves.toBeUndefined();

      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith(
        'get_workspace_drive_size',
        { ws_id: 'workspace-1' }
      );
    });

    it('should throw StorageQuotaError when quota exceeded', async () => {
      // Mock 95MB usage with 100MB limit
      mockSupabaseClient.rpc
        .mockResolvedValueOnce({ data: 95 * 1024 * 1024, error: null }) // current usage
        .mockResolvedValueOnce({ data: 100 * 1024 * 1024, error: null }); // storage limit

      await expect(
        checkStorageQuota(mockSupabaseClient, 'workspace-1', 10 * 1024 * 1024)
      ).rejects.toThrow(StorageQuotaError);
    });

    it('should not block upload if RPC fails', async () => {
      const consoleWarnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => {});

      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: null,
        error: new Error('RPC error'),
      });

      await expect(
        checkStorageQuota(mockSupabaseClient, 'workspace-1', 5 * 1024 * 1024)
      ).resolves.toBeUndefined();

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Failed to get workspace storage usage:',
        expect.any(Error)
      );

      consoleWarnSpy.mockRestore();
    });

    it('should use provided quota override instead of fetching from database', async () => {
      // Only usage is fetched, limit is provided as parameter
      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: 50 * 1024 * 1024,
        error: null,
      }); // current usage

      // With 50MB usage and 60MB quota, 15MB file should exceed
      await expect(
        checkStorageQuota(
          mockSupabaseClient,
          'workspace-1',
          15 * 1024 * 1024,
          60 * 1024 * 1024 // explicit quota
        )
      ).rejects.toThrow(StorageQuotaError);

      // Should only call get_workspace_drive_size, not get_workspace_storage_limit
      expect(mockSupabaseClient.rpc).toHaveBeenCalledTimes(1);
      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith(
        'get_workspace_drive_size',
        { ws_id: 'workspace-1' }
      );
    });

    it('should handle errors during calculation gracefully', async () => {
      const consoleWarnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => {});

      mockSupabaseClient.rpc.mockRejectedValueOnce(
        new Error('Calculation error')
      );

      await expect(
        checkStorageQuota(mockSupabaseClient, 'workspace-1', 5 * 1024 * 1024)
      ).resolves.toBeUndefined();

      expect(consoleWarnSpy).toHaveBeenCalled();
      consoleWarnSpy.mockRestore();
    });
  });

  describe('getWorkspaceStorageUsage', () => {
    let mockSupabaseClient: any;

    beforeEach(() => {
      mockSupabaseClient = {
        rpc: vi.fn(),
      };
    });

    it('should return storage usage from RPC', async () => {
      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: 50 * 1024 * 1024,
        error: null,
      });

      const result = await getWorkspaceStorageUsage(
        mockSupabaseClient,
        'workspace-1'
      );

      expect(result).toBe(50 * 1024 * 1024);
      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith(
        'get_workspace_drive_size',
        { ws_id: 'workspace-1' }
      );
    });

    it('should return null on error', async () => {
      const consoleWarnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => {});

      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: null,
        error: new Error('RPC error'),
      });

      const result = await getWorkspaceStorageUsage(
        mockSupabaseClient,
        'workspace-1'
      );

      expect(result).toBeNull();
      consoleWarnSpy.mockRestore();
    });
  });

  describe('getWorkspaceStorageLimit', () => {
    let mockSupabaseClient: any;

    beforeEach(() => {
      mockSupabaseClient = {
        rpc: vi.fn(),
      };
    });

    it('should return storage limit from RPC', async () => {
      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: 200 * 1024 * 1024,
        error: null,
      });

      const result = await getWorkspaceStorageLimit(
        mockSupabaseClient,
        'workspace-1'
      );

      expect(result).toBe(200 * 1024 * 1024);
      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith(
        'get_workspace_storage_limit',
        { ws_id: 'workspace-1' }
      );
    });

    it('should return default quota on error', async () => {
      const consoleWarnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => {});

      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: null,
        error: new Error('RPC error'),
      });

      const result = await getWorkspaceStorageLimit(
        mockSupabaseClient,
        'workspace-1'
      );

      expect(result).toBe(DEFAULT_WORKSPACE_STORAGE_QUOTA);
      consoleWarnSpy.mockRestore();
    });
  });

  describe('getImageDimensions', () => {
    let originalImage: typeof Image;
    let originalCreateObjectURL: typeof URL.createObjectURL;
    let originalRevokeObjectURL: typeof URL.revokeObjectURL;

    beforeEach(() => {
      originalImage = global.Image;
      originalCreateObjectURL = global.URL.createObjectURL;
      originalRevokeObjectURL = global.URL.revokeObjectURL;
    });

    afterEach(() => {
      global.Image = originalImage;
      global.URL.createObjectURL = originalCreateObjectURL;
      global.URL.revokeObjectURL = originalRevokeObjectURL;
    });

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
    let originalCreateObjectURL: typeof URL.createObjectURL;
    let originalRevokeObjectURL: typeof URL.revokeObjectURL;
    let originalCreateElement: typeof document.createElement;

    beforeEach(() => {
      originalCreateObjectURL = global.URL.createObjectURL;
      originalRevokeObjectURL = global.URL.revokeObjectURL;
      originalCreateElement = document.createElement.bind(document);
    });

    afterEach(() => {
      global.URL.createObjectURL = originalCreateObjectURL;
      global.URL.revokeObjectURL = originalRevokeObjectURL;
      document.createElement = originalCreateElement;
    });

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
    });
  });
});
