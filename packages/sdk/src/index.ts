/**
 * Tuturuuu SDK
 *
 * Official TypeScript/JavaScript SDK for interacting with the Tuturuuu platform.
 * Provides access to storage (files/folders) and documents via API keys.
 *
 * @packageDocumentation
 */

// Errors
export {
  AuthenticationError,
  AuthorizationError,
  BadRequestError,
  ConflictError,
  createErrorFromResponse,
  InternalServerError,
  isApiErrorResponse,
  NetworkError,
  NotFoundError,
  RateLimitError,
  TuturuuuError,
  ValidationError,
} from './errors';
export type { TuturuuuClientConfig } from './storage';
// Main client
/**
 * Default Tuturuuu client instance with auto-configured credentials
 *
 * Automatically loads from environment variables:
 * - TUTURUUU_API_KEY (required)
 * - TUTURUUU_BASE_URL (optional, defaults to https://tuturuuu.com/api/v1)
 *
 * @example
 * ```typescript
 * import { tuturuuu } from 'tuturuuu';
 *
 * const analytics = await tuturuuu.storage.getAnalytics();
 * const files = await tuturuuu.storage.list({ path: 'documents' });
 * ```
 */
export {
  DocumentsClient,
  StorageClient,
  tuturuuu,
  TuturuuuClient,
} from './storage';
// Types
export type {
  AnalyticsResponse,
  ApiErrorResponse,
  BatchShareResponse,
  CreateDocumentData,
  CreateFolderResponse,
  DeleteDocumentResponse,
  DeleteResponse,
  Document,
  DocumentResponse,
  GetDocumentResponse,
  ListDocumentsOptions,
  ListDocumentsResponse,
  ListStorageOptions,
  ListStorageResponse,
  Pagination,
  ShareOptions,
  ShareResponse,
  SignedUrlData,
  StorageAnalytics,
  StorageObject,
  UpdateDocumentData,
  UploadOptions,
  UploadResponse,
} from './types';
// Zod schemas (for external validation if needed)
export {
  createDocumentDataSchema,
  listDocumentsOptionsSchema,
  listStorageOptionsSchema,
  shareOptionsSchema,
  updateDocumentDataSchema,
  uploadOptionsSchema,
} from './types';
