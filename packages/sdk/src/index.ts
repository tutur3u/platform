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
export { DocumentsClient, StorageClient, TuturuuuClient } from './storage';
// Types
export type {
  AnalyticsResponse,
  ApiErrorResponse,
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
