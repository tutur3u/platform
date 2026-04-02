import packageJson from '../package.json';
import {
  createErrorFromResponse,
  isApiErrorResponse,
  NetworkError,
  ValidationError,
} from './errors';
import type {
  ExternalProjectDeliveryOptions,
  ExternalProjectDeliveryPayload,
  ExternalProjectLoadingData,
  YoolaExternalProjectLoadingData,
} from './types';
import { externalProjectDeliveryOptionsSchema } from './types';

function absolutizeUrl(baseUrl: string, value: string | null | undefined) {
  if (!value) {
    return value ?? null;
  }

  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  const parsedBaseUrl = new URL(baseUrl);

  if (value.startsWith('/')) {
    return new URL(value, parsedBaseUrl.origin).toString();
  }

  return new URL(value, `${baseUrl.replace(/\/$/, '')}/`).toString();
}

function normalizeDeliveryPayloadUrls(
  payload: ExternalProjectDeliveryPayload,
  apiBaseUrl: string
) {
  const normalizedCollections = payload.collections.map((collection) => ({
    ...collection,
    entries: collection.entries.map((entry) => ({
      ...entry,
      assets: entry.assets.map((asset) => ({
        ...asset,
        assetUrl: absolutizeUrl(apiBaseUrl, asset.assetUrl),
      })),
    })),
  }));

  const loadingData =
    payload.loadingData?.adapter === 'yoola'
      ? {
          ...payload.loadingData,
          artworks: payload.loadingData.artworks.map((artwork) => ({
            ...artwork,
            assetUrl: absolutizeUrl(apiBaseUrl, artwork.assetUrl),
          })),
          artworksByCategory: Object.fromEntries(
            Object.entries(payload.loadingData.artworksByCategory).map(
              ([category, artworks]) => [
                category,
                artworks.map((artwork) => ({
                  ...artwork,
                  assetUrl: absolutizeUrl(apiBaseUrl, artwork.assetUrl),
                })),
              ]
            )
          ),
          featuredArtwork: payload.loadingData.featuredArtwork
            ? {
                ...payload.loadingData.featuredArtwork,
                assetUrl: absolutizeUrl(
                  apiBaseUrl,
                  payload.loadingData.featuredArtwork.assetUrl
                ),
              }
            : null,
          loreCapsules: payload.loadingData.loreCapsules.map((capsule) => ({
            ...capsule,
            artworkAssetUrl: absolutizeUrl(apiBaseUrl, capsule.artworkAssetUrl),
          })),
        }
      : payload.loadingData;

  return {
    ...payload,
    collections: normalizedCollections,
    loadingData,
  } satisfies ExternalProjectDeliveryPayload;
}

export function isYoolaExternalProjectLoadingData(
  value: ExternalProjectLoadingData | null | undefined
): value is YoolaExternalProjectLoadingData {
  return value?.adapter === 'yoola';
}

export interface ExternalProjectsClientConfig {
  apiKey?: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  timeout?: number;
}

export class ExternalProjectsClient {
  private readonly apiKey?: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeout: number;

  constructor(config: ExternalProjectsClientConfig = {}) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || 'https://tuturuuu.com/api/v1';
    this.fetchImpl = config.fetch || globalThis.fetch;
    this.timeout = config.timeout || 30000;
  }

  async getDelivery(
    workspaceId: string,
    options: ExternalProjectDeliveryOptions = {}
  ): Promise<ExternalProjectDeliveryPayload> {
    if (!workspaceId.trim()) {
      throw new ValidationError('Workspace ID is required');
    }

    const validatedOptions =
      externalProjectDeliveryOptionsSchema.parse(options);

    if (validatedOptions.preview && !this.apiKey) {
      throw new ValidationError(
        'API key is required to load preview external project delivery'
      );
    }

    const query = new URLSearchParams();
    if (validatedOptions.preview) {
      query.set('preview', 'true');
    }

    const suffix = query.size > 0 ? `?${query.toString()}` : '';
    const endpoint = `${this.baseUrl.replace(/\/$/, '')}/workspaces/${encodeURIComponent(
      workspaceId
    )}/external-projects/delivery${suffix}`;
    const headers = new Headers({
      Accept: 'application/json',
      'X-SDK-Client': `tuturuuu/${packageJson.version || '0.0.1'}`,
    });

    if (this.apiKey) {
      headers.set('Authorization', `Bearer ${this.apiKey}`);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await this.fetchImpl(endpoint, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const contentType = response.headers.get('content-type');
        if (contentType?.toLowerCase().includes('application/json')) {
          const errorData = await response.json();
          if (isApiErrorResponse(errorData)) {
            throw createErrorFromResponse(errorData, response.status);
          }
        }

        const text = await response.text().catch(() => '');
        throw new NetworkError(
          `HTTP ${response.status}: ${response.statusText}${text ? ` - ${text.substring(0, 200)}` : ''}`
        );
      }

      const payload = (await response.json()) as ExternalProjectDeliveryPayload;
      return normalizeDeliveryPayloadUrls(payload, this.baseUrl);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new NetworkError(`Request timeout after ${this.timeout}ms`);
      }

      throw error;
    }
  }

  async load(
    workspaceId: string,
    options: ExternalProjectDeliveryOptions = {}
  ) {
    return this.getDelivery(workspaceId, options);
  }

  async getLoadingData(
    workspaceId: string,
    options: ExternalProjectDeliveryOptions = {}
  ) {
    const payload = await this.getDelivery(workspaceId, options);
    return payload.loadingData;
  }

  async loadLoadingData(
    workspaceId: string,
    options: ExternalProjectDeliveryOptions = {}
  ) {
    return this.getLoadingData(workspaceId, options);
  }

  async getYoolaLoadingData(
    workspaceId: string,
    options: ExternalProjectDeliveryOptions = {}
  ) {
    const loadingData = await this.getLoadingData(workspaceId, options);

    if (!isYoolaExternalProjectLoadingData(loadingData)) {
      throw new ValidationError(
        'External project delivery is not using the yoola adapter'
      );
    }

    return loadingData;
  }

  getAssetUrl(workspaceId: string, assetId: string) {
    if (!workspaceId.trim() || !assetId.trim()) {
      throw new ValidationError('Workspace ID and asset ID are required');
    }

    return `${this.baseUrl.replace(/\/$/, '')}/workspaces/${encodeURIComponent(
      workspaceId
    )}/external-projects/assets/${encodeURIComponent(assetId)}`;
  }
}
