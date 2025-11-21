/**
 * Analytics Client for Tuturuuu SDK
 * Provides comprehensive analytics tracking, querying, and A/B testing capabilities
 */

import type { ZodSchema } from 'zod';
import { ValidationError } from '../errors';
import { SessionManager } from './session-manager';
import type {
  AnalyticsSummaryResponse,
  TimeSeriesResponse,
  GeoDataResponse,
  DeviceStatsResponse,
  EventsListResponse,
  TopEventsResponse,
  TrackEventOptions,
  BatchTrackEventsOptions,
  AnalyticsQueryOptions,
  TimeSeriesQueryOptions,
  GeoQueryOptions,
  TrackConversionResponse,
  TrackConversionOptions,
  CreateExperimentOptions,
  CreateExperimentResponse,
  UpdateExperimentOptions,
  UpdateExperimentResponse,
  GetExperimentResponse,
  ListExperimentsResponse,
  ListExperimentsOptions,
  GetVariantResponse,
  ExperimentResultsResponse,
} from '@tuturuuu/types/sdk';
import {
  trackEventOptionsSchema,
  batchTrackEventsOptionsSchema,
  analyticsQueryOptionsSchema,
  trackConversionOptionsSchema,
  createExperimentOptionsSchema,
  updateExperimentOptionsSchema,
  listExperimentsOptionsSchema,
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
 * Analytics Client for tracking events, querying analytics, and managing experiments
 */
export class AnalyticsClient {
  private sessionManager: SessionManager;

  constructor(private client: any) {
    this.sessionManager = new SessionManager();
  }

  // ===================================================
  // EVENT TRACKING
  // ===================================================

  /**
   * Track a single event
   *
   * @param eventName - Name of the event to track
   * @param properties - Optional event properties
   *
   * @example
   * ```typescript
   * await client.analytics.track('button_click', {
   *   button_id: 'signup_cta',
   *   page: '/pricing'
   * });
   * ```
   */
  async track(
    eventName: string,
    properties?: Record<string, unknown>
  ): Promise<void> {
    const options: TrackEventOptions = { eventName, properties };
    return this.trackEvent(options);
  }

  /**
   * Track an event with full options
   *
   * @param options - Event tracking options
   *
   * @example
   * ```typescript
   * await client.analytics.trackEvent({
   *   eventName: 'page_view',
   *   pageUrl: 'https://example.com/pricing',
   *   pageTitle: 'Pricing',
   *   referrer: 'https://google.com',
   *   utmSource: 'google',
   *   utmCampaign: 'spring_sale'
   * });
   * ```
   */
  async trackEvent(options: TrackEventOptions): Promise<void> {
    // Validate options
    const validatedOptions = validateWithSchema(
      trackEventOptionsSchema,
      options
    );

    // Get current session
    const session = this.sessionManager.getSession();

    // Prepare payload
    const payload = {
      session_id: session.sessionId,
      event_name: validatedOptions.eventName,
      event_properties: validatedOptions.properties,
      page_url: validatedOptions.pageUrl,
      page_title: validatedOptions.pageTitle,
      referrer: validatedOptions.referrer,
      utm_source: validatedOptions.utmSource,
      utm_medium: validatedOptions.utmMedium,
      utm_campaign: validatedOptions.utmCampaign,
      utm_term: validatedOptions.utmTerm,
      utm_content: validatedOptions.utmContent,
      // Include session data for first-time session creation
      session_data: {
        visitor_id: session.visitorId,
        device_type: session.deviceType,
        device_brand: session.deviceBrand,
        device_model: session.deviceModel,
        browser: session.browser,
        browser_version: session.browserVersion,
        os: session.os,
        os_version: session.osVersion,
        screen_width: session.screenWidth,
        screen_height: session.screenHeight,
        language: session.language,
        user_agent: session.userAgent,
        timezone: session.timezone,
      },
    };

    await this.client.request('/analytics/track', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  /**
   * Track a page view event
   *
   * @param url - Page URL
   * @param title - Optional page title
   *
   * @example
   * ```typescript
   * await client.analytics.trackPageView(
   *   'https://example.com/pricing',
   *   'Pricing Page'
   * );
   * ```
   */
  async trackPageView(url: string, title?: string): Promise<void> {
    return this.trackEvent({
      eventName: 'page_view',
      pageUrl: url,
      pageTitle: title,
    });
  }

  /**
   * Track a conversion event
   *
   * @param options - Conversion tracking options
   *
   * @example
   * ```typescript
   * await client.analytics.trackConversion({
   *   conversionType: 'purchase',
   *   value: 99.99,
   *   properties: {
   *     product_id: 'prod_123',
   *     currency: 'USD'
   *   }
   * });
   * ```
   */
  async trackConversion(
    options: TrackConversionOptions
  ): Promise<TrackConversionResponse> {
    // Validate options
    const validatedOptions = validateWithSchema(
      trackConversionOptionsSchema,
      options
    );

    // Get current session
    const session = this.sessionManager.getSession();

    // Prepare payload
    const payload = {
      session_id: session.sessionId,
      conversion_type: validatedOptions.conversionType,
      conversion_value: validatedOptions.value,
      conversion_properties: validatedOptions.properties,
    };

    return await this.client.request<TrackConversionResponse>(
      '/analytics/conversions',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
  }

  /**
   * Track multiple events in a single batch request
   *
   * @param options - Batch tracking options
   *
   * @example
   * ```typescript
   * await client.analytics.batchTrack({
   *   events: [
   *     { eventName: 'button_click', properties: { button_id: 'cta1' } },
   *     { eventName: 'form_submit', properties: { form_id: 'contact' } },
   *     { eventName: 'page_view', pageUrl: '/thank-you' }
   *   ]
   * });
   * ```
   */
  async batchTrack(options: BatchTrackEventsOptions): Promise<void> {
    // Validate options
    const validatedOptions = validateWithSchema(
      batchTrackEventsOptionsSchema,
      options
    );

    // Get current session
    const session = this.sessionManager.getSession();

    // Prepare batch payload
    const payload = {
      session_id: session.sessionId,
      events: validatedOptions.events.map((event) => ({
        event_name: event.eventName,
        event_properties: event.properties,
        page_url: event.pageUrl,
        page_title: event.pageTitle,
        referrer: event.referrer,
        utm_source: event.utmSource,
        utm_medium: event.utmMedium,
        utm_campaign: event.utmCampaign,
        utm_term: event.utmTerm,
        utm_content: event.utmContent,
      })),
      // Include session data
      session_data: {
        visitor_id: session.visitorId,
        device_type: session.deviceType,
        device_brand: session.deviceBrand,
        device_model: session.deviceModel,
        browser: session.browser,
        browser_version: session.browserVersion,
        os: session.os,
        os_version: session.osVersion,
        screen_width: session.screenWidth,
        screen_height: session.screenHeight,
        language: session.language,
        user_agent: session.userAgent,
        timezone: session.timezone,
      },
    };

    await this.client.request('/analytics/batch', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  // ===================================================
  // SESSION MANAGEMENT
  // ===================================================

  /**
   * Get the current session ID
   *
   * @returns Current session ID
   */
  getSessionId(): string {
    return this.sessionManager.getSessionId();
  }

  /**
   * Get the current visitor ID
   *
   * @returns Current visitor ID
   */
  getVisitorId(): string {
    return this.sessionManager.getVisitorId();
  }

  /**
   * Start a new session (resets session ID but keeps visitor ID)
   */
  startNewSession(): void {
    this.sessionManager.startNewSession();
  }

  // ===================================================
  // ANALYTICS QUERIES
  // ===================================================

  /**
   * Get analytics summary for a date range
   *
   * @param options - Query options
   * @returns Analytics summary data
   *
   * @example
   * ```typescript
   * const summary = await client.analytics.getAnalyticsSummary({
   *   startDate: '2025-01-01T00:00:00Z',
   *   endDate: '2025-01-31T23:59:59Z'
   * });
   *
   * console.log(`Total events: ${summary.data.totalEvents}`);
   * console.log(`Conversion rate: ${summary.data.conversionRate}%`);
   * ```
   */
  async getAnalyticsSummary(
    options: AnalyticsQueryOptions = {}
  ): Promise<AnalyticsSummaryResponse> {
    const validatedOptions = validateWithSchema(
      analyticsQueryOptionsSchema,
      options
    );

    const params = new URLSearchParams();
    if (validatedOptions.startDate) params.append('start_date', validatedOptions.startDate);
    if (validatedOptions.endDate) params.append('end_date', validatedOptions.endDate);

    return await this.client.request<AnalyticsSummaryResponse>(
      `/analytics/summary?${params.toString()}`
    );
  }

  /**
   * Get events by day time series
   *
   * @param options - Time series query options
   * @returns Time series data points
   *
   * @example
   * ```typescript
   * const timeSeries = await client.analytics.getEventsByDay({
   *   startDate: '2025-01-01T00:00:00Z',
   *   endDate: '2025-01-31T23:59:59Z',
   *   granularity: 'day'
   * });
   * ```
   */
  async getEventsByDay(
    options: TimeSeriesQueryOptions = {}
  ): Promise<TimeSeriesResponse> {
    const params = new URLSearchParams();
    if (options.startDate) params.append('start_date', options.startDate);
    if (options.endDate) params.append('end_date', options.endDate);
    if (options.granularity) params.append('granularity', options.granularity);
    if (options.eventName) params.append('event_name', options.eventName);

    return await this.client.request<TimeSeriesResponse>(
      `/analytics/events/time-series?${params.toString()}`
    );
  }

  /**
   * Get top events
   *
   * @param limit - Maximum number of events to return
   * @returns Top events with counts
   *
   * @example
   * ```typescript
   * const topEvents = await client.analytics.getTopEvents(10);
   * ```
   */
  async getTopEvents(limit: number = 10): Promise<TopEventsResponse> {
    const params = new URLSearchParams({ limit: String(limit) });
    return await this.client.request<TopEventsResponse>(
      `/analytics/events/top?${params.toString()}`
    );
  }

  /**
   * Get geographic data
   *
   * @param options - Geographic query options
   * @returns Geographic data points with lat/long
   *
   * @example
   * ```typescript
   * const geoData = await client.analytics.getGeographicData({
   *   startDate: '2025-01-01T00:00:00Z',
   *   limit: 100
   * });
   * ```
   */
  async getGeographicData(options: GeoQueryOptions = {}): Promise<GeoDataResponse> {
    const params = new URLSearchParams();
    if (options.startDate) params.append('start_date', options.startDate);
    if (options.endDate) params.append('end_date', options.endDate);
    if (options.limit) params.append('limit', String(options.limit));

    return await this.client.request<GeoDataResponse>(
      `/analytics/geographic?${params.toString()}`
    );
  }

  /**
   * Get device breakdown statistics
   *
   * @returns Device, browser, and OS statistics
   *
   * @example
   * ```typescript
   * const deviceStats = await client.analytics.getDeviceBreakdown();
   * console.log('Top device:', deviceStats.data.deviceTypes[0]);
   * ```
   */
  async getDeviceBreakdown(): Promise<DeviceStatsResponse> {
    return await this.client.request<DeviceStatsResponse>('/analytics/devices');
  }

  /**
   * Get list of events with filtering
   *
   * @param options - Analytics query options
   * @returns Paginated list of events
   *
   * @example
   * ```typescript
   * const events = await client.analytics.getEvents({
   *   eventName: 'button_click',
   *   limit: 50,
   *   offset: 0
   * });
   * ```
   */
  async getEvents(
    options: AnalyticsQueryOptions = {}
  ): Promise<EventsListResponse> {
    const validatedOptions = validateWithSchema(
      analyticsQueryOptionsSchema,
      options
    );

    const params = new URLSearchParams();
    if (validatedOptions.startDate) params.append('start_date', validatedOptions.startDate);
    if (validatedOptions.endDate) params.append('end_date', validatedOptions.endDate);
    if (validatedOptions.eventName) params.append('event_name', validatedOptions.eventName);
    if (validatedOptions.pagePath) params.append('page_path', validatedOptions.pagePath);
    if (validatedOptions.referrerDomain) params.append('referrer_domain', validatedOptions.referrerDomain);
    if (validatedOptions.country) params.append('country', validatedOptions.country);
    if (validatedOptions.deviceType) params.append('device_type', validatedOptions.deviceType);
    if (validatedOptions.browser) params.append('browser', validatedOptions.browser);
    if (validatedOptions.os) params.append('os', validatedOptions.os);
    if (validatedOptions.limit) params.append('limit', String(validatedOptions.limit));
    if (validatedOptions.offset) params.append('offset', String(validatedOptions.offset));

    return await this.client.request<EventsListResponse>(
      `/analytics/events?${params.toString()}`
    );
  }

  // ===================================================
  // A/B TESTING & EXPERIMENTS
  // ===================================================

  /**
   * Create a new experiment
   *
   * @param options - Experiment configuration
   * @returns Created experiment
   *
   * @example
   * ```typescript
   * const experiment = await client.analytics.createExperiment({
   *   name: 'Homepage Hero Test',
   *   experimentKey: 'homepage_hero_v1',
   *   experimentType: 'content_variant',
   *   variants: [
   *     { id: 'control', name: 'Control', weight: 0.5, config: { color: 'blue' } },
   *     { id: 'variant_a', name: 'Variant A', weight: 0.5, config: { color: 'green' } }
   *   ],
   *   targetMetric: 'signup'
   * });
   * ```
   */
  async createExperiment(
    options: CreateExperimentOptions
  ): Promise<CreateExperimentResponse> {
    const validatedOptions = validateWithSchema(
      createExperimentOptionsSchema,
      options
    );

    const payload = {
      name: validatedOptions.name,
      description: validatedOptions.description,
      experiment_key: validatedOptions.experimentKey,
      experiment_type: validatedOptions.experimentType,
      traffic_allocation: validatedOptions.trafficAllocation,
      variants: validatedOptions.variants,
      target_metric: validatedOptions.targetMetric,
    };

    return await this.client.request<CreateExperimentResponse>(
      '/experiments',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
  }

  /**
   * Update an existing experiment
   *
   * @param id - Experiment ID
   * @param options - Update options
   * @returns Updated experiment
   *
   * @example
   * ```typescript
   * const updated = await client.analytics.updateExperiment('exp_123', {
   *   status: 'running',
   *   trafficAllocation: 0.8
   * });
   * ```
   */
  async updateExperiment(
    id: string,
    options: UpdateExperimentOptions
  ): Promise<UpdateExperimentResponse> {
    const validatedOptions = validateWithSchema(
      updateExperimentOptionsSchema,
      options
    );

    const payload: any = {};
    if (validatedOptions.name !== undefined) payload.name = validatedOptions.name;
    if (validatedOptions.description !== undefined) payload.description = validatedOptions.description;
    if (validatedOptions.experimentType !== undefined) payload.experiment_type = validatedOptions.experimentType;
    if (validatedOptions.trafficAllocation !== undefined) payload.traffic_allocation = validatedOptions.trafficAllocation;
    if (validatedOptions.variants !== undefined) payload.variants = validatedOptions.variants;
    if (validatedOptions.targetMetric !== undefined) payload.target_metric = validatedOptions.targetMetric;
    if (validatedOptions.status !== undefined) payload.status = validatedOptions.status;

    return await this.client.request<UpdateExperimentResponse>(
      `/experiments/${id}`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }
    );
  }

  /**
   * Get experiment details
   *
   * @param id - Experiment ID
   * @returns Experiment details
   */
  async getExperiment(id: string): Promise<GetExperimentResponse> {
    return await this.client.request<GetExperimentResponse>(
      `/experiments/${id}`
    );
  }

  /**
   * List experiments with optional filtering
   *
   * @param options - List options
   * @returns Paginated list of experiments
   *
   * @example
   * ```typescript
   * const experiments = await client.analytics.listExperiments({
   *   status: 'running',
   *   limit: 20
   * });
   * ```
   */
  async listExperiments(
    options: ListExperimentsOptions = {}
  ): Promise<ListExperimentsResponse> {
    const validatedOptions = validateWithSchema(
      listExperimentsOptionsSchema,
      options
    );

    const params = new URLSearchParams();
    if (validatedOptions.status) params.append('status', validatedOptions.status);
    if (validatedOptions.experimentType) params.append('experiment_type', validatedOptions.experimentType);
    if (validatedOptions.limit) params.append('limit', String(validatedOptions.limit));
    if (validatedOptions.offset) params.append('offset', String(validatedOptions.offset));

    return await this.client.request<ListExperimentsResponse>(
      `/experiments?${params.toString()}`
    );
  }

  /**
   * Get variant assignment for the current visitor in an experiment
   *
   * @param experimentKey - Experiment key
   * @returns Variant assignment with configuration
   *
   * @example
   * ```typescript
   * const { data } = await client.analytics.getVariant('homepage_hero_v1');
   * console.log('Assigned variant:', data.variantId);
   * // Use data.variantConfig to render the appropriate variant
   * ```
   */
  async getVariant(experimentKey: string): Promise<GetVariantResponse> {
    const visitorId = this.sessionManager.getVisitorId();
    const sessionId = this.sessionManager.getSessionId();

    return await this.client.request<GetVariantResponse>(
      `/experiments/${experimentKey}/variant?visitor_id=${visitorId}&session_id=${sessionId}`
    );
  }

  /**
   * Start an experiment
   *
   * @param id - Experiment ID
   * @returns Updated experiment
   */
  async startExperiment(id: string): Promise<UpdateExperimentResponse> {
    return await this.client.request<UpdateExperimentResponse>(
      `/experiments/${id}/start`,
      {
        method: 'POST',
      }
    );
  }

  /**
   * Stop an experiment
   *
   * @param id - Experiment ID
   * @returns Updated experiment
   */
  async stopExperiment(id: string): Promise<UpdateExperimentResponse> {
    return await this.client.request<UpdateExperimentResponse>(
      `/experiments/${id}/stop`,
      {
        method: 'POST',
      }
    );
  }

  /**
   * Get experiment results with statistical analysis
   *
   * @param id - Experiment ID
   * @returns Experiment results with variant performance
   *
   * @example
   * ```typescript
   * const results = await client.analytics.getExperimentResults('exp_123');
   * results.data.variants.forEach(variant => {
   *   console.log(`${variant.variantName}: ${variant.conversionRate}%`);
   * });
   * console.log('Winner:', results.data.winningVariant);
   * ```
   */
  async getExperimentResults(
    id: string
  ): Promise<ExperimentResultsResponse> {
    return await this.client.request<ExperimentResultsResponse>(
      `/experiments/${id}/results`
    );
  }
}
