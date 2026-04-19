import packageJson from '../package.json';
import {
  createErrorFromResponse,
  isApiErrorResponse,
  NetworkError,
  ValidationError,
} from './errors';
import type {
  EpmAssetPayload,
  EpmAssetUpdatePayload,
  EpmAssetUploadOptions,
  EpmBlockPayload,
  EpmBlockUpdatePayload,
  EpmCollectionNavigationConfig,
  EpmCollectionPayload,
  EpmCollectionUpdatePayload,
  EpmEntryListOptions,
  EpmEntryPayload,
  EpmEntryUpdatePayload,
  EpmPublishEventKind,
  ExternalProjectBulkUpdatePayload,
  ExternalProjectCollection,
  ExternalProjectDeliveryOptions,
  ExternalProjectDeliveryPayload,
  ExternalProjectLoadingData,
  ExternalProjectStudioData,
  ExternalProjectSummary,
  WorkspaceExternalProjectBinding,
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

function normalizeStudioPayloadUrls(
  payload: {
    binding: WorkspaceExternalProjectBinding;
  } & ExternalProjectStudioData,
  apiBaseUrl: string
) {
  return {
    ...payload,
    assets: payload.assets.map((asset) => ({
      ...asset,
      asset_url: absolutizeUrl(apiBaseUrl, asset.asset_url),
      preview_url: absolutizeUrl(apiBaseUrl, asset.preview_url),
    })),
  };
}

export function getEpmCollectionNavigationConfig(
  config: unknown
): EpmCollectionNavigationConfig | null {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    return null;
  }

  const navigation = (config as Record<string, unknown>).navigation;
  if (
    !navigation ||
    typeof navigation !== 'object' ||
    Array.isArray(navigation)
  ) {
    return null;
  }

  return navigation as EpmCollectionNavigationConfig;
}

export function getEpmCollectionNavigationTitle(
  collection: Pick<ExternalProjectCollection, 'config' | 'title'>
) {
  const navigation = getEpmCollectionNavigationConfig(collection.config);
  return navigation?.title?.trim() ? navigation.title.trim() : collection.title;
}

export function buildEpmNavigationItems(
  collections: ExternalProjectCollection[]
) {
  return collections
    .filter((collection) => collection.is_enabled)
    .map((collection) => {
      const navigation = getEpmCollectionNavigationConfig(collection.config);

      return {
        collectionId: collection.id,
        href: navigation?.href ?? null,
        navigation: navigation ?? null,
        slug: collection.slug,
        title: getEpmCollectionNavigationTitle(collection),
        visible: navigation?.visible !== false,
      };
    })
    .filter((item) => item.visible);
}

export function isYoolaExternalProjectLoadingData(
  value: ExternalProjectLoadingData | null | undefined
): value is YoolaExternalProjectLoadingData {
  return value?.adapter === 'yoola';
}

export interface EpmClientConfig {
  apiKey?: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  timeout?: number;
}

type ExternalProjectUploadUrlResponse = {
  signedUrl?: string;
  token?: string;
  path?: string;
  fullPath?: string | null;
};

type ExternalProjectUploadUrlPayload = {
  signedUrl: string;
  token: string;
  path: string;
  fullPath: string | null;
};

function parseExternalProjectUploadPayload(
  payload: ExternalProjectUploadUrlResponse
) {
  if (!payload.signedUrl || !payload.token || !payload.path) {
    throw new Error('Missing upload URL payload');
  }

  return {
    signedUrl: payload.signedUrl,
    token: payload.token,
    path: payload.path,
    fullPath: payload.fullPath ?? null,
  } satisfies ExternalProjectUploadUrlPayload;
}

async function uploadExternalProjectFileWithSignedUrl(
  file: File,
  uploadUrlResult: ExternalProjectUploadUrlPayload,
  fetchImpl: typeof fetch
) {
  let uploadResponse = await fetchImpl(uploadUrlResult.signedUrl, {
    method: 'PUT',
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${uploadUrlResult.token}`,
      'Content-Type': file.type || 'application/octet-stream',
    },
    body: file,
  });

  if (!uploadResponse.ok) {
    uploadResponse = await fetchImpl(uploadUrlResult.signedUrl, {
      method: 'PUT',
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${uploadUrlResult.token}`,
      },
      body: file,
    });
  }

  if (!uploadResponse.ok) {
    const message = await uploadResponse.text().catch(() => '');
    throw new Error(
      `Failed to upload file (${uploadResponse.status})${message ? `: ${message}` : ''}`
    );
  }

  return {
    fullPath: uploadUrlResult.fullPath,
    path: uploadUrlResult.path,
  };
}

