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
 * Options for creating a signed upload URL
 */
export interface CreateSignedUploadUrlOptions {
  filename: string;
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

export const createSignedUploadUrlOptionsSchema = z.object({
  filename: z.string().min(1).max(255),
  path: z.string().optional(),
  upsert: z.boolean().optional(),
});

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

/**
 * ====================================================
 * ANALYTICS TYPES
 * ====================================================
 */

/**
 * Analytics session data with comprehensive device and location info
 */
export interface AnalyticsSession {
  id: string;
  wsId: string;
  visitorId: string;
  ipAddress?: string;
  country?: string;
  countryRegion?: string;
  city?: string;
  postalCode?: string;
  latitude?: number;
  longitude?: number;
  timezone?: string;
  isp?: string;
  connectionType?: string;
  deviceType?: string;
  deviceBrand?: string;
  deviceModel?: string;
  browser?: string;
  browserVersion?: string;
  os?: string;
  osVersion?: string;
  screenWidth?: number;
  screenHeight?: number;
  language?: string;
  userAgent?: string;
  startedAt: string;
  lastActiveAt: string;
  sessionDuration: number; // in seconds
  createdAt: string;
}

/**
 * Analytics event data
 */
export interface AnalyticsEvent {
  id: string;
  wsId: string;
  sessionId: string;
  eventName: string;
  eventProperties?: Record<string, unknown>;
  pageUrl?: string;
  pageTitle?: string;
  pagePath?: string;
  referrer?: string;
  referrerDomain?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
  timestamp: string;
  createdAt: string;
}

/**
 * Options for tracking an analytics event
 */
export interface TrackEventOptions {
  eventName: string;
  properties?: Record<string, unknown>;
  pageUrl?: string;
  pageTitle?: string;
  referrer?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
}

/**
 * Options for batch tracking multiple events
 */
export interface BatchTrackEventsOptions {
  events: TrackEventOptions[];
}

/**
 * Options for querying analytics data
 */
export interface AnalyticsQueryOptions {
  startDate?: string; // ISO string
  endDate?: string; // ISO string
  eventName?: string;
  pagePath?: string;
  referrerDomain?: string;
  country?: string;
  deviceType?: string;
  browser?: string;
  os?: string;
  limit?: number;
  offset?: number;
}

/**
 * Analytics summary data
 */
export interface AnalyticsSummary {
  totalEvents: number;
  totalSessions: number;
  uniqueVisitors: number;
  totalConversions: number;
  conversionRate: number; // percentage
  avgSessionDuration: number; // seconds
  topEvent: {
    eventName?: string;
    count: number;
  };
  topCountry: {
    country?: string;
    count: number;
  };
  topDevice: {
    deviceType?: string;
    count: number;
  };
}

/**
 * Time series data point
 */
export interface TimeSeriesDataPoint {
  date: string;
  count: number;
  uniqueVisitors?: number;
  sessions?: number;
}

/**
 * Options for time series queries
 */
export interface TimeSeriesQueryOptions {
  startDate?: string;
  endDate?: string;
  granularity?: 'hour' | 'day' | 'week' | 'month';
  eventName?: string;
}

/**
 * Geographic data point
 */
export interface GeoDataPoint {
  country?: string;
  countryRegion?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  sessionCount: number;
  uniqueVisitors: number;
}

/**
 * Options for geographic queries
 */
export interface GeoQueryOptions {
  startDate?: string;
  endDate?: string;
  limit?: number;
}

/**
 * Device statistics
 */
export interface DeviceStats {
  deviceTypes: Array<{ deviceType?: string; count: number; percentage: number }>;
  browsers: Array<{ browser?: string; count: number; percentage: number }>;
  operatingSystems: Array<{ os?: string; count: number; percentage: number }>;
}

/**
 * Event statistics
 */
export interface EventStat {
  eventName: string;
  count: number;
  uniqueSessions: number;
  percentage: number;
}

/**
 * Response for analytics summary query
 */
export interface AnalyticsSummaryResponse {
  data: AnalyticsSummary;
}

/**
 * Response for time series query
 */
export interface TimeSeriesResponse {
  data: TimeSeriesDataPoint[];
}

/**
 * Response for geographic data query
 */
export interface GeoDataResponse {
  data: GeoDataPoint[];
}

/**
 * Response for device stats query
 */
export interface DeviceStatsResponse {
  data: DeviceStats;
}

/**
 * Response for events list query
 */
export interface EventsListResponse {
  data: AnalyticsEvent[];
  pagination: Pagination;
}

/**
 * Response for top events query
 */
export interface TopEventsResponse {
  data: EventStat[];
}

/**
 * ====================================================
 * EXPERIMENTS (A/B TESTING) TYPES
 * ====================================================
 */

/**
 * Experiment variant configuration
 */
export interface ExperimentVariant {
  id: string;
  name: string;
  weight: number; // 0.0 to 1.0, must sum to 1.0 across all variants
  config?: Record<string, unknown>; // Custom configuration for this variant
}

/**
 * Experiment status
 */
export type ExperimentStatus = 'draft' | 'running' | 'paused' | 'completed' | 'archived';

/**
 * Experiment type
 */
export type ExperimentType = 'url_redirect' | 'feature_flag' | 'content_variant';

/**
 * Experiment configuration
 */
export interface Experiment {
  id: string;
  wsId: string;
  name: string;
  description?: string;
  experimentKey: string; // Unique key for SDK identification
  experimentType: ExperimentType;
  status: ExperimentStatus;
  trafficAllocation: number; // 0.0 to 1.0
  variants: ExperimentVariant[];
  targetMetric?: string; // Event name to track as conversion
  startedAt?: string;
  endedAt?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Options for creating an experiment
 */
export interface CreateExperimentOptions {
  name: string;
  description?: string;
  experimentKey: string;
  experimentType: ExperimentType;
  trafficAllocation?: number; // Default 1.0
  variants: ExperimentVariant[];
  targetMetric?: string;
}

/**
 * Options for updating an experiment
 */
export interface UpdateExperimentOptions {
  name?: string;
  description?: string;
  experimentType?: ExperimentType;
  trafficAllocation?: number;
  variants?: ExperimentVariant[];
  targetMetric?: string;
  status?: ExperimentStatus;
}

/**
 * Options for listing experiments
 */
export interface ListExperimentsOptions {
  status?: ExperimentStatus;
  experimentType?: ExperimentType;
  limit?: number;
  offset?: number;
}

/**
 * Variant assignment result
 */
export interface VariantAssignment {
  experimentId: string;
  experimentKey: string;
  variantId: string;
  variantConfig?: Record<string, unknown>;
}

/**
 * Experiment variant results
 */
export interface VariantResult {
  variantId: string;
  variantName: string;
  impressions: number;
  conversions: number;
  conversionRate: number; // percentage
  totalValue: number;
  avgValue: number;
}

/**
 * Complete experiment results
 */
export interface ExperimentResults {
  experiment: Experiment;
  variants: VariantResult[];
  winningVariant?: string; // Variant ID with highest conversion rate
  statisticalSignificance?: number; // p-value
  recommendedAction?: 'continue' | 'conclude_winner' | 'inconclusive';
}

/**
 * Response for create experiment
 */
export interface CreateExperimentResponse {
  message: string;
  data: Experiment;
}

/**
 * Response for get experiment
 */
export interface GetExperimentResponse {
  data: Experiment;
}

/**
 * Response for list experiments
 */
export interface ListExperimentsResponse {
  data: Experiment[];
  pagination: Pagination;
}

/**
 * Response for update experiment
 */
export interface UpdateExperimentResponse {
  message: string;
  data: Experiment;
}

/**
 * Response for get variant assignment
 */
export interface GetVariantResponse {
  data: VariantAssignment;
}

/**
 * Response for experiment results
 */
export interface ExperimentResultsResponse {
  data: ExperimentResults;
}

/**
 * ====================================================
 * LINKS & LINK ANALYTICS TYPES
 * ====================================================
 */

/**
 * Shortened link data
 */
export interface ShortLink {
  id: string;
  wsId: string;
  slug: string;
  originalUrl: string;
  domain?: string;
  title?: string;
  description?: string;
  expiresAt?: string;
  isActive: boolean;
  creatorId: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Options for creating a short link
 */
export interface CreateLinkOptions {
  url: string;
  slug?: string; // Custom slug, auto-generated if not provided
  domain?: string;
  title?: string;
  description?: string;
  expiresAt?: string;
}

/**
 * Options for updating a link
 */
export interface UpdateLinkOptions {
  originalUrl?: string;
  slug?: string;
  domain?: string;
  title?: string;
  description?: string;
  expiresAt?: string;
  isActive?: boolean;
}

/**
 * Options for listing links
 */
export interface ListLinksOptions {
  search?: string;
  isActive?: boolean;
  domain?: string;
  limit?: number;
  offset?: number;
  sortBy?: 'created_at' | 'slug' | 'clicks';
  sortOrder?: 'asc' | 'desc';
}

/**
 * Link analytics summary data
 */
export interface LinkAnalyticsSummary {
  linkId: string;
  slug: string;
  originalUrl: string;
  totalClicks: number;
  uniqueVisitors: number;
  uniqueReferrers: number;
  uniqueCountries: number;
  uniqueCities: number;
  uniqueDeviceTypes: number;
  uniqueBrowsers: number;
  uniqueOperatingSystems: number;
  firstClickAt?: string;
  lastClickAt?: string;
  topReferrerDomain?: string;
  topCountry?: string;
  topCity?: string;
  topDeviceType?: string;
  topBrowser?: string;
  topOs?: string;
  topVercelRegion?: string;
}

/**
 * Link referrer statistics
 */
export interface ReferrerStat {
  referrerDomain?: string;
  count: number;
  percentage: number;
}

/**
 * Link country statistics
 */
export interface CountryStat {
  country?: string;
  count: number;
  percentage: number;
}

/**
 * Link city statistics
 */
export interface CityStat {
  city?: string;
  country?: string;
  count: number;
  percentage: number;
}

/**
 * Complete link analytics data
 */
export interface LinkAnalytics {
  link: ShortLink;
  summary: LinkAnalyticsSummary;
  clicksByDay: TimeSeriesDataPoint[];
  topReferrers: ReferrerStat[];
  topCountries: CountryStat[];
  topCities: CityStat[];
  deviceBreakdown: DeviceStats;
}

/**
 * Options for link analytics queries
 */
export interface LinkAnalyticsOptions {
  startDate?: string;
  endDate?: string;
  limit?: number;
}

/**
 * Link variant for A/B testing
 */
export interface LinkVariant {
  id: string;
  name: string;
  destinationUrl: string;
  weight: number; // 0.0 to 1.0
}

/**
 * Link experiment configuration
 */
export interface LinkExperiment {
  id: string;
  linkId: string;
  experimentId: string;
  variants: LinkVariant[];
  status: ExperimentStatus;
  createdAt: string;
}

/**
 * Options for creating a link experiment
 */
export interface CreateLinkExperimentOptions {
  linkId: string;
  name: string;
  description?: string;
  variants: LinkVariant[];
  targetMetric?: string;
}

/**
 * Response for create link
 */
export interface CreateLinkResponse {
  message: string;
  data: ShortLink;
}

/**
 * Response for get link
 */
export interface GetLinkResponse {
  data: ShortLink;
}

/**
 * Response for list links
 */
export interface ListLinksResponse {
  data: ShortLink[];
  pagination: Pagination;
}

/**
 * Response for update link
 */
export interface UpdateLinkResponse {
  message: string;
  data: ShortLink;
}

/**
 * Response for delete link
 */
export interface DeleteLinkResponse {
  message: string;
}

/**
 * Response for link analytics
 */
export interface LinkAnalyticsResponse {
  data: LinkAnalytics;
}

/**
 * Response for link clicks by day
 */
export interface LinkClicksByDayResponse {
  data: TimeSeriesDataPoint[];
}

/**
 * Response for top referrers
 */
export interface TopReferrersResponse {
  data: ReferrerStat[];
}

/**
 * Response for top countries
 */
export interface TopCountriesResponse {
  data: CountryStat[];
}

/**
 * ====================================================
 * CONVERSION TRACKING TYPES
 * ====================================================
 */

/**
 * Conversion data
 */
export interface Conversion {
  id: string;
  wsId: string;
  sessionId: string;
  eventId?: string;
  experimentId?: string;
  variantId?: string;
  conversionType: string;
  conversionValue?: number;
  conversionProperties?: Record<string, unknown>;
  convertedAt: string;
  createdAt: string;
}

/**
 * Options for tracking a conversion
 */
export interface TrackConversionOptions {
  conversionType: string;
  value?: number;
  properties?: Record<string, unknown>;
}

/**
 * Response for track conversion
 */
export interface TrackConversionResponse {
  message: string;
  data: {
    conversionId: string;
  };
}

/**
 * ====================================================
 * ZOD SCHEMAS FOR VALIDATION
 * ====================================================
 */

export const trackEventOptionsSchema = z.object({
  eventName: z.string().min(1).max(255),
  properties: z.record(z.unknown()).optional(),
  pageUrl: z.string().url().optional(),
  pageTitle: z.string().max(500).optional(),
  referrer: z.string().url().optional(),
  utmSource: z.string().max(255).optional(),
  utmMedium: z.string().max(255).optional(),
  utmCampaign: z.string().max(255).optional(),
  utmTerm: z.string().max(255).optional(),
  utmContent: z.string().max(255).optional(),
});

export const batchTrackEventsOptionsSchema = z.object({
  events: z.array(trackEventOptionsSchema).min(1).max(100),
});

export const analyticsQueryOptionsSchema = z
  .object({
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
    eventName: z.string().max(255).optional(),
    pagePath: z.string().max(500).optional(),
    referrerDomain: z.string().max(255).optional(),
    country: z.string().max(255).optional(),
    deviceType: z.string().max(255).optional(),
    browser: z.string().max(255).optional(),
    os: z.string().max(255).optional(),
    limit: z.number().int().min(1).max(1000).optional(),
    offset: z.number().int().min(0).optional(),
  })
  .partial();

export const experimentVariantSchema = z.object({
  id: z.string().min(1).max(255),
  name: z.string().min(1).max(255),
  weight: z.number().min(0).max(1),
  config: z.record(z.unknown()).optional(),
});

export const createExperimentOptionsSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  experimentKey: z.string().min(1).max(255),
  experimentType: z.enum(['url_redirect', 'feature_flag', 'content_variant']),
  trafficAllocation: z.number().min(0).max(1).default(1.0),
  variants: z.array(experimentVariantSchema).min(2),
  targetMetric: z.string().max(255).optional(),
});

export const updateExperimentOptionsSchema = z
  .object({
    name: z.string().min(1).max(255).optional(),
    description: z.string().max(1000).optional(),
    experimentType: z
      .enum(['url_redirect', 'feature_flag', 'content_variant'])
      .optional(),
    trafficAllocation: z.number().min(0).max(1).optional(),
    variants: z.array(experimentVariantSchema).min(2).optional(),
    targetMetric: z.string().max(255).optional(),
    status: z
      .enum(['draft', 'running', 'paused', 'completed', 'archived'])
      .optional(),
  })
  .partial();

export const listExperimentsOptionsSchema = z
  .object({
    status: z
      .enum(['draft', 'running', 'paused', 'completed', 'archived'])
      .optional(),
    experimentType: z
      .enum(['url_redirect', 'feature_flag', 'content_variant'])
      .optional(),
    limit: z.number().int().min(1).max(100).optional(),
    offset: z.number().int().min(0).optional(),
  })
  .partial();

export const createLinkOptionsSchema = z.object({
  url: z.string().url(),
  slug: z.string().min(1).max(255).optional(),
  domain: z.string().max(255).optional(),
  title: z.string().max(255).optional(),
  description: z.string().max(1000).optional(),
  expiresAt: z.string().datetime().optional(),
});

export const updateLinkOptionsSchema = z
  .object({
    originalUrl: z.string().url().optional(),
    slug: z.string().min(1).max(255).optional(),
    domain: z.string().max(255).optional(),
    title: z.string().max(255).optional(),
    description: z.string().max(1000).optional(),
    expiresAt: z.string().datetime().optional(),
    isActive: z.boolean().optional(),
  })
  .partial();

export const listLinksOptionsSchema = z
  .object({
    search: z.string().max(255).optional(),
    isActive: z.boolean().optional(),
    domain: z.string().max(255).optional(),
    limit: z.number().int().min(1).max(100).optional(),
    offset: z.number().int().min(0).optional(),
    sortBy: z.enum(['created_at', 'slug', 'clicks']).optional(),
    sortOrder: z.enum(['asc', 'desc']).optional(),
  })
  .partial();

export const linkAnalyticsOptionsSchema = z
  .object({
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
    limit: z.number().int().min(1).max(100).optional(),
  })
  .partial();

export const linkVariantSchema = z.object({
  id: z.string().min(1).max(255),
  name: z.string().min(1).max(255),
  destinationUrl: z.string().url(),
  weight: z.number().min(0).max(1),
});

export const createLinkExperimentOptionsSchema = z.object({
  linkId: z.string().uuid(),
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  variants: z.array(linkVariantSchema).min(2),
  targetMetric: z.string().max(255).optional(),
});

export const trackConversionOptionsSchema = z.object({
  conversionType: z.string().min(1).max(255),
  value: z.number().min(0).optional(),
  properties: z.record(z.unknown()).optional(),
});
