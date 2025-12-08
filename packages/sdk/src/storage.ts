/**
 * Tuturuuu Storage SDK
 *
 * Official SDK for interacting with Tuturuuu workspace resources
 * including storage (files/folders) and documents.
 *
 * @example
 * ```typescript
 * import { TuturuuuClient } from 'tuturuuu';
 *
 * const client = new TuturuuuClient('ttr_your_api_key');
 *
 * // List files
 * const files = await client.storage.list({ path: 'documents' });
 *
 * // Upload a file
 * const file = new File(['content'], 'example.txt');
 * await client.storage.upload(file, { path: 'documents' });
 *
 * // Create a document
 * const doc = await client.documents.create({
 *   name: 'My Document',
 *   content: 'Hello World'
 * });
 * ```
 */

import type { ZodSchema } from 'zod';
import packageJson from '../package.json';
import {
  createErrorFromResponse,
  isApiErrorResponse,
  NetworkError,
  RateLimitError,
  ValidationError,
} from './errors';
import type {
  AnalyticsResponse,
  BatchShareResponse,
  CreateDocumentData,
  CreateFolderResponse,
  CreateSignedUploadUrlOptions,
  DeleteDocumentResponse,
  DeleteResponse,
  DocumentResponse,
  GetDocumentResponse,
  ListDocumentsOptions,
  ListDocumentsResponse,
  ListStorageOptions,
  ListStorageResponse,
  ShareOptions,
  ShareResponse,
  SignedUploadUrlResponse,
  StorageObject,
  UpdateDocumentData,
  UploadOptions,
  UploadResponse,
} from './types';
import {
  createDocumentDataSchema,
  createSignedUploadUrlOptionsSchema,
  listDocumentsOptionsSchema,
  listStorageOptionsSchema,
  shareOptionsSchema,
  updateDocumentDataSchema,
  uploadOptionsSchema,
} from './types';

/**
 * Transform snake_case API response to camelCase SDK format
 */
function transformStorageObject(apiObject: any): StorageObject {
  return {
    id: apiObject.id,
    name: apiObject.name,
    createdAt: apiObject.created_at,
    updatedAt: apiObject.updated_at,
    lastAccessedAt: apiObject.last_accessed_at,
    metadata: apiObject.metadata,
  };
}

/**
 * Helper function to validate data with Zod schema and convert errors to ValidationError
 */
function validateWithSchema<T>(schema: ZodSchema<T>, data: unknown): T {
  try {
    return schema.parse(data);
  } catch (error) {
    // Check if it's a Zod error by presence of errors array
    if (
      error &&
      typeof error === 'object' &&
      'issues' in error &&
      Array.isArray((error as any).issues)
    ) {
      const zodError = error as any;
      const message = zodError.issues
        .map((e: any) => {
          const path =
            e.path && e.path.length > 0 ? `${e.path.join('.')}: ` : '';
          return `${path}${e.message}`;
        })
        .join(', ');
      throw new ValidationError(message);
    }
    throw error;
  }
}

/**
 * Retry configuration for rate limit handling
 */
export interface RetryConfig {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Initial delay in milliseconds before first retry (default: 1000) */
  initialDelayMs?: number;
  /** Maximum delay in milliseconds between retries (default: 30000) */
  maxDelayMs?: number;
  /** Whether to automatically retry on 429 rate limit errors (default: true) */
  retryOn429?: boolean;
}

/**
 * Configuration options for the Tuturuuu client
 */
export interface TuturuuuClientConfig {
  apiKey?: string;
  baseUrl?: string;
  timeout?: number;
  fetch?: typeof fetch;
  /** Retry configuration for handling rate limits */
  retry?: RetryConfig;
}

/**
 * Storage operations client
 */
export class StorageClient {
  constructor(private client: TuturuuuClient) {}

