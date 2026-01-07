import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AuthenticationError,
  NetworkError,
  NotFoundError,
  RateLimitError,
  ValidationError,
} from './errors';
import { StorageClient, TuturuuuClient } from './storage';
import type {
  AnalyticsResponse,
  CreateFolderResponse,
  DeleteResponse,
  ListStorageResponse,
  ShareResponse,
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

    it('should use default retry config', () => {
      const client = new TuturuuuClient('ttr_test_key');
      expect(client.retryConfig).toEqual({
        maxRetries: 3,
        initialDelayMs: 1000,
        maxDelayMs: 30000,
        retryOn429: true,
      });
    });

    it('should accept custom retry config', () => {
      const client = new TuturuuuClient({
        apiKey: 'ttr_test_key',
        retry: {
          maxRetries: 5,
          initialDelayMs: 500,
          maxDelayMs: 60000,
          retryOn429: false,
        },
      });
      expect(client.retryConfig).toEqual({
        maxRetries: 5,
        initialDelayMs: 500,
        maxDelayMs: 60000,
        retryOn429: false,
      });
    });

    it('should merge partial retry config with defaults', () => {
      const client = new TuturuuuClient({
        apiKey: 'ttr_test_key',
        retry: {
          maxRetries: 5,
        },
      });
      expect(client.retryConfig).toEqual({
        maxRetries: 5,
        initialDelayMs: 1000,
        maxDelayMs: 30000,
        retryOn429: true,
      });
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
      // Accept both null (Headers.get) and undefined (plain object)
      expect(contentType == null).toBe(true);
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

    it('should throw RateLimitError for 429 with JSON response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        headers: new Headers({
          'content-type': 'application/json',
          'Retry-After': '60',
          'X-RateLimit-Reset': '1699999999',
        }),
        json: async () => ({
          error: 'Too Many Requests',
          message: 'Rate limit exceeded',
        }),
      });

      const client = new TuturuuuClient('ttr_test_key');
      try {
        await client.request('/test');
        expect.fail('Should have thrown RateLimitError');
      } catch (error) {
        expect(error).toBeInstanceOf(RateLimitError);
        const rateLimitError = error as RateLimitError;
        expect(rateLimitError.retryAfter).toBe(60);
        expect(rateLimitError.resetTime).toBe(1699999999);
      }
    });

    it('should throw RateLimitError for 429 with HTML response (infrastructure rate limit)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        headers: new Headers({
          'content-type': 'text/html',
          'Retry-After': '30',
        }),
        text: async () => '<!DOCTYPE html><html>Rate limit page</html>',
      });

      const client = new TuturuuuClient('ttr_test_key');
      try {
        await client.request('/test');
        expect.fail('Should have thrown RateLimitError');
      } catch (error) {
        expect(error).toBeInstanceOf(RateLimitError);
        const rateLimitError = error as RateLimitError;
        expect(rateLimitError.message).toContain('Rate limit exceeded');
        expect(rateLimitError.retryAfter).toBe(30);
        expect(rateLimitError.code).toBe('RATE_LIMIT_EXCEEDED');
      }
    });

    it('should throw RateLimitError for 429 without Retry-After header', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        headers: new Headers({
          'content-type': 'text/html',
        }),
        text: async () => '<!DOCTYPE html><html>Rate limit page</html>',
      });

      const client = new TuturuuuClient('ttr_test_key');
      try {
        await client.request('/test');
        expect.fail('Should have thrown RateLimitError');
      } catch (error) {
        expect(error).toBeInstanceOf(RateLimitError);
        const rateLimitError = error as RateLimitError;
        expect(rateLimitError.message).toContain('try again later');
        expect(rateLimitError.retryAfter).toBeUndefined();
      }
    });
  });

  describe('requestWithRetry', () => {
    it('should retry on rate limit and succeed', async () => {
      // First call: rate limit
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        headers: new Headers({ 'content-type': 'text/html' }),
        text: async () => 'Rate limit',
      });

      // Second call: success
      const mockResponse = { data: 'success' };
      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      const client = new TuturuuuClient({
        apiKey: 'ttr_test_key',
        retry: {
          maxRetries: 3,
          initialDelayMs: 10, // Short delay for tests
          maxDelayMs: 100,
          retryOn429: true,
        },
      });

      const result = await client.requestWithRetry('/test');

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should use retryAfter header for delay', async () => {
      mockFetch.mockClear();

      // First call: rate limit with very short retry-after
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        headers: new Headers({
          'content-type': 'text/html',
          'Retry-After': '1', // 1 second for fast test
        }),
        text: async () => 'Rate limit',
      });

      // Second call: success
      const mockResponse = { data: 'success' };
      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      const client = new TuturuuuClient({
        apiKey: 'ttr_test_key',
        retry: {
          maxRetries: 1,
          initialDelayMs: 100, // Short default delay
          maxDelayMs: 2000, // Cap at 2 seconds
          retryOn429: true,
        },
      });

      const start = Date.now();
      await client.requestWithRetry('/test');
      const elapsed = Date.now() - start;

      // Should have waited approximately 1s (retryAfter value)
      expect(elapsed).toBeGreaterThanOrEqual(900);
      expect(elapsed).toBeLessThan(3000);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should exhaust retries and throw last error', async () => {
      mockFetch.mockClear();

      // All calls return 429
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: false,
          status: 429,
          statusText: 'Too Many Requests',
          headers: new Headers({ 'content-type': 'text/html' }),
          text: async () => 'Rate limit',
        })
      );

      const client = new TuturuuuClient({
        apiKey: 'ttr_test_key',
        retry: {
          maxRetries: 3,
          initialDelayMs: 1, // Very short delay for tests
          retryOn429: true,
        },
      });

      await expect(client.requestWithRetry('/test')).rejects.toThrow(
        RateLimitError
      );
      expect(mockFetch).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
    });

    it('should not retry when retryOn429 is false', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        headers: new Headers({ 'content-type': 'text/html' }),
        text: async () => 'Rate limit',
      });

      const client = new TuturuuuClient({
        apiKey: 'ttr_test_key',
        retry: {
          retryOn429: false,
        },
      });

      await expect(client.requestWithRetry('/test')).rejects.toThrow(
        RateLimitError
      );
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should not retry non-429 errors', async () => {
      mockFetch.mockClear();

      mockFetch.mockResolvedValueOnce(
        createMockResponse(
          {
            error: 'Not Found',
            message: 'Resource not found',
          },
          404
        )
      );

      const client = new TuturuuuClient({
        apiKey: 'ttr_test_key',
        retry: {
          maxRetries: 3,
          retryOn429: true,
        },
      });

      await expect(client.requestWithRetry('/test')).rejects.toThrow(
        NotFoundError
      );
      expect(mockFetch).toHaveBeenCalledTimes(1);
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
      const mockApiResponse = {
        data: [
          {
            name: 'file.txt',
            id: '1',
            created_at: '2024-01-01',
          },
        ],
        pagination: { limit: 50, offset: 0, total: 1 },
      };

      const expectedResponse: ListStorageResponse = {
        data: [
          {
            name: 'file.txt',
            id: '1',
            createdAt: '2024-01-01',
          },
        ],
        pagination: { limit: 50, offset: 0, total: 1 },
      };

      mockFetch.mockResolvedValueOnce(createMockResponse(mockApiResponse));

      const result = await client.storage.list();

      expect(result).toEqual(expectedResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/storage/list?'),
        expect.any(Object)
      );
    });

    it('should list files with all options', async () => {
      const mockResponse: ListStorageResponse = {
        data: [],
        pagination: { limit: 10, offset: 5, total: 0 },
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
    it('should upload File object using signed URL', async () => {
      const wsId = '00000000-0000-0000-0000-000000000000';
      const mockSignedUrlResponse = {
        data: {
          signedUrl: 'https://storage.example.com/signed-url',
          token: 'upload-token',
          path: `${wsId}/documents/test.txt`,
        },
      };

      const mockUploadResponse = {
        ok: true,
        status: 200,
      };

      // Step 1: Mock signed URL request
      mockFetch.mockResolvedValueOnce(
        createMockResponse(mockSignedUrlResponse)
      );

      // Step 2: Mock direct upload to Supabase
      mockFetch.mockResolvedValueOnce(mockUploadResponse);

      const file = new File(['content'], 'test.txt', { type: 'text/plain' });
      const result = await client.storage.upload(file, { path: 'documents' });

      // Verify signed URL was requested
      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('/storage/upload-url'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('test.txt'),
        })
      );

      // Verify direct upload to Supabase
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        'https://storage.example.com/signed-url',
        expect.objectContaining({
          method: 'PUT',
          body: file,
        })
      );

      // Verify the path returned strips the "[wsId]/" prefix
      expect(result.data.path).toBe('documents/test.txt');
      expect(result.data.fullPath).toBe(`${wsId}/documents/test.txt`);
    });

    it('should use workspaces/[wsId]/ path format to match Drive page', async () => {
      const wsId = '00000000-0000-0000-0000-000000000000';
      const mockSignedUrlResponse = {
        data: {
          signedUrl: 'https://storage.example.com/signed-url',
          token: 'upload-token',
          path: `${wsId}/task-images/photo.png`,
        },
      };

      mockFetch.mockResolvedValueOnce(
        createMockResponse(mockSignedUrlResponse)
      );
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      const file = new File(['content'], 'photo.png', { type: 'image/png' });
      await client.storage.upload(file, { path: 'task-images' });

      // Verify the signed URL request includes correct path
      const signedUrlCall = mockFetch.mock.calls[0];
      const requestBody = JSON.parse(signedUrlCall?.[1]?.body as string);
      expect(requestBody.filename).toBe('photo.png');
      expect(requestBody.path).toBe('task-images');
    });

    it('should upload Blob object with generated filename', async () => {
      const wsId = '00000000-0000-0000-0000-000000000000';
      const mockSignedUrlResponse = {
        data: {
          signedUrl: 'https://storage.example.com/signed-url',
          token: 'upload-token',
          path: `${wsId}/file-${Date.now()}.bin`,
        },
      };

      mockFetch.mockResolvedValueOnce(
        createMockResponse(mockSignedUrlResponse)
      );
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      const blob = new Blob(['content']);
      const result = await client.storage.upload(blob);

      expect(result.data.fullPath).toMatch(/^[0-9a-f-]+\//); // Should start with workspaces/UUID/
      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('/storage/upload-url'),
        expect.any(Object)
      );
    });

    it('should accept upsert option', async () => {
      const wsId = '00000000-0000-0000-0000-000000000000';
      const mockSignedUrlResponse = {
        data: {
          signedUrl: 'https://storage.example.com/signed-url',
          token: 'upload-token',
          path: `${wsId}/test.txt`,
        },
      };

      mockFetch.mockResolvedValueOnce(
        createMockResponse(mockSignedUrlResponse)
      );
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      const file = new File(['content'], 'test.txt');
      await client.storage.upload(file, { upsert: true });

      // Verify upsert option is sent in signed URL request
      const signedUrlCall = mockFetch.mock.calls[0];
      const requestBody = JSON.parse(signedUrlCall?.[1]?.body as string);
      expect(requestBody.upsert).toBe(true);

      // Verify upsert header is sent in upload request
      const uploadCall = mockFetch.mock.calls[1];
      const headers = uploadCall?.[1]?.headers;
      const upsertHeader =
        headers instanceof Headers
          ? headers.get('x-upsert')
          : headers?.['x-upsert'];
      expect(upsertHeader).toBe('true');
    });

    it('should handle upload failure with proper error', async () => {
      const mockSignedUrlResponse = {
        data: {
          signedUrl: 'https://storage.example.com/signed-url',
          token: 'upload-token',
          path: '00000000-0000-0000-0000-000000000000/test.txt',
        },
      };

      mockFetch.mockResolvedValueOnce(
        createMockResponse(mockSignedUrlResponse)
      );

      // Mock failed upload
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: async () => 'Invalid file',
      });

      const file = new File(['content'], 'test.txt');

      const uploadPromise = client.storage.upload(file);
      await expect(uploadPromise).rejects.toThrow(NetworkError);
      await expect(uploadPromise).rejects.toThrow(
        'Upload failed: 400 Bad Request'
      );
    });
  });

  describe('createSignedUploadUrl', () => {
    it('should create signed upload URL with minimal options', async () => {
      const mockResponse = {
        data: {
          signedUrl: 'https://storage.example.com/signed-url',
          token: 'upload-token',
          path: '00000000-0000-0000-0000-000000000000/document.pdf',
        },
      };

      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      const result = await client.storage.createSignedUploadUrl({
        filename: 'document.pdf',
      });

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/storage/upload-url'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('document.pdf'),
        })
      );
    });

    it('should create signed upload URL with all options', async () => {
      const mockResponse = {
        data: {
          signedUrl: 'https://storage.example.com/signed-url',
          token: 'upload-token',
          path: '00000000-0000-0000-0000-000000000000/documents/report.pdf',
        },
      };

      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      const result = await client.storage.createSignedUploadUrl({
        filename: 'report.pdf',
        path: 'documents',
        upsert: true,
      });

      expect(result).toEqual(mockResponse);

      // Verify request body includes all options
      const callArgs = mockFetch.mock.calls[0];
      const requestBody = JSON.parse(callArgs?.[1]?.body as string);
      expect(requestBody.filename).toBe('report.pdf');
      expect(requestBody.path).toBe('documents');
      expect(requestBody.upsert).toBe(true);
    });

    it('should throw ValidationError for empty filename', async () => {
      await expect(
        client.storage.createSignedUploadUrl({ filename: '' })
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for filename over 255 chars', async () => {
      const longFilename = `${'a'.repeat(256)}.txt`;
      await expect(
        client.storage.createSignedUploadUrl({ filename: longFilename })
      ).rejects.toThrow(ValidationError);
    });

    it('should allow filename exactly 255 chars', async () => {
      const mockResponse = {
        data: {
          signedUrl: 'https://storage.example.com/signed-url',
          token: 'upload-token',
          path: '00000000-0000-0000-0000-000000000000/longfile.txt',
        },
      };

      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      const filename = `${'a'.repeat(251)}.txt`; // exactly 255 chars
      const result = await client.storage.createSignedUploadUrl({ filename });

      expect(result).toEqual(mockResponse);
    });

    it('should default path to empty string when not provided', async () => {
      const mockResponse = {
        data: {
          signedUrl: 'https://storage.example.com/signed-url',
          token: 'upload-token',
          path: '00000000-0000-0000-0000-000000000000/file.txt',
        },
      };

      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      await client.storage.createSignedUploadUrl({ filename: 'file.txt' });

      const callArgs = mockFetch.mock.calls[0];
      const requestBody = JSON.parse(callArgs?.[1]?.body as string);
      expect(requestBody.path).toBe('');
    });

    it('should default upsert to false when not provided', async () => {
      const mockResponse = {
        data: {
          signedUrl: 'https://storage.example.com/signed-url',
          token: 'upload-token',
          path: '00000000-0000-0000-0000-000000000000/file.txt',
        },
      };

      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      await client.storage.createSignedUploadUrl({ filename: 'file.txt' });

      const callArgs = mockFetch.mock.calls[0];
      const requestBody = JSON.parse(callArgs?.[1]?.body as string);
      expect(requestBody.upsert).toBe(false);
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
