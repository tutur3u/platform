import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AuthenticationError,
  NetworkError,
  NotFoundError,
  ValidationError,
} from './errors';
import { StorageClient, TuturuuuClient } from './storage';
import type {
  AnalyticsResponse,
  CreateFolderResponse,
  DeleteResponse,
  ListStorageResponse,
  ShareResponse,
  UploadResponse,
} from './types';

// Mock fetch globally
const mockFetch = vi.fn();

// Helper to create mock response with proper headers
const createMockResponse = (data: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => data,
  blob: async () => (data instanceof Blob ? data : new Blob()),
});

describe('TuturuuuClient', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('constructor', () => {
    it('should initialize with string API key', () => {
      const client = new TuturuuuClient('ttr_test_key');
      expect(client.apiKey).toBe('ttr_test_key');
      expect(client.baseUrl).toBe('https://tuturuuu.com/api/v1');
      expect(client.timeout).toBe(30000);
    });

    it('should initialize with config object', () => {
      const client = new TuturuuuClient({
        apiKey: 'ttr_test_key',
        baseUrl: 'https://custom.api.com',
        timeout: 60000,
      });
      expect(client.apiKey).toBe('ttr_test_key');
      expect(client.baseUrl).toBe('https://custom.api.com');
      expect(client.timeout).toBe(60000);
    });

    it('should use default values for optional config', () => {
      const client = new TuturuuuClient({
        apiKey: 'ttr_test_key',
      });
      expect(client.baseUrl).toBe('https://tuturuuu.com/api/v1');
      expect(client.timeout).toBe(30000);
    });

    it('should throw ValidationError for invalid API key', () => {
      expect(() => new TuturuuuClient('invalid_key')).toThrow(ValidationError);
      expect(() => new TuturuuuClient('invalid_key')).toThrow(
        'Invalid API key format'
      );
    });

    it('should throw ValidationError for empty API key', () => {
      expect(() => new TuturuuuClient('')).toThrow(ValidationError);
    });

    it('should initialize storage and documents clients', () => {
      const client = new TuturuuuClient('ttr_test_key');
      expect(client.storage).toBeInstanceOf(StorageClient);
      expect(client.documents).toBeDefined();
    });

    it('should accept custom fetch function', () => {
      const customFetch = vi.fn();
      const client = new TuturuuuClient({
        apiKey: 'ttr_test_key',
        fetch: customFetch,
      });
      expect(client.fetch).toBe(customFetch);
    });
  });

  describe('request', () => {
    it('should make successful GET request', async () => {
      const mockResponse = { data: 'test' };
      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      const client = new TuturuuuClient('ttr_test_key');
      const result = await client.request('/test');

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://tuturuuu.com/api/v1/test',
        expect.any(Object)
      );

      // Inspect headers from the actual call
      const callOptions = mockFetch.mock.calls[0]?.[1];
      const headers = callOptions?.headers;
      const authHeader =
        headers instanceof Headers
          ? headers.get('Authorization')
          : headers?.Authorization;
      expect(authHeader).toBe('Bearer ttr_test_key');
    });

    it('should make successful POST request with JSON body', async () => {
      const mockResponse = { data: 'test' };
      const body = JSON.stringify({ key: 'value' });

      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      const client = new TuturuuuClient('ttr_test_key');
      await client.request('/test', { method: 'POST', body });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://tuturuuu.com/api/v1/test',
        expect.objectContaining({
          method: 'POST',
          body,
        })
      );

      // Inspect headers from the actual call
      const callOptions = mockFetch.mock.calls[0]?.[1];
      const headers = callOptions?.headers;
      const authHeader =
        headers instanceof Headers
          ? headers.get('Authorization')
          : headers?.Authorization;
      const contentType =
        headers instanceof Headers
          ? headers.get('Content-Type')
          : headers?.['Content-Type'];
      expect(authHeader).toBe('Bearer ttr_test_key');
      expect(contentType).toBe('application/json');
    });

    it('should skip Content-Type for FormData', async () => {
      const mockResponse = { data: 'test' };
      const formData = new FormData();

      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      const client = new TuturuuuClient('ttr_test_key');
      await client.request('/test', {
        method: 'POST',
        body: formData,
        skipJsonContentType: true,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://tuturuuu.com/api/v1/test',
        expect.objectContaining({
          method: 'POST',
          body: formData,
        })
      );

      // Inspect headers from the actual call
      const callOptions = mockFetch.mock.calls[0]?.[1];
      const headers = callOptions?.headers;
      const authHeader =
        headers instanceof Headers
          ? headers.get('Authorization')
          : headers?.Authorization;
      const contentType =
        headers instanceof Headers
          ? headers.get('Content-Type')
          : headers?.['Content-Type'];
      expect(authHeader).toBe('Bearer ttr_test_key');
      // Content-Type should not be set for FormData (browser sets it with boundary)
      expect(contentType).toBeUndefined();
    });

    it('should throw error for API error response', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(
          {
            error: 'Unauthorized',
            message: 'Invalid API key',
          },
          401
        )
      );

      const client = new TuturuuuClient('ttr_test_key');
      await expect(client.request('/test')).rejects.toThrow(
        AuthenticationError
      );
    });

    it('should throw NetworkError for non-API error response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({}),
      });

      const client = new TuturuuuClient('ttr_test_key');
      await expect(client.request('/test')).rejects.toThrow(NetworkError);
    });

    it('should handle abort signal', async () => {
      const client = new TuturuuuClient({
        apiKey: 'ttr_test_key',
        timeout: 100,
      });

      // Simulate an abort error
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      mockFetch.mockRejectedValueOnce(abortError);

      try {
        await client.request('/test');
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(NetworkError);
        expect((error as NetworkError).message).toMatch(/timeout/i);
      }
    });

    it('should propagate network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network failure'));

      const client = new TuturuuuClient('ttr_test_key');
      await expect(client.request('/test')).rejects.toThrow('Network failure');
    });
  });
});