  /**
   * Lists files and folders in the workspace drive
   *
   * @param options - Options for listing files
   * @returns List of storage objects with pagination
   *
   * @example
   * ```typescript
   * const files = await client.storage.list({
   *   path: 'documents',
   *   search: 'report',
   *   limit: 50,
   *   sortBy: 'created_at',
   *   sortOrder: 'desc'
   * });
   * ```
   */
  async list(options: ListStorageOptions = {}): Promise<ListStorageResponse> {
    // Validate options
    const validatedOptions = validateWithSchema(
      listStorageOptionsSchema,
      options
    );

    const params = new URLSearchParams();
    if (validatedOptions.path) params.set('path', validatedOptions.path);
    if (validatedOptions.search) params.set('search', validatedOptions.search);
    if (validatedOptions.limit !== undefined)
      params.set('limit', validatedOptions.limit.toString());
    if (validatedOptions.offset !== undefined)
      params.set('offset', validatedOptions.offset.toString());
    if (validatedOptions.sortBy) params.set('sortBy', validatedOptions.sortBy);
    if (validatedOptions.sortOrder)
      params.set('sortOrder', validatedOptions.sortOrder);

    const response = await this.client.requestWithRetry<any>(
      `/storage/list?${params.toString()}`
    );

    // Transform snake_case API response to camelCase SDK format
    return {
      data: response.data.map(transformStorageObject),
      pagination: response.pagination,
    };
  }

