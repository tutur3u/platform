/**
 * Type definitions for the Tuturuuu SDK
 */

import type {
  ShareOptions as BaseShareOptions,
  ExternalProjectEntryStatus,
  Json,
} from '@tuturuuu/types';
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
  ExternalProjectAdapterKind,
  ExternalProjectAttentionItem,
  ExternalProjectBulkUpdateAction,
  ExternalProjectBulkUpdatePayload,
  ExternalProjectCollection,
  ExternalProjectDeliveryAsset,
  ExternalProjectDeliveryCollection,
  ExternalProjectDeliveryEntry,
  ExternalProjectDeliveryPayload,
  ExternalProjectEntry,
  ExternalProjectEntryStatus,
  ExternalProjectLoadingData,
  ExternalProjectStudioData,
  ExternalProjectSummary,
  ExternalProjectSummaryCollection,
  ExternalProjectSummaryCounts,
  ExternalProjectSummaryQueues,
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
  WorkspaceExternalProjectBinding,
  YoolaExternalProjectArtworkLoadingItem,
  YoolaExternalProjectLoadingData,
  YoolaExternalProjectLoreCapsuleLoadingItem,
  YoolaExternalProjectSectionLoadingItem,
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

export interface EpmCollectionPayload {
  collection_type: string;
  config: EpmCollectionConfig;
  description?: string | null;
  slug: string;
  title: string;
}

export interface EpmCollectionNavigationConfig {
  href?: string | null;
  title?: string | null;
  visible?: boolean | null;
  [key: string]: Json | undefined;
}

export interface EpmCollectionConfig {
  navigation?: EpmCollectionNavigationConfig | null;
  [key: string]: Json | undefined;
}

export interface EpmEntryPayload {
  collection_id: string;
  metadata: Json;
  profile_data: Json;
  scheduled_for?: string | null;
  slug: string;
  status: ExternalProjectEntryStatus;
  subtitle?: string | null;
  summary?: string | null;
  title: string;
}

export interface EpmBlockPayload {
  block_type: string;
  content: Json;
  entry_id: string;
  sort_order?: number;
  title?: string | null;
}

export interface EpmAssetPayload {
  alt_text?: string | null;
  asset_type: string;
  block_id?: string | null;
  entry_id?: string | null;
  metadata: EpmAssetMetadata;
  sort_order?: number;
  source_url?: string | null;
  storage_path?: string | null;
}

export interface EpmAssetMetadata {
  caption?: string | null;
  [key: string]: Json | undefined;
}

export interface EpmEntryListOptions {
  collectionId?: string;
}

export interface EpmAssetUploadOptions {
  collectionType: string;
  entrySlug: string;
  upsert?: boolean;
}

export type EpmPublishEventKind = 'publish' | 'preview' | 'unpublish';

export type EpmEntryUpdatePayload = Partial<EpmEntryPayload>;
export type EpmCollectionUpdatePayload = Partial<EpmCollectionPayload> & {
  is_enabled?: boolean;
};
export type EpmBlockUpdatePayload = Partial<EpmBlockPayload>;
export type EpmAssetUpdatePayload = Partial<EpmAssetPayload>;

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

export const externalProjectDeliveryOptionsSchema = z.object({
  preview: z.boolean().optional(),
});

export type ExternalProjectDeliveryOptions = z.infer<
  typeof externalProjectDeliveryOptionsSchema
>;