describe('StorageClient', () => {
  let client: TuturuuuClient;

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockClear();
    client = new TuturuuuClient('ttr_test_key');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('list', () => {
    it('should list files with default options', async () => {
      const mockResponse: ListStorageResponse = {
        data: [
          {
            name: 'file.txt',
            id: '1',
            created_at: '2024-01-01',
          },
        ],
        pagination: { limit: 50, offset: 0, filteredTotal: 1 },
      };

      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      const result = await client.storage.list();

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/storage/list?'),
        expect.any(Object)
      );
    });

    it('should list files with all options', async () => {
      const mockResponse: ListStorageResponse = {
        data: [],
        pagination: { limit: 10, offset: 5, filteredTotal: 0 },
      };

      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      await client.storage.list({
        path: 'documents',
        search: 'report',
        limit: 10,
        offset: 5,
        sortBy: 'created_at',
        sortOrder: 'desc',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('path=documents'),
        expect.any(Object)
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('search=report'),
        expect.any(Object)
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('limit=10'),
        expect.any(Object)
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('offset=5'),
        expect.any(Object)
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('sortBy=created_at'),
        expect.any(Object)
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('sortOrder=desc'),
        expect.any(Object)
      );
    });

    it('should reject invalid options', async () => {
      await expect(client.storage.list({ limit: 0 })).rejects.toThrow();

      await expect(client.storage.list({ limit: 1001 })).rejects.toThrow();

      await expect(client.storage.list({ offset: -1 })).rejects.toThrow();
    });
  });

  describe('upload', () => {
    it('should upload File object', async () => {
      const mockResponse: UploadResponse = {
        message: 'Uploaded',
        data: { path: 'test.txt', fullPath: 'workspace/test.txt' },
      };

      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      const file = new File(['content'], 'test.txt');
      const result = await client.storage.upload(file, { path: 'documents' });

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/storage/upload'),
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    it('should upload Blob object', async () => {
      const mockResponse: UploadResponse = {
        message: 'Uploaded',
        data: { path: 'file', fullPath: 'workspace/file' },
      };

      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      const blob = new Blob(['content']);
      const result = await client.storage.upload(blob);

      expect(result).toEqual(mockResponse);
    });

    it('should accept upsert option', async () => {
      const mockResponse: UploadResponse = {
        message: 'Uploaded',
        data: { path: 'test.txt', fullPath: 'workspace/test.txt' },
      };

      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      const file = new File(['content'], 'test.txt');
      await client.storage.upload(file, { upsert: true });

      expect(mockFetch).toHaveBeenCalled();
    });
  });

  describe('download', () => {
    it('should download file', async () => {
      const mockBlob = new Blob(['content']);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        blob: async () => mockBlob,
      });

      const result = await client.storage.download('documents/file.txt');

      expect(result).toBe(mockBlob);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/storage/download/documents/file.txt'),
        expect.any(Object)
      );
    });

    it('should throw ValidationError for empty path', async () => {
      await expect(client.storage.download('')).rejects.toThrow(
        ValidationError
      );
    });

    it('should throw error for API error response', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(
          {
            error: 'Not Found',
            message: 'File not found',
          },
          404
        )
      );

      await expect(client.storage.download('missing.txt')).rejects.toThrow(
        NotFoundError
      );
    });
  });

  describe('delete', () => {
    it('should delete files', async () => {
      const mockResponse: DeleteResponse = {
        message: 'Deleted',
        data: { deleted: 2, paths: ['file1.txt', 'file2.txt'] },
      };

      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      const result = await client.storage.delete(['file1.txt', 'file2.txt']);

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/storage/delete'),
        expect.objectContaining({
          method: 'DELETE',
        })
      );
    });

    it('should throw ValidationError for empty array', async () => {
      await expect(client.storage.delete([])).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for non-array', async () => {
      await expect(
        client.storage.delete('string' as unknown as string[])
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for too many paths', async () => {
      const paths = Array(101).fill('file.txt');
      await expect(client.storage.delete(paths)).rejects.toThrow(
        ValidationError
      );
    });
  });

  describe('createFolder', () => {
    it('should create folder', async () => {
      const mockResponse: CreateFolderResponse = {
        message: 'Created',
        data: { path: 'reports', fullPath: 'documents/reports' },
      };

      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      const result = await client.storage.createFolder('documents', 'reports');

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/storage/folders'),
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    it('should throw ValidationError for empty name', async () => {
      await expect(client.storage.createFolder('path', '')).rejects.toThrow(
        ValidationError
      );
    });
  });

  describe('share', () => {
    it('should generate signed URL with default expiry', async () => {
      const mockResponse: ShareResponse = {
        message: 'Shared',
        data: {
          signedUrl: 'https://example.com/signed',
          expiresAt: '2024-01-01',
          expiresIn: 3600,
        },
      };

      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      const result = await client.storage.share('file.txt');

      expect(result).toEqual(mockResponse);
    });

    it('should generate signed URL with custom expiry', async () => {
      const mockResponse: ShareResponse = {
        message: 'Shared',
        data: {
          signedUrl: 'https://example.com/signed',
          expiresAt: '2024-01-01',
          expiresIn: 7200,
        },
      };

      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      await client.storage.share('file.txt', { expiresIn: 7200 });

      expect(mockFetch).toHaveBeenCalled();
    });

    it('should throw ValidationError for empty path', async () => {
      await expect(client.storage.share('')).rejects.toThrow(ValidationError);
    });

    it('should reject invalid expiresIn', async () => {
      await expect(
        client.storage.share('file.txt', { expiresIn: 30 })
      ).rejects.toThrow();

      await expect(
        client.storage.share('file.txt', { expiresIn: 700000 })
      ).rejects.toThrow();
    });
  });

  describe('getAnalytics', () => {
    it('should get storage analytics', async () => {
      const mockResponse: AnalyticsResponse = {
        data: {
          totalSize: 1024000,
          fileCount: 42,
          storageLimit: 5000000,
          usagePercentage: 20.48,
          largestFile: {
            name: 'large.pdf',
            size: 500000,
            createdAt: '2024-01-01',
          },
          smallestFile: {
            name: 'small.txt',
            size: 100,
            createdAt: '2024-01-02',
          },
        },
      };

      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      const result = await client.storage.getAnalytics();

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/storage/analytics'),
        expect.any(Object)
      );
    });

    it('should handle analytics with null files', async () => {
      const mockResponse: AnalyticsResponse = {
        data: {
          totalSize: 0,
          fileCount: 0,
          storageLimit: 5000000,
          usagePercentage: 0,
          largestFile: null,
          smallestFile: null,
        },
      };

      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      const result = await client.storage.getAnalytics();

      expect(result.data.largestFile).toBeNull();
      expect(result.data.smallestFile).toBeNull();
    });
  });
});