  /**
   * Uploads a file to the workspace drive using signed upload URLs
   *
   * This method first requests a signed upload URL from the platform,
   * then uploads the file directly to Supabase Storage. This approach
   * is more efficient and secure than proxying files through the API.
   *
   * @param file - File to upload (File or Blob)
   * @param options - Upload options
   * @returns Upload result with path information
   *
   * @example
   * ```typescript
   * const file = new File(['content'], 'document.pdf');
   * const result = await client.storage.upload(file, {
   *   path: 'documents',
   *   upsert: true
   * });
   *
   * // For Buffer in Node.js, convert to Blob first:
   * const buffer = Buffer.from('content');
   * const blob = new Blob([buffer]);
   * await client.storage.upload(blob, { path: 'documents' });
   * ```
   */
  async upload(
    file: File | Blob,
    options: UploadOptions = {}
  ): Promise<UploadResponse> {
    // Validate options
    const validatedOptions = validateWithSchema(uploadOptionsSchema, options);

    // Extract filename from File or use default for Blob
    const filename =
      file instanceof File ? file.name : `file-${Date.now()}.bin`;

    // Step 1: Request a signed upload URL from the platform (with retry for rate limits)
    const signedUrlResponse = await this.client.requestWithRetry<
      import('./types').SignedUploadUrlResponse
    >('/storage/upload-url', {
      method: 'POST',
      body: JSON.stringify({
        filename,
        path: validatedOptions.path || '',
        upsert: validatedOptions.upsert ?? false,
      }),
    });

    const { signedUrl, path } = signedUrlResponse.data;

    // Step 2: Upload the file directly to Supabase using the signed URL
    try {
      const uploadResponse = await this.client.fetch(signedUrl, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type':
            file instanceof File ? file.type : 'application/octet-stream',
          'x-upsert': validatedOptions.upsert ? 'true' : 'false',
        },
      });

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        throw new NetworkError(
          `Upload failed: ${uploadResponse.status} ${uploadResponse.statusText} - ${errorText}`
        );
      }

      // Return success response in the expected format
      // Remove "[wsId]/" prefix to get relative path
      // Path format from API: [wsId]/[relativePath]
      const relativePath = path.replace(/^[^/]+\//, '');

      return {
        message: 'File uploaded successfully',
        data: {
          path: relativePath,
          fullPath: path,
        },
      };
    } catch (error) {
      if (error instanceof NetworkError) {
        throw error;
      }
      throw new NetworkError(
        `Failed to upload file: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Creates a signed upload URL for direct file uploads to storage
   *
   * This method returns a signed URL that external applications can use to
   * upload files directly to Tuturuuu storage without proxying through your server.
   * Useful for client-side uploads, progress tracking, and custom upload flows.
   *
   * @param options - Options for creating the signed URL
   * @returns Signed upload URL with metadata
   *
   * @example
   * ```typescript
   * // Get a signed URL for uploading a file
   * const result = await client.storage.createSignedUploadUrl({
   *   filename: 'document.pdf',
   *   path: 'documents',
   *   upsert: true
   * });
   *
   * // Use the signed URL to upload directly from the client
   * const file = new File(['content'], 'document.pdf');
   * await fetch(result.data.signedUrl, {
   *   method: 'PUT',
   *   body: file,
   *   headers: {
   *     'Content-Type': file.type,
   *     'x-upsert': 'true'
   *   }
   * });
   * ```
   */
  async createSignedUploadUrl(
    options: CreateSignedUploadUrlOptions
  ): Promise<SignedUploadUrlResponse> {
    // Validate options
    const validatedOptions = validateWithSchema(
      createSignedUploadUrlOptionsSchema,
      options
    );

    return this.client.requestWithRetry<SignedUploadUrlResponse>(
      '/storage/upload-url',
      {
        method: 'POST',
        body: JSON.stringify({
          filename: validatedOptions.filename,
          path: validatedOptions.path || '',
          upsert: validatedOptions.upsert ?? false,
        }),
      }
    );
  }

  /**
   * Downloads a file from the workspace drive
   *
   * @param path - Path to the file
   * @returns File blob
   *
   * @example
   * ```typescript
   * const blob = await client.storage.download('documents/report.pdf');
   * ```
   */
  async download(path: string): Promise<Blob> {
    if (!path) {
      throw new ValidationError('Path is required');
    }

    // Properly encode path to handle spaces and special characters
    // Normalize backslashes to forward slashes
    const normalizedPath = path.replace(/\\/g, '/');

    // Split path into segments, encode each segment, and rejoin
    const segments = normalizedPath.split('/').filter((s) => s.length > 0);
    const encodedPath = segments.map((s) => encodeURIComponent(s)).join('/');

    // Ensure baseUrl doesn't end with slash to avoid double slashes
    const baseUrl = this.client.baseUrl.replace(/\/$/, '');

    const response = await this.client.fetch(
      `${baseUrl}/storage/download/${encodedPath}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.client.apiKey}`,
          'X-SDK-Client': `tuturuuu/${packageJson.version || '0.0.1'}`,
          Accept: 'application/octet-stream, */*',
        },
      }
    );

    if (!response.ok) {
      // Check if response is JSON before attempting to parse
      const contentType = response.headers.get('content-type');
      const isJson = contentType?.toLowerCase().includes('application/json');

      if (isJson) {
        try {
          const errorData = await response.json();
          if (isApiErrorResponse(errorData)) {
            throw createErrorFromResponse(errorData, response.status);
          }
          throw new NetworkError(
            `HTTP ${response.status}: ${response.statusText}`
          );
        } catch (error) {
          // If JSON parsing fails, fall back to text
          if (error instanceof SyntaxError) {
            const text = await response.text();
            throw new NetworkError(
              `HTTP ${response.status}: ${response.statusText} - ${text.substring(0, 200)}`
            );
          }
          throw error;
        }
      } else {
        // Non-JSON response
        const text = await response.text();
        throw new NetworkError(
          `HTTP ${response.status}: ${response.statusText} - ${text.substring(0, 200)}`
        );
      }
    }

    return response.blob();
  }

  /**
   * Deletes files or folders from the workspace drive
   *
   * @param paths - Array of paths to delete
   * @returns Delete result
   *
   * @example
   * ```typescript
   * const result = await client.storage.delete([
   *   'documents/old-report.pdf',
   *   'images/screenshot.png'
   * ]);
   * ```
   */
  async delete(paths: string[]): Promise<DeleteResponse> {
    if (!Array.isArray(paths) || paths.length === 0) {
      throw new ValidationError('At least one path is required');
    }

    if (paths.length > 100) {
      throw new ValidationError('Maximum 100 paths can be deleted at once');
    }

    return this.client.request<DeleteResponse>('/storage/delete', {
      method: 'DELETE',
      body: JSON.stringify({ paths }),
    });
  }

  /**
   * Creates a new folder in the workspace drive
   *
   * @param path - Parent path
   * @param name - Folder name
   * @returns Create folder result
   *
   * @example
   * ```typescript
   * const result = await client.storage.createFolder('documents', 'reports');
   * ```
   */
  async createFolder(
    path: string,
    name: string
  ): Promise<CreateFolderResponse> {
    if (!name) {
      throw new ValidationError('Folder name is required');
    }

    return this.client.request<CreateFolderResponse>('/storage/folders', {
      method: 'POST',
      body: JSON.stringify({ path, name }),
    });
  }

  /**
   * Generates a signed URL for sharing a file
   *
   * @param path - Path to the file
   * @param options - Share options
   * @returns Signed URL with expiration
   *
   * @example
   * ```typescript
   * const result = await client.storage.share('documents/report.pdf', {
   *   expiresIn: 3600 // 1 hour
   * });
   * console.log(result.data.signedUrl);
   * ```
   */
  async share(
    path: string,
    options: ShareOptions = {}
  ): Promise<ShareResponse> {
    if (!path) {
      throw new ValidationError('Path is required');
    }

    // Validate options
    const validatedOptions = validateWithSchema(shareOptionsSchema, options);

    return this.client.requestWithRetry<ShareResponse>('/storage/share', {
      method: 'POST',
      body: JSON.stringify({
        path,
        expiresIn: validatedOptions.expiresIn,
      }),
    });
  }

  /**
   * Generates signed URLs for multiple files at once (batch operation)
   *
   * @param paths - Array of file paths (max 100)
   * @param expiresIn - Expiration time in seconds (default 3600)
   * @returns Array of signed URL data with path, signedUrl, and optional error
   *
   * @example
   * ```typescript
   * const result = await client.storage.createSignedUrls(
   *   ['folder/avatar1.png', 'folder/avatar2.png'],
   *   3600
   * );
   *
   * // Access successful URLs
   * result.data.forEach(item => {
   *   if (!item.error) {
   *     console.log(`${item.path}: ${item.signedUrl}`);
   *   } else {
   *     console.error(`${item.path} failed: ${item.error}`);
   *   }
   * });
   * ```
   */
  async createSignedUrls(
    paths: string[],
    expiresIn = 3600
  ): Promise<BatchShareResponse> {
    if (!Array.isArray(paths) || paths.length === 0) {
      throw new ValidationError(
        'Paths array is required and must not be empty'
      );
    }

    if (paths.length > 100) {
      throw new ValidationError('Maximum 100 paths can be processed at once');
    }

    return this.client.requestWithRetry<BatchShareResponse>(
      '/storage/share-batch',
      {
        method: 'POST',
        body: JSON.stringify({ paths, expiresIn }),
      }
    );
  }

  /**
   * Retrieves storage analytics for the workspace
   *
   * @returns Storage usage statistics
   *
   * @example
   * ```typescript
   * const analytics = await client.storage.getAnalytics();
   * console.log(`Used: ${analytics.data.totalSize} bytes`);
   * console.log(`Files: ${analytics.data.fileCount}`);
   * ```
   */
  async getAnalytics(): Promise<AnalyticsResponse> {
    return this.client.requestWithRetry<AnalyticsResponse>(
      '/storage/analytics'
    );
  }
}

/**
 * Documents operations client
 */
export class DocumentsClient {
  constructor(private client: TuturuuuClient) {}

  /**
   * Lists documents in the workspace
   *
   * @param options - Options for listing documents
   * @returns List of documents with pagination
   *
   * @example
   * ```typescript
   * const docs = await client.documents.list({
   *   search: 'meeting',
   *   limit: 20,
   *   isPublic: false
   * });
   * ```
   */
  async list(
    options: ListDocumentsOptions = {}
  ): Promise<ListDocumentsResponse> {
    // Validate options
    const validatedOptions = validateWithSchema(
      listDocumentsOptionsSchema,
      options
    );

    const params = new URLSearchParams();
    if (validatedOptions.search) params.set('search', validatedOptions.search);
    if (validatedOptions.limit !== undefined)
      params.set('limit', validatedOptions.limit.toString());
    if (validatedOptions.offset !== undefined)
      params.set('offset', validatedOptions.offset.toString());
    if (validatedOptions.isPublic !== undefined)
      params.set('isPublic', validatedOptions.isPublic.toString());

    return this.client.requestWithRetry<ListDocumentsResponse>(
      `/documents?${params.toString()}`
    );
  }

  /**
   * Creates a new document
   *
   * @param data - Document data
   * @returns Created document
   *
   * @example
   * ```typescript
   * const doc = await client.documents.create({
   *   name: 'Meeting Notes',
   *   content: 'Discussion points...',
   *   isPublic: false
   * });
   * ```
   */
  async create(data: CreateDocumentData): Promise<DocumentResponse> {
    // Validate data
    const validatedData = validateWithSchema(createDocumentDataSchema, data);

    return this.client.request<DocumentResponse>('/documents', {
      method: 'POST',
      body: JSON.stringify(validatedData),
    });
  }

  /**
   * Gets a document by ID
   *
   * @param id - Document ID
   * @returns Document data
   *
   * @example
   * ```typescript
   * const doc = await client.documents.get('doc-id-123');
   * ```
   */
  async get(id: string): Promise<GetDocumentResponse> {
    if (!id) {
      throw new ValidationError('Document ID is required');
    }

    return this.client.requestWithRetry<GetDocumentResponse>(
      `/documents/${id}`
    );
  }

  /**
   * Updates a document
   *
   * @param id - Document ID
   * @param data - Update data
   * @returns Updated document
   *
   * @example
   * ```typescript
   * const doc = await client.documents.update('doc-id-123', {
   *   name: 'Updated Meeting Notes',
   *   content: 'New content...'
   * });
   * ```
   */
  async update(
    id: string,
    data: UpdateDocumentData
  ): Promise<DocumentResponse> {
    if (!id) {
      throw new ValidationError('Document ID is required');
    }

    // Validate data
    const validatedData = validateWithSchema(updateDocumentDataSchema, data);

    return this.client.request<DocumentResponse>(`/documents/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(validatedData),
    });
  }

  /**
   * Deletes a document
   *
   * @param id - Document ID
   * @returns Delete confirmation
   *
   * @example
   * ```typescript
   * await client.documents.delete('doc-id-123');
   * ```
   */
  async delete(id: string): Promise<DeleteDocumentResponse> {
    if (!id) {
      throw new ValidationError('Document ID is required');
    }

    return this.client.request<DeleteDocumentResponse>(`/documents/${id}`, {
      method: 'DELETE',
    });
  }

  /**
   * Searches documents by name
   * Alias for list() with search parameter
   *
   * @param query - Search query
   * @param options - Additional list options
   * @returns List of matching documents
   */
  async search(
    query: string,
    options: Omit<ListDocumentsOptions, 'search'> = {}
  ): Promise<ListDocumentsResponse> {
    return this.list({ ...options, search: query });
  }
}

