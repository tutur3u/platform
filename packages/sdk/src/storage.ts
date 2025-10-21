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
 *   content: { text: 'Hello World' }
 * });
 * ```
 */

import {
  createErrorFromResponse,
  isApiErrorResponse,
  NetworkError,
  ValidationError,
} from './errors';
import type {
  AnalyticsResponse,
  CreateDocumentData,
  CreateFolderResponse,
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
  UpdateDocumentData,
  UploadOptions,
  UploadResponse,
} from './types';
import {
  createDocumentDataSchema,
  listDocumentsOptionsSchema,
  listStorageOptionsSchema,
  shareOptionsSchema,
  updateDocumentDataSchema,
  uploadOptionsSchema,
} from './types';

/**
 * Configuration options for the Tuturuuu client
 */
export interface TuturuuuClientConfig {
  apiKey: string;
  baseUrl?: string;
  timeout?: number;
  fetch?: typeof fetch;
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
    const validatedOptions = listStorageOptionsSchema.parse(options);

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

    return this.client.request<ListStorageResponse>(
      `/storage/list?${params.toString()}`
    );
  }

  /**
   * Uploads a file to the workspace drive
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
    const validatedOptions = uploadOptionsSchema.parse(options);

    const formData = new FormData();

    // Append file with proper filename for File objects
    if (file instanceof File) {
      formData.append('file', file);
    } else {
      // For Blob, provide a default filename
      formData.append('file', file, 'file');
    }

    if (validatedOptions.path) {
      formData.append('path', validatedOptions.path);
    }
    if (validatedOptions.upsert !== undefined) {
      formData.append('upsert', validatedOptions.upsert.toString());
    }

    return this.client.request<UploadResponse>('/storage/upload', {
      method: 'POST',
      body: formData,
      // Don't set Content-Type header - let browser set it with boundary
      skipJsonContentType: true,
    });
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

    const response = await this.client.fetch(
      `${this.client.baseUrl}/storage/download/${path}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.client.apiKey}`,
        },
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      if (isApiErrorResponse(errorData)) {
        throw createErrorFromResponse(errorData, response.status);
      }
      throw new NetworkError(`HTTP ${response.status}: ${response.statusText}`);
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
    const validatedOptions = shareOptionsSchema.parse(options);

    return this.client.request<ShareResponse>('/storage/share', {
      method: 'POST',
      body: JSON.stringify({
        path,
        expiresIn: validatedOptions.expiresIn,
      }),
    });
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
    return this.client.request<AnalyticsResponse>('/storage/analytics');
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
    const validatedOptions = listDocumentsOptionsSchema.parse(options);

    const params = new URLSearchParams();
    if (validatedOptions.search) params.set('search', validatedOptions.search);
    if (validatedOptions.limit !== undefined)
      params.set('limit', validatedOptions.limit.toString());
    if (validatedOptions.offset !== undefined)
      params.set('offset', validatedOptions.offset.toString());
    if (validatedOptions.isPublic !== undefined)
      params.set('isPublic', validatedOptions.isPublic.toString());

    return this.client.request<ListDocumentsResponse>(
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
   *   content: { text: 'Discussion points...' },
   *   isPublic: false
   * });
   * ```
   */
  async create(data: CreateDocumentData): Promise<DocumentResponse> {
    // Validate data
    const validatedData = createDocumentDataSchema.parse(data);

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

    return this.client.request<GetDocumentResponse>(`/documents/${id}`);
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
   *   content: { text: 'New content...' }
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
    const validatedData = updateDocumentDataSchema.parse(data);

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
 * Main Tuturuuu SDK client
 */
export class TuturuuuClient {
  public readonly apiKey: string;
  public readonly baseUrl: string;
  public readonly timeout: number;
  public readonly fetch: typeof fetch;

  public readonly storage: StorageClient;
  public readonly documents: DocumentsClient;

  /**
   * Creates a new Tuturuuu client instance
   *
   * @param config - Client configuration
   *
   * @example
   * ```typescript
   * const client = new TuturuuuClient({
   *   apiKey: 'ttr_your_api_key',
   *   baseUrl: 'https://api.tuturuuu.com', // optional
   *   timeout: 30000 // optional, default 30s
   * });
   * ```
   */
  constructor(config: string | TuturuuuClientConfig) {
    // Support both string API key and config object
    if (typeof config === 'string') {
      this.apiKey = config;
      this.baseUrl = 'https://tuturuuu.com/api/v1';
      this.timeout = 30000;
      this.fetch = globalThis.fetch;
    } else {
      this.apiKey = config.apiKey;
      this.baseUrl = config.baseUrl || 'https://tuturuuu.com/api/v1';
      this.timeout = config.timeout || 30000;
      this.fetch = config.fetch || globalThis.fetch;
    }

    // Validate API key
    if (!this.apiKey || !this.apiKey.startsWith('ttr_')) {
      throw new ValidationError(
        'Invalid API key format. Expected key to start with "ttr_"'
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
    };

    // Only set Content-Type for JSON bodies
    if (!skipJsonContentType && typeof body === 'string') {
      headers['Content-Type'] = 'application/json';
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await this.fetch(`${this.baseUrl}${endpoint}`, {
        method,
        headers,
        body,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json();
        if (isApiErrorResponse(errorData)) {
          throw createErrorFromResponse(errorData, response.status);
        }
        throw new NetworkError(
          `HTTP ${response.status}: ${response.statusText}`
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
}