export class EpmClient {
  protected readonly apiKey?: string;
  protected readonly baseUrl: string;
  protected readonly fetchImpl: typeof fetch;
  protected readonly timeout: number;

  constructor(config: EpmClientConfig = {}) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || 'https://tuturuuu.com/api/v1';
    this.fetchImpl = config.fetch || globalThis.fetch;
    this.timeout = config.timeout || 30000;
  }

  private requireApiKey() {
    if (!this.apiKey) {
      throw new ValidationError(
        'API key is required for EPM management operations'
      );
    }
  }

  protected async request<T>(
    endpoint: string,
    options: {
      body?: BodyInit;
      headers?: HeadersInit;
      method?: string;
      requiresAuth?: boolean;
    } = {}
  ): Promise<T> {
    const {
      body,
      headers: headerOverrides,
      method = 'GET',
      requiresAuth,
    } = options;

    if (requiresAuth) {
      this.requireApiKey();
    }

    const headers = new Headers({
      Accept: 'application/json',
      'X-SDK-Client': `tuturuuu/${packageJson.version || '0.0.1'}`,
    });

    if (this.apiKey) {
      headers.set('Authorization', `Bearer ${this.apiKey}`);
    }

    if (headerOverrides) {
      const normalized = new Headers(headerOverrides);
      for (const [key, value] of normalized.entries()) {
        headers.set(key, value);
      }
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await this.fetchImpl(
        `${this.baseUrl.replace(/\/$/, '')}${endpoint}`,
        {
          body,
          headers,
          method,
          signal: controller.signal,
        }
      );

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

      if (response.status === 204) {
        return undefined as T;
      }

      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new NetworkError(`Request timeout after ${this.timeout}ms`);
      }

      throw error;
    }
  }

  async getStudio(workspaceId: string): Promise<
    {
      binding: WorkspaceExternalProjectBinding;
    } & ExternalProjectStudioData
  > {
    this.requireApiKey();
    const payload = await this.request<
      {
        binding: WorkspaceExternalProjectBinding;
      } & ExternalProjectStudioData
    >(`/workspaces/${encodeURIComponent(workspaceId)}/external-projects`, {
      requiresAuth: true,
    });

    return normalizeStudioPayloadUrls(payload, this.baseUrl);
  }

  async getSummary(workspaceId: string): Promise<ExternalProjectSummary> {
    return this.request(
      `/workspaces/${encodeURIComponent(workspaceId)}/external-projects/summary`,
      {
        requiresAuth: true,
      }
    );
  }

  async listCollections(workspaceId: string) {
    return this.request(
      `/workspaces/${encodeURIComponent(workspaceId)}/external-projects/collections`,
      {
        requiresAuth: true,
      }
    );
  }

  async createCollection(workspaceId: string, payload: EpmCollectionPayload) {
    return this.request(
      `/workspaces/${encodeURIComponent(workspaceId)}/external-projects/collections`,
      {
        body: JSON.stringify(payload),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
        requiresAuth: true,
      }
    );
  }

  async updateCollection(
    workspaceId: string,
    collectionId: string,
    payload: EpmCollectionUpdatePayload
  ) {
    return this.request(
      `/workspaces/${encodeURIComponent(workspaceId)}/external-projects/collections/${encodeURIComponent(collectionId)}`,
      {
        body: JSON.stringify(payload),
        headers: { 'Content-Type': 'application/json' },
        method: 'PATCH',
        requiresAuth: true,
      }
    );
  }

  async deleteCollection(workspaceId: string, collectionId: string) {
    return this.request(
      `/workspaces/${encodeURIComponent(workspaceId)}/external-projects/collections/${encodeURIComponent(collectionId)}`,
      {
        method: 'DELETE',
        requiresAuth: true,
      }
    );
  }

  async listEntries(workspaceId: string, options: EpmEntryListOptions = {}) {
    const params = new URLSearchParams();
    if (options.collectionId) {
      params.set('collectionId', options.collectionId);
    }

    const suffix = params.size > 0 ? `?${params.toString()}` : '';
    return this.request(
      `/workspaces/${encodeURIComponent(workspaceId)}/external-projects/entries${suffix}`,
      {
        requiresAuth: true,
      }
    );
  }

  async createEntry(workspaceId: string, payload: EpmEntryPayload) {
    return this.request(
      `/workspaces/${encodeURIComponent(workspaceId)}/external-projects/entries`,
      {
        body: JSON.stringify(payload),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
        requiresAuth: true,
      }
    );
  }

  async updateEntry(
    workspaceId: string,
    entryId: string,
    payload: EpmEntryUpdatePayload
  ) {
    return this.request(
      `/workspaces/${encodeURIComponent(workspaceId)}/external-projects/entries/${encodeURIComponent(entryId)}`,
      {
        body: JSON.stringify(payload),
        headers: { 'Content-Type': 'application/json' },
        method: 'PATCH',
        requiresAuth: true,
      }
    );
  }

  async deleteEntry(workspaceId: string, entryId: string) {
    return this.request(
      `/workspaces/${encodeURIComponent(workspaceId)}/external-projects/entries/${encodeURIComponent(entryId)}`,
      {
        method: 'DELETE',
        requiresAuth: true,
      }
    );
  }

  async duplicateEntry(workspaceId: string, entryId: string) {
    return this.request(
      `/workspaces/${encodeURIComponent(workspaceId)}/external-projects/entries/${encodeURIComponent(entryId)}/duplicate`,
      {
        method: 'POST',
        requiresAuth: true,
      }
    );
  }

  async bulkUpdateEntries(
    workspaceId: string,
    payload: ExternalProjectBulkUpdatePayload
  ) {
    return this.request(
      `/workspaces/${encodeURIComponent(workspaceId)}/external-projects/entries/bulk`,
      {
        body: JSON.stringify(payload),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
        requiresAuth: true,
      }
    );
  }

  async createBlock(workspaceId: string, payload: EpmBlockPayload) {
    return this.request(
      `/workspaces/${encodeURIComponent(workspaceId)}/external-projects/blocks`,
      {
        body: JSON.stringify(payload),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
        requiresAuth: true,
      }
    );
  }

  async updateBlock(
    workspaceId: string,
    blockId: string,
    payload: EpmBlockUpdatePayload
  ) {
    return this.request(
      `/workspaces/${encodeURIComponent(workspaceId)}/external-projects/blocks/${encodeURIComponent(blockId)}`,
      {
        body: JSON.stringify(payload),
        headers: { 'Content-Type': 'application/json' },
        method: 'PATCH',
        requiresAuth: true,
      }
    );
  }

  async createAsset(workspaceId: string, payload: EpmAssetPayload) {
    return this.request(
      `/workspaces/${encodeURIComponent(workspaceId)}/external-projects/assets`,
      {
        body: JSON.stringify(payload),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
        requiresAuth: true,
      }
    );
  }

  async updateAsset(
    workspaceId: string,
    assetId: string,
    payload: EpmAssetUpdatePayload
  ) {
    return this.request(
      `/workspaces/${encodeURIComponent(workspaceId)}/external-projects/assets/${encodeURIComponent(assetId)}`,
      {
        body: JSON.stringify(payload),
        headers: { 'Content-Type': 'application/json' },
        method: 'PATCH',
        requiresAuth: true,
      }
    );
  }

  async deleteAsset(workspaceId: string, assetId: string) {
    return this.request(
      `/workspaces/${encodeURIComponent(workspaceId)}/external-projects/assets/${encodeURIComponent(assetId)}`,
      {
        method: 'DELETE',
        requiresAuth: true,
      }
    );
  }

  async createAssetUploadUrl(
    workspaceId: string,
    payload: EpmAssetUploadOptions & {
      filename: string;
    }
  ) {
    const response = await this.request<ExternalProjectUploadUrlResponse>(
      `/workspaces/${encodeURIComponent(workspaceId)}/external-projects/assets/upload-url`,
      {
        body: JSON.stringify(payload),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
        requiresAuth: true,
      }
    );

    return parseExternalProjectUploadPayload(response);
  }

  async uploadAssetFile(
    workspaceId: string,
    file: File,
    options: EpmAssetUploadOptions
  ) {
    const uploadUrl = await this.createAssetUploadUrl(workspaceId, {
      ...options,
      filename: file.name,
    });

    return uploadExternalProjectFileWithSignedUrl(
      file,
      uploadUrl,
      this.fetchImpl
    );
  }

  async importContent(workspaceId: string) {
    return this.request(
      `/workspaces/${encodeURIComponent(workspaceId)}/external-projects/import`,
      {
        method: 'POST',
        requiresAuth: true,
      }
    );
  }

  async publishEntry(
    workspaceId: string,
    entryId: string,
    eventKind: EpmPublishEventKind
  ) {
    return this.request(
      `/workspaces/${encodeURIComponent(workspaceId)}/external-projects/entries/${encodeURIComponent(entryId)}/publish`,
      {
        body: JSON.stringify({ eventKind }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
        requiresAuth: true,
      }
    );
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
    const payload = await this.request<ExternalProjectDeliveryPayload>(
      `/workspaces/${encodeURIComponent(workspaceId)}/external-projects/delivery${suffix}`,
      {
        requiresAuth: validatedOptions.preview === true,
      }
    );

    return normalizeDeliveryPayloadUrls(payload, this.baseUrl);
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
