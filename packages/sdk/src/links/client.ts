/**
 * Links Client for Tuturuuu SDK
 * Provides link shortening, analytics, and A/B testing capabilities
 */

import type { ZodSchema } from 'zod';
import { ValidationError } from '../errors';
import type {
  CreateLinkOptions,
  CreateLinkResponse,
  GetLinkResponse,
  ListLinksOptions,
  ListLinksResponse,
  UpdateLinkOptions,
  UpdateLinkResponse,
  DeleteLinkResponse,
  LinkAnalyticsResponse,
  LinkAnalyticsOptions,
  LinkClicksByDayResponse,
  TopReferrersResponse,
  TopCountriesResponse,
  DeviceStatsResponse,
  CreateLinkExperimentOptions,
  CreateExperimentResponse,
  ExperimentResultsResponse,
} from '@tuturuuu/types/sdk';
import {
  createLinkOptionsSchema,
  updateLinkOptionsSchema,
  listLinksOptionsSchema,
  linkAnalyticsOptionsSchema,
  createLinkExperimentOptionsSchema,
} from '@tuturuuu/types/sdk';

/**
 * Helper function to validate data with Zod schema
 */
function validateWithSchema<T>(schema: ZodSchema<T>, data: unknown): T {
  try {
    return schema.parse(data);
  } catch (error) {
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
 * Links Client for managing shortened links and their analytics
 */
export class LinksClient {
  constructor(private client: any) {}

  // ===================================================
  // LINK MANAGEMENT
  // ===================================================

  /**
   * Create a shortened link
   *
   * @param options - Link creation options
   * @returns Created link
   *
   * @example
   * ```typescript
   * const link = await client.links.create({
   *   url: 'https://example.com/very-long-url',
   *   slug: 'my-link', // Optional custom slug
   *   title: 'Example Link',
   *   domain: 'tuturuuu.com' // Optional custom domain
   * });
   *
   * console.log('Short URL:', `https://${link.data.domain}/${link.data.slug}`);
   * ```
   */
  async create(options: CreateLinkOptions): Promise<CreateLinkResponse> {
    const validatedOptions = validateWithSchema(
      createLinkOptionsSchema,
      options
    );

    const payload = {
      url: validatedOptions.url,
      slug: validatedOptions.slug,
      domain: validatedOptions.domain,
      title: validatedOptions.title,
      description: validatedOptions.description,
      expires_at: validatedOptions.expiresAt,
    };

    return await this.client.request<CreateLinkResponse>('/links', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  /**
   * Get link details by ID
   *
   * @param linkId - Link ID
   * @returns Link details
   *
   * @example
   * ```typescript
   * const link = await client.links.get('link_123');
   * console.log('Original URL:', link.data.originalUrl);
   * ```
   */
  async get(linkId: string): Promise<GetLinkResponse> {
    return await this.client.request<GetLinkResponse>(`/links/${linkId}`);
  }

  /**
   * List links with optional filtering
   *
   * @param options - List options
   * @returns Paginated list of links
   *
   * @example
   * ```typescript
   * const links = await client.links.list({
   *   search: 'campaign',
   *   isActive: true,
   *   limit: 20,
   *   sortBy: 'created_at',
   *   sortOrder: 'desc'
   * });
   * ```
   */
  async list(options: ListLinksOptions = {}): Promise<ListLinksResponse> {
    const validatedOptions = validateWithSchema(
      listLinksOptionsSchema,
      options
    );

    const params = new URLSearchParams();
    if (validatedOptions.search) params.append('search', validatedOptions.search);
    if (validatedOptions.isActive !== undefined) params.append('is_active', String(validatedOptions.isActive));
    if (validatedOptions.domain) params.append('domain', validatedOptions.domain);
    if (validatedOptions.limit) params.append('limit', String(validatedOptions.limit));
    if (validatedOptions.offset) params.append('offset', String(validatedOptions.offset));
    if (validatedOptions.sortBy) params.append('sort_by', validatedOptions.sortBy);
    if (validatedOptions.sortOrder) params.append('sort_order', validatedOptions.sortOrder);

    return await this.client.request<ListLinksResponse>(
      `/links?${params.toString()}`
    );
  }

  /**
   * Update a link
   *
   * @param linkId - Link ID
   * @param options - Update options
   * @returns Updated link
   *
   * @example
   * ```typescript
   * const updated = await client.links.update('link_123', {
   *   title: 'Updated Title',
   *   isActive: false
   * });
   * ```
   */
  async update(
    linkId: string,
    options: UpdateLinkOptions
  ): Promise<UpdateLinkResponse> {
    const validatedOptions = validateWithSchema(
      updateLinkOptionsSchema,
      options
    );

    const payload: any = {};
    if (validatedOptions.originalUrl !== undefined) payload.original_url = validatedOptions.originalUrl;
    if (validatedOptions.slug !== undefined) payload.slug = validatedOptions.slug;
    if (validatedOptions.domain !== undefined) payload.domain = validatedOptions.domain;
    if (validatedOptions.title !== undefined) payload.title = validatedOptions.title;
    if (validatedOptions.description !== undefined) payload.description = validatedOptions.description;
    if (validatedOptions.expiresAt !== undefined) payload.expires_at = validatedOptions.expiresAt;
    if (validatedOptions.isActive !== undefined) payload.is_active = validatedOptions.isActive;

    return await this.client.request<UpdateLinkResponse>(`/links/${linkId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  }

  /**
   * Delete a link
   *
   * @param linkId - Link ID
   * @returns Deletion confirmation
   *
   * @example
   * ```typescript
   * await client.links.delete('link_123');
   * ```
   */
  async delete(linkId: string): Promise<DeleteLinkResponse> {
    return await this.client.request<DeleteLinkResponse>(`/links/${linkId}`, {
      method: 'DELETE',
    });
  }

  // ===================================================
  // LINK ANALYTICS
  // ===================================================

  /**
   * Get comprehensive analytics for a link
   *
   * @param linkId - Link ID
   * @param options - Analytics query options
   * @returns Complete link analytics data
   *
   * @example
   * ```typescript
   * const analytics = await client.links.getAnalytics('link_123', {
   *   startDate: '2025-01-01T00:00:00Z',
   *   endDate: '2025-01-31T23:59:59Z'
   * });
   *
   * console.log('Total clicks:', analytics.data.summary.totalClicks);
   * console.log('Unique visitors:', analytics.data.summary.uniqueVisitors);
   * console.log('Top country:', analytics.data.topCountries[0]);
   * ```
   */
  async getAnalytics(
    linkId: string,
    options: LinkAnalyticsOptions = {}
  ): Promise<LinkAnalyticsResponse> {
    const validatedOptions = validateWithSchema(
      linkAnalyticsOptionsSchema,
      options
    );

    const params = new URLSearchParams();
    if (validatedOptions.startDate) params.append('start_date', validatedOptions.startDate);
    if (validatedOptions.endDate) params.append('end_date', validatedOptions.endDate);
    if (validatedOptions.limit) params.append('limit', String(validatedOptions.limit));

    return await this.client.request<LinkAnalyticsResponse>(
      `/links/${linkId}/analytics?${params.toString()}`
    );
  }

  /**
   * Get clicks by day for a link
   *
   * @param linkId - Link ID
   * @param days - Number of days to retrieve (default: 30)
   * @returns Time series of clicks by day
   *
   * @example
   * ```typescript
   * const clicksByDay = await client.links.getClicksByDay('link_123', 30);
   * clicksByDay.data.forEach(point => {
   *   console.log(`${point.date}: ${point.count} clicks`);
   * });
   * ```
   */
  async getClicksByDay(
    linkId: string,
    days: number = 30
  ): Promise<LinkClicksByDayResponse> {
    const params = new URLSearchParams({ days: String(days) });
    return await this.client.request<LinkClicksByDayResponse>(
      `/links/${linkId}/analytics/clicks-by-day?${params.toString()}`
    );
  }

  /**
   * Get top referrers for a link
   *
   * @param linkId - Link ID
   * @param limit - Maximum number of referrers to return (default: 10)
   * @returns Top referrers with click counts
   *
   * @example
   * ```typescript
   * const topReferrers = await client.links.getTopReferrers('link_123', 10);
   * topReferrers.data.forEach(ref => {
   *   console.log(`${ref.referrerDomain}: ${ref.count} clicks (${ref.percentage}%)`);
   * });
   * ```
   */
  async getTopReferrers(
    linkId: string,
    limit: number = 10
  ): Promise<TopReferrersResponse> {
    const params = new URLSearchParams({ limit: String(limit) });
    return await this.client.request<TopReferrersResponse>(
      `/links/${linkId}/analytics/top-referrers?${params.toString()}`
    );
  }

  /**
   * Get top countries for a link
   *
   * @param linkId - Link ID
   * @param limit - Maximum number of countries to return (default: 10)
   * @returns Top countries with click counts
   *
   * @example
   * ```typescript
   * const topCountries = await client.links.getTopCountries('link_123', 10);
   * topCountries.data.forEach(country => {
   *   console.log(`${country.country}: ${country.count} clicks (${country.percentage}%)`);
   * });
   * ```
   */
  async getTopCountries(
    linkId: string,
    limit: number = 10
  ): Promise<TopCountriesResponse> {
    const params = new URLSearchParams({ limit: String(limit) });
    return await this.client.request<TopCountriesResponse>(
      `/links/${linkId}/analytics/top-countries?${params.toString()}`
    );
  }

  /**
   * Get device breakdown for a link
   *
   * @param linkId - Link ID
   * @returns Device, browser, and OS statistics
   *
   * @example
   * ```typescript
   * const deviceStats = await client.links.getDeviceBreakdown('link_123');
   * console.log('Top device:', deviceStats.data.deviceTypes[0]);
   * console.log('Top browser:', deviceStats.data.browsers[0]);
   * ```
   */
  async getDeviceBreakdown(linkId: string): Promise<DeviceStatsResponse> {
    return await this.client.request<DeviceStatsResponse>(
      `/links/${linkId}/analytics/devices`
    );
  }

  // ===================================================
  // LINK A/B TESTING
  // ===================================================

  /**
   * Create an A/B test experiment for a link
   * Tests different destination URLs with traffic splitting
   *
   * @param options - Link experiment configuration
   * @returns Created experiment
   *
   * @example
   * ```typescript
   * const experiment = await client.links.createExperiment({
   *   linkId: 'link_123',
   *   name: 'Landing Page Test',
   *   description: 'Test two different landing pages',
   *   variants: [
   *     {
   *       id: 'control',
   *       name: 'Original Landing Page',
   *       destinationUrl: 'https://example.com/landing-v1',
   *       weight: 0.5
   *     },
   *     {
   *       id: 'variant_a',
   *       name: 'New Landing Page',
   *       destinationUrl: 'https://example.com/landing-v2',
   *       weight: 0.5
   *     }
   *   ],
   *   targetMetric: 'signup'
   * });
   * ```
   */
  async createExperiment(
    options: CreateLinkExperimentOptions
  ): Promise<CreateExperimentResponse> {
    const validatedOptions = validateWithSchema(
      createLinkExperimentOptionsSchema,
      options
    );

    const payload = {
      link_id: validatedOptions.linkId,
      name: validatedOptions.name,
      description: validatedOptions.description,
      variants: validatedOptions.variants,
      target_metric: validatedOptions.targetMetric,
    };

    return await this.client.request<CreateExperimentResponse>(
      '/links/experiments',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
  }

  /**
   * Get experiment results for a link experiment
   *
   * @param experimentId - Experiment ID
   * @returns Experiment results with variant performance
   *
   * @example
   * ```typescript
   * const results = await client.links.getExperimentResults('exp_123');
   * results.data.variants.forEach(variant => {
   *   console.log(`${variant.variantName}:`);
   *   console.log(`  - Clicks: ${variant.impressions}`);
   *   console.log(`  - Conversions: ${variant.conversions}`);
   *   console.log(`  - Rate: ${variant.conversionRate}%`);
   * });
   * ```
   */
  async getExperimentResults(
    experimentId: string
  ): Promise<ExperimentResultsResponse> {
    return await this.client.request<ExperimentResultsResponse>(
      `/links/experiments/${experimentId}/results`
    );
  }
}
