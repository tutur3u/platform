/**
 * Tuturuuu SDK
 *
 * Official TypeScript/JavaScript SDK for interacting with the Tuturuuu platform.
 * Provides access to storage, documents, analytics, link shortening, and A/B testing via API keys.
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
 * // Storage operations
 * const files = await tuturuuu.storage.list({ path: 'documents' });
 * const storageAnalytics = await tuturuuu.storage.getAnalytics();
 *
 * // Analytics tracking
 * await tuturuuu.analytics.track('button_click', { button_id: 'signup_cta' });
 * const summary = await tuturuuu.analytics.getAnalyticsSummary();
 *
 * // Link shortening
 * const link = await tuturuuu.links.create({ url: 'https://example.com' });
 * const linkAnalytics = await tuturuuu.links.getAnalytics(link.data.id);
 * ```
 */
export {
  AnalyticsClient,
  DocumentsClient,
  LinksClient,
  StorageClient,
  tuturuuu,
  TuturuuuClient,
} from './storage';
// Types - Storage & Documents
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
  ShareOptions,
  ShareResponse,
  SignedUploadUrlResponse,
  SignedUrlData,
  StorageAnalytics,
  StorageObject,
  UpdateDocumentData,
  UploadOptions,
  UploadResponse,
} from './types';
// Types - Analytics
export type {
  AnalyticsEvent,
  AnalyticsQueryOptions,
  AnalyticsSession,
  AnalyticsSummary,
  AnalyticsSummaryResponse,
  BatchTrackEventsOptions,
  Conversion,
  DeviceStats,
  DeviceStatsResponse,
  EventStat,
  EventsListResponse,
  GeoDataPoint,
  GeoDataResponse,
  GeoQueryOptions,
  TimeSeriesDataPoint,
  TimeSeriesQueryOptions,
  TimeSeriesResponse,
  TopEventsResponse,
  TrackConversionOptions,
  TrackConversionResponse,
  TrackEventOptions,
} from './types';
// Types - Experiments
export type {
  CreateExperimentOptions,
  CreateExperimentResponse,
  Experiment,
  ExperimentResults,
  ExperimentResultsResponse,
  ExperimentStatus,
  ExperimentType,
  ExperimentVariant,
  GetExperimentResponse,
  GetVariantResponse,
  ListExperimentsOptions,
  ListExperimentsResponse,
  UpdateExperimentOptions,
  UpdateExperimentResponse,
  VariantAssignment,
  VariantResult,
} from './types';
// Types - Links
export type {
  CityStat,
  CountryStat,
  CreateLinkExperimentOptions,
  CreateLinkOptions,
  CreateLinkResponse,
  DeleteLinkResponse,
  GetLinkResponse,
  LinkAnalytics,
  LinkAnalyticsOptions,
  LinkAnalyticsResponse,
  LinkAnalyticsSummary,
  LinkClicksByDayResponse,
  LinkExperiment,
  LinkVariant,
  ListLinksOptions,
  ListLinksResponse,
  ReferrerStat,
  ShortLink,
  TopCountriesResponse,
  TopReferrersResponse,
  UpdateLinkOptions,
  UpdateLinkResponse,
} from './types';
// Zod schemas (for external validation if needed)
export {
  analyticsQueryOptionsSchema,
  batchTrackEventsOptionsSchema,
  createDocumentDataSchema,
  createExperimentOptionsSchema,
  createLinkExperimentOptionsSchema,
  createLinkOptionsSchema,
  createSignedUploadUrlOptionsSchema,
  experimentVariantSchema,
  linkAnalyticsOptionsSchema,
  linkVariantSchema,
  listDocumentsOptionsSchema,
  listExperimentsOptionsSchema,
  listLinksOptionsSchema,
  listStorageOptionsSchema,
  shareOptionsSchema,
  trackConversionOptionsSchema,
  trackEventOptionsSchema,
  updateDocumentDataSchema,
  updateExperimentOptionsSchema,
  updateLinkOptionsSchema,
  uploadOptionsSchema,
} from './types';