/**
 * Default retry configuration
 */
const DEFAULT_RETRY_CONFIG: Required<RetryConfig> = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  retryOn429: true,
};

/**
 * Main Tuturuuu SDK client
 */
export class TuturuuuClient {
  public readonly apiKey: string;
  public readonly baseUrl: string;
  public readonly timeout: number;
  public readonly fetch: typeof fetch;
  public readonly retryConfig: Required<RetryConfig>;

  public readonly storage: StorageClient;
  public readonly documents: DocumentsClient;

  /**
   * Creates a new Tuturuuu client instance
   *
   * @param config - Client configuration (optional, will auto-load from environment variables)
   *
   * @example
   * ```typescript
   * // Explicit configuration
   * const client = new TuturuuuClient({
   *   apiKey: 'ttr_your_api_key',
   *   baseUrl: 'https://tuturuuu.com/api/v1', // optional, this is the default
   *   timeout: 30000 // optional, default 30s
   * });
   *
   * // Auto-load from environment variables (TUTURUUU_API_KEY, TUTURUUU_BASE_URL)
   * const client = new TuturuuuClient();
   * ```
   */
  constructor(config?: string | TuturuuuClientConfig) {
    // Support both string API key and config object
    if (typeof config === 'string') {
      this.apiKey = config;
      this.baseUrl = 'https://tuturuuu.com/api/v1';
      this.timeout = 30000;
      this.fetch = globalThis.fetch;
      this.retryConfig = { ...DEFAULT_RETRY_CONFIG };
    } else if (config) {
      this.apiKey = config.apiKey || process.env.TUTURUUU_API_KEY || '';
      this.baseUrl =
        config.baseUrl ||
        process.env.TUTURUUU_BASE_URL ||
        'https://tuturuuu.com/api/v1';
      this.timeout = config.timeout || 30000;
      this.fetch = config.fetch || globalThis.fetch;
      this.retryConfig = { ...DEFAULT_RETRY_CONFIG, ...config.retry };
    } else {
      // Auto-load from environment variables
      this.apiKey = process.env.TUTURUUU_API_KEY || '';
      this.baseUrl =
        process.env.TUTURUUU_BASE_URL || 'https://tuturuuu.com/api/v1';
      this.timeout = 30000;
      this.fetch = globalThis.fetch;
      this.retryConfig = { ...DEFAULT_RETRY_CONFIG };
    }

    // Validate API key
    if (!this.apiKey || !this.apiKey.startsWith('ttr_')) {
      throw new ValidationError(
        'Invalid API key format. Expected key to start with "ttr_" or set TUTURUUU_API_KEY environment variable'
      );
    }

    // Initialize sub-clients
    this.storage = new StorageClient(this);
    this.documents = new DocumentsClient(this);
  }

