/**
 * Type definitions for the Tuturuuu SDK
 */
import { z } from 'zod';

/**
 * Storage object returned from list operations
 */
export interface StorageObject {
  id?: string;
  name: string;
  createdAt?: string;
  updatedAt?: string;
  lastAccessedAt?: string;
  metadata?: {
    eTag?: string;
    size?: number;
    mimetype?: string;
    cacheControl?: string;
    contentLength?: number;
    httpStatusCode?: number;
  };
}

/**
 * List options for storage listing
 */
export interface ListStorageOptions {
  path?: string;
  search?: string;
  limit?: number;
  offset?: number;
  sortBy?: 'name' | 'created_at' | 'updated_at' | 'size';
  sortOrder?: 'asc' | 'desc';
}

/**
 * Upload options for file upload
 */
export interface UploadOptions {
  path?: string;
  upsert?: boolean;
}

/**
 * Share options for signed URL generation
 */
export interface ShareOptions {
  expiresIn?: number; // In seconds
}

/**
 * Pagination metadata
 */
export interface Pagination {
  limit: number;
  offset: number;
  total: number; // Total count after filters are applied
}

/**
 * Response for list storage operation
 */
export interface ListStorageResponse {
  data: StorageObject[];
  pagination: Pagination;
}

/**
 * Path data returned by storage operations
 */
export interface PathData {
  path: string;
  fullPath: string;
}

/**
 * Generic path response for operations that return path information
 */
export interface PathResponse {
  message: string;
  data: PathData;
}

/**
 * Response for signed upload URL request
 */
export interface SignedUploadUrlResponse {
  data: {
    signedUrl: string;
    token: string;
    path: string;
  };
}

/**
 * Response for upload operation
 */
export type UploadResponse = PathResponse;

/**
 * Response for delete operation
 */
export interface DeleteResponse {
  message: string;
  data: {
    deleted: number;
    paths: string[];
  };
}

/**
 * Response for create folder operation
 */
export type CreateFolderResponse = PathResponse;

/**
 * Response for share operation
 */
export interface ShareResponse {
  message: string;
  data: {
    signedUrl: string;
    expiresAt: string;
    expiresIn: number;
  };
}

/**
 * Signed URL data for a single file
 */
export interface SignedUrlData {
  path: string;
  signedUrl: string;
  expiresAt?: string;
  expiresIn?: number;
  error?: string;
}

/**
 * Response for batch share operation
 */
export interface BatchShareResponse {
  message: string;
  data: SignedUrlData[];
  errors?: Array<{ path: string; error: string }>;
}

/**
 * Storage analytics data
 */
export interface StorageAnalytics {
  totalSize: number;
  fileCount: number;
  storageLimit: number;
  usagePercentage: number;
  largestFile: {
    name: string;
    size: number;
    createdAt: string;
  } | null;
  smallestFile: {
    name: string;
    size: number;
    createdAt: string;
  } | null;
}

/**
 * Response for analytics operation
 */
export interface AnalyticsResponse {
  data: StorageAnalytics;
}

/**
 * Document object
 */
export interface Document {
  id: string;
  name: string;
  content: string;
  isPublic: boolean;
  createdAt: string;
}

/**
 * List documents options
 */
export interface ListDocumentsOptions {
  search?: string;
  limit?: number;
  offset?: number;
  isPublic?: boolean;
}

/**
 * Create document data
 */
export interface CreateDocumentData {
  name: string;
  content?: string;
  isPublic?: boolean;
}

/**
 * Update document data
 */
export interface UpdateDocumentData {
  name?: string;
  content?: string;
  isPublic?: boolean;
}

/**
 * Response for list documents operation
 */
export interface ListDocumentsResponse {
  data: Document[];
  pagination: Pagination;
}

/**
 * Response for document operation
 */
export interface DocumentResponse {
  message: string;
  data: Document;
}

/**
 * Response for get document operation
 */
export interface GetDocumentResponse {
  data: Document;
}

/**
 * Response for delete document operation
 */
export interface DeleteDocumentResponse {
  message: string;
}

/**
 * API error response
 */
export interface ApiErrorResponse {
  error: string;
  message: string;
  code?: string;
}

/**
 * Zod schemas for validation
 */

export const listStorageOptionsSchema = z
  .object({
    path: z.string(),
    search: z.string(),
    limit: z.number().int().min(1).max(100).finite(),
    offset: z.number().int().min(0).finite(),
    sortBy: z.enum(['name', 'created_at', 'updated_at', 'size']),
    sortOrder: z.enum(['asc', 'desc']),
  })
  .partial();

export const uploadOptionsSchema = z
  .object({
    path: z.string(),
    upsert: z.boolean(),
  })
  .partial();

export const shareOptionsSchema = z
  .object({
    expiresIn: z.number().int().min(60).max(604800).finite(),
  })
  .partial();

export const listDocumentsOptionsSchema = z
  .object({
    search: z.string(),
    limit: z.number().int().min(1).max(100).finite(),
    offset: z.number().int().min(0).finite(),
    isPublic: z.boolean(),
  })
  .partial()
  .superRefine((data, ctx) => {
    if ('limit' in data && data.limit === undefined) {
      ctx.addIssue({
        code: 'invalid_type',
        expected: 'number',
        received: 'undefined',
        path: ['limit'],
        message: 'limit cannot be explicitly undefined',
      });
    }
    if ('offset' in data && data.offset === undefined) {
      ctx.addIssue({
        code: 'invalid_type',
        expected: 'number',
        received: 'undefined',
        path: ['offset'],
        message: 'offset cannot be explicitly undefined',
      });
    }
  });

export const createDocumentDataSchema = z.object({
  name: z.string().min(1).max(255),
  content: z.string().max(100000).optional(),
  isPublic: z.boolean().optional(),
});

export const updateDocumentDataSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  content: z.string().max(100000).optional(),
  isPublic: z.boolean().optional(),
});
