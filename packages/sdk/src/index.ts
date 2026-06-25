/**
 * Tuturuuu SDK
 *
 * Official TypeScript/JavaScript SDK for interacting with the Tuturuuu platform.
 * Provides access to storage (files/folders) and documents via API keys.
 *
 * @packageDocumentation
 */

export type { EpmClientConfig } from './epm';
export {
  buildEpmNavigationItems,
  EpmClient,
  getEpmCollectionNavigationConfig,
  getEpmCollectionNavigationTitle,
  isYoolaExternalProjectLoadingData,
} from './epm';
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
export type { ExternalProjectsClientConfig } from './external-projects';
export { ExternalProjectsClient } from './external-projects';
export type { ExternalProjectPublicAssetUpload } from './external-projects-public-assets';
export {
  getExternalProjectPublicAssetFilename,
  getExternalProjectPublicAssetPublicPath,
  getExternalProjectPublicAssetStoragePath,
  getExternalProjectPublicAssetUploads,
  linkExternalProjectPublicFolderAssets,
} from './external-projects-public-assets';
export type { TuturuuuUserClientConfig } from './platform';
export { TasksClient, TuturuuuUserClient, WorkspacesClient } from './platform';
export type {
  CalendarAccount,
  CalendarAccountDisconnectResponse,
  CalendarAccountsResponse,
  CalendarAuthUrlResponse,
  CalendarCategoriesReorderPayload,
  CalendarCategoriesResponse,
  CalendarCategory,
  CalendarCategoryPayload,
  CalendarConnectionPayload,
  CalendarConnectionResponse,
  CalendarConnectionsResponse,
  CalendarConnectionUpdatePayload,
  CalendarDefaultSourceResponse,
  CalendarResetResponse,
  CalendarScheduleStatusResponse,
  CalendarSourceInput,
  CalendarSourceOption,
  ProviderCalendar,
  ProviderCalendarsResponse,
  SchedulableTasksResponse,
  ScheduleApplyRequestPayload,
  SchedulePreviewRequestPayload,
  WorkspaceCalendarEventCreatePayload,
  WorkspaceCalendarEventsQuery,
  WorkspaceCalendarEventsResponse,
  WorkspaceCalendarEventUpdatePayload,
  WorkspaceCalendarPayload,
  WorkspaceCalendarsResponse,
  WorkspaceCalendarUpdatePayload,
} from './platform-calendar';
export { CalendarClient } from './platform-calendar';
export type {
  FinanceBudgetUpsertPayload,
  FinanceTagPayload,
  ListTransactionsQuery,
  RecurringTransactionPayload,
  TransactionCategoryPayload,
  TransactionExportQuery,
  TransactionPayload,
  WalletCheckpoint,
  WalletCheckpointBatchPayload,
  WalletCheckpointCurrencyTotal,
  WalletCheckpointInterval,
  WalletCheckpointListResponse,
  WalletCheckpointPayload,
  WalletCheckpointSummaryResponse,
  WalletCheckpointSummaryWallet,
  WalletPayload,
} from './platform-finance';
export { FinanceClient } from './platform-finance';
export type {
  FinancePaginatedResponse,
  FinancePaginationSummary,
} from './platform-finance-pagination';
export {
  getEpmDeliveryQueryKey,
  getEpmDeliveryQueryOptions,
  getEpmLoadingDataQueryKey,
  getEpmLoadingDataQueryOptions,
  getYoolaLoadingDataQueryKey,
  getYoolaLoadingDataQueryOptions,
} from './query';
export type { RetryConfig, TuturuuuClientConfig } from './storage';
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
  TuturuuuClient,
  tuturuuu,
} from './storage';
// Types
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
  DownloadOptions,
  EpmAssetMetadata,
  EpmAssetPayload,
  EpmAssetUpdatePayload,
  EpmAssetUploadOptions,
  EpmBlockPayload,
  EpmBlockUpdatePayload,
  EpmCollectionConfig,
  EpmCollectionNavigationConfig,
  EpmCollectionPayload,
  EpmCollectionUpdatePayload,
  EpmEntryListOptions,
  EpmEntryPayload,
  EpmEntryUpdatePayload,
  EpmPublishEventKind,
  ExternalProjectAdapterKind,
  ExternalProjectAttentionItem,
  ExternalProjectBulkUpdateAction,
  ExternalProjectBulkUpdatePayload,
  ExternalProjectCollection,
  ExternalProjectDeliveryAsset,
  ExternalProjectDeliveryCollection,
  ExternalProjectDeliveryEntry,
  ExternalProjectDeliveryOptions,
  ExternalProjectDeliveryPayload,
  ExternalProjectEntry,
  ExternalProjectEntryBatchAction,
  ExternalProjectEntryBatchOperation,
  ExternalProjectEntryBatchOperationResult,
  ExternalProjectEntryBatchPayload,
  ExternalProjectEntryBatchResult,
  ExternalProjectEntryStatus,
  ExternalProjectLoadingData,
  ExternalProjectStudioData,
  ExternalProjectSummary,
  ExternalProjectSummaryCollection,
  ExternalProjectSummaryCounts,
  ExternalProjectSummaryQueues,
  ExternalProjectSyncAction,
  ExternalProjectSyncApplyResult,
  ExternalProjectSyncAsset,
  ExternalProjectSyncBlock,
  ExternalProjectSyncCollectionSchema,
  ExternalProjectSyncContent,
  ExternalProjectSyncDiff,
  ExternalProjectSyncEntity,
  ExternalProjectSyncEntry,
  ExternalProjectSyncEntryStatus,
  ExternalProjectSyncField,
  ExternalProjectSyncFieldType,
  ExternalProjectSyncManifest,
  ExternalProjectSyncOperation,
  ExternalProjectSyncSchema,
  ExternalProjectSyncSnapshot,
  GetDocumentResponse,
  ImageResizeMode,
  ImageTransformOptions,
  ListDocumentsOptions,
  ListDocumentsResponse,
  ListStorageOptions,
  ListStorageResponse,
  Pagination,
  ShareOptions,
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
} from './types';
// Zod schemas (for external validation if needed)
export {
  createDocumentDataSchema,
  createSignedUploadUrlOptionsSchema,
  downloadOptionsSchema,
  externalProjectDeliveryOptionsSchema,
  imageTransformOptionsSchema,
  listDocumentsOptionsSchema,
  listStorageOptionsSchema,
  shareOptionsSchema,
  updateDocumentDataSchema,
  uploadOptionsSchema,
} from './types';
