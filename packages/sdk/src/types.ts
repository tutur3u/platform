/**
 * Type definitions for the Tuturuuu SDK
 */

import type { ShareOptions as BaseShareOptions } from '@tuturuuu/types';
import {
  shareOptionsSchema as baseShareOptionsSchema,
  createDocumentDataSchema,
  createSignedUploadUrlOptionsSchema,
  listDocumentsOptionsSchema,
  listStorageOptionsSchema,
  updateDocumentDataSchema,
  uploadOptionsSchema,
} from '@tuturuuu/types';
import { z } from 'zod';

export type {
  AnalyticsResponse,
  ApiErrorResponse,
  BatchShareResponse,
  CreateDocumentData,
  CreateFolderResponse,
  CreateSignedUploadUrlOptions,
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
  PathData,
  PathResponse,
  ShareResponse,
  SignedUploadUrlResponse,
  SignedUrlData,
  StorageAnalytics,
  StorageObject,
  UpdateDocumentData,
  UploadOptions,
  UploadResponse,
} from '@tuturuuu/types';

export type ImageResizeMode = 'cover' | 'contain' | 'fill';

export interface ImageTransformOptions {
  width?: number;
  height?: number;
  resize?: ImageResizeMode;
  quality?: number;
  format?: 'origin';
}

export interface ShareOptions extends BaseShareOptions {
  transform?: ImageTransformOptions;
}

export interface DownloadOptions {
  transform?: ImageTransformOptions;
}

export {
  createDocumentDataSchema,
  createSignedUploadUrlOptionsSchema,
  listDocumentsOptionsSchema,
  listStorageOptionsSchema,
  updateDocumentDataSchema,
  uploadOptionsSchema,
};

export const imageTransformOptionsSchema = z
  .object({
    width: z.number().int().min(1).max(2500).finite().optional(),
    height: z.number().int().min(1).max(2500).finite().optional(),
    resize: z.enum(['cover', 'contain', 'fill']).optional(),
    quality: z.number().int().min(20).max(100).finite().optional(),
    format: z.literal('origin').optional(),
  })
  .refine((data) => data.width !== undefined || data.height !== undefined, {
    message: 'transform must include width or height',
  });

export const shareOptionsSchema = baseShareOptionsSchema.extend({
  transform: imageTransformOptionsSchema.optional(),
});

export const downloadOptionsSchema = z
  .object({
    transform: imageTransformOptionsSchema,
  })
  .partial();