  /**
   * Internal method to make HTTP requests
   * @internal
   */
  async request<T>(
    endpoint: string,
    options: {
      method?: string;
      body?: string | FormData;
      skipJsonContentType?: boolean;
    } = {}
  ): Promise<T> {
    const { method = 'GET', body, skipJsonContentType = false } = options;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      'X-SDK-Client': `tuturuuu/${packageJson.version || '0.0.1'}`,
      Accept: 'application/json',
    };

    // Only set Content-Type for JSON bodies
    // For FormData, we must NOT set Content-Type - let fetch set it automatically with the boundary
    if (!skipJsonContentType && typeof body === 'string') {
      headers['Content-Type'] = 'application/json';
    }

    // IMPORTANT: When using FormData, we must not pass Content-Type header at all
    // The fetch implementation will automatically set it with the correct multipart boundary
    // If we pass any Content-Type (even undefined), it can interfere with boundary generation
    const isFormData = body instanceof FormData;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await this.fetch(`${this.baseUrl}${endpoint}`, {
        method,
        // For FormData, omit headers that might interfere with automatic Content-Type setting
        headers: isFormData
          ? ({
              Authorization: headers.Authorization,
              'X-SDK-Client': headers['X-SDK-Client'],
              Accept: headers.Accept,
              // Do NOT include Content-Type - let fetch set it automatically
            } as HeadersInit)
          : headers,
        body,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        // Extract rate limit headers for 429 responses
        const retryAfter = response.headers.get('Retry-After');
        const resetTime = response.headers.get('X-RateLimit-Reset');

        // Handle 429 rate limit errors specially - they may come from infrastructure
        // (e.g., Vercel) with HTML content, not JSON
        if (response.status === 429) {
          const message = retryAfter
            ? `Rate limit exceeded. Retry after ${retryAfter} seconds.`
            : 'Rate limit exceeded. Please try again later.';

          throw new RateLimitError(message, {
            code: 'RATE_LIMIT_EXCEEDED',
            retryAfter: retryAfter ? parseInt(retryAfter, 10) : undefined,
            resetTime: resetTime ? parseInt(resetTime, 10) : undefined,
          });
        }

        // Check if response is JSON before attempting to parse
        const contentType = response.headers.get('content-type');
        const isJson = contentType?.toLowerCase().includes('application/json');

        if (isJson) {
          try {
            const errorData = await response.json();
            if (isApiErrorResponse(errorData)) {
              throw createErrorFromResponse(errorData, response.status, {
                retryAfter,
                resetTime,
              });
            }
            throw new NetworkError(
              `HTTP ${response.status}: ${response.statusText}`
            );
          } catch (error) {
            // If JSON parsing fails, fall back to text
            if (error instanceof SyntaxError) {
              const text = await response.text();
              throw new NetworkError(
                `HTTP ${response.status}: ${response.statusText} - ${text.substring(0, 200)}`
              );
            }
            throw error;
          }
        } else {
          // Non-JSON response
          const text = await response.text();
          throw new NetworkError(
            `HTTP ${response.status}: ${response.statusText} - ${text.substring(0, 200)}`
          );
        }
      }

      // Check if success response is JSON before parsing
      const contentType = response.headers.get('content-type');
      const isJson = contentType?.toLowerCase().includes('application/json');

      if (!isJson) {
        const text = await response.text();
        throw new NetworkError(
          `Expected JSON response but received ${contentType || 'unknown content type'} - ${text.substring(0, 200)}`
        );
      }

      return response.json();
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new NetworkError(`Request timeout after ${this.timeout}ms`);
      }
      throw error;
    }
  }

  /**
   * Internal method to make HTTP requests with automatic retry on rate limit errors
   * @internal
   */
  async requestWithRetry<T>(
    endpoint: string,
    options: {
      method?: string;
      body?: string | FormData;
      skipJsonContentType?: boolean;
    } = {}
  ): Promise<T> {
    const { maxRetries, initialDelayMs, maxDelayMs, retryOn429 } =
      this.retryConfig;

    if (!retryOn429) {
      return this.request<T>(endpoint, options);
    }

    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.request<T>(endpoint, options);
      } catch (error) {
        if (error instanceof RateLimitError && attempt < maxRetries) {
          // Calculate delay: use retryAfter if available, otherwise exponential backoff
          const baseDelay = error.retryAfter
            ? error.retryAfter * 1000
            : initialDelayMs * 2 ** attempt;
          const delay = Math.min(baseDelay, maxDelayMs);

          await this.sleep(delay);
          lastError = error;
          continue;
        }
        throw error;
      }
    }

    // This should never be reached, but TypeScript needs it
    throw lastError ?? new Error('Unexpected retry loop exit');
  }

  /**
   * Sleep helper for retry delays
   * @internal
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Default singleton instance of TuturuuuClient with auto-configured credentials
 *
 * This instance automatically loads credentials from environment variables:
 * - TUTURUUU_API_KEY (required)
 * - TUTURUUU_BASE_URL (optional, defaults to https://tuturuuu.com/api/v1)
 *
 * Uses lazy initialization to avoid validation errors during module imports.
 * The client is only instantiated when first accessed.
 *
 * @example
 * ```typescript
 * import { tuturuuu } from 'tuturuuu';
 *
 * // Use storage operations
 * const analytics = await tuturuuu.storage.getAnalytics();
 * const files = await tuturuuu.storage.list({ path: 'documents' });
 *
 * // Use document operations
 * const docs = await tuturuuu.documents.list();
 * ```
 */
let _tuturuuuInstance: TuturuuuClient | undefined;

export const tuturuuu: TuturuuuClient = new Proxy({} as TuturuuuClient, {
  get(_targett, prop) {
    if (!_tuturuuuInstance) {
      _tuturuuuInstance = new TuturuuuClient();
    }
    return _tuturuuuInstance[prop as keyof TuturuuuClient];
  },
});
