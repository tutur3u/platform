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
  ExocorpseExternalProjectLoadingData,
  ExocorpseExternalProjectLoadingEntry,
  ExternalProjectAdapterKind,
  ExternalProjectBulkUpdatePayload,
  ExternalProjectCollection,
  ExternalProjectDeliveryOptions,
  ExternalProjectDeliveryPayload,
  ExternalProjectEntryBatchPayload,
  ExternalProjectEntryBatchResult,
  ExternalProjectLoadingData,
  ExternalProjectStudioData,
  ExternalProjectSummary,
  ExternalProjectSyncApplyResult,
  ExternalProjectSyncDiff,
  ExternalProjectSyncManifest,
  ExternalProjectSyncSchema,
  ExternalProjectSyncSnapshot,
  WorkspaceExternalProjectBinding,
  YoolaExternalProjectLoadingData,
  YoolaExternalProjectSectionLoadingItem,
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

  let loadingData = payload.loadingData;

  if (payload.loadingData?.adapter === 'yoola') {
    loadingData = {
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
    };
  } else if (payload.loadingData?.adapter === 'exocorpse') {
    loadingData = normalizeExocorpseLoadingDataUrls(
      payload.loadingData,
      apiBaseUrl
    );
  }

  return {
    ...payload,
    collections: normalizedCollections,
    loadingData,
  } satisfies ExternalProjectDeliveryPayload;
}

function normalizeExocorpseEntryUrls(
  entry: ExocorpseExternalProjectLoadingEntry,
  apiBaseUrl: string
): ExocorpseExternalProjectLoadingEntry {
  return {
    ...entry,
    assets: entry.assets.map((asset) => ({
      ...asset,
      assetUrl: absolutizeUrl(apiBaseUrl, asset.assetUrl),
    })),
  };
}

function normalizeExocorpseEntriesUrls(
  entries: ExocorpseExternalProjectLoadingEntry[],
  apiBaseUrl: string
) {
  return entries.map((entry) => normalizeExocorpseEntryUrls(entry, apiBaseUrl));
}

function normalizeExocorpseLoadingDataUrls(
  payload: ExocorpseExternalProjectLoadingData,
  apiBaseUrl: string
): ExocorpseExternalProjectLoadingData {
  return {
    ...payload,
    blogPosts: normalizeExocorpseEntriesUrls(payload.blogPosts, apiBaseUrl),
    collections: Object.fromEntries(
      Object.entries(payload.collections).map(([slug, collection]) => [
        slug,
        {
          ...collection,
          entries: normalizeExocorpseEntriesUrls(
            collection.entries,
            apiBaseUrl
          ),
        },
      ])
    ),
    commissions: {
      addons: normalizeExocorpseEntriesUrls(
        payload.commissions.addons,
        apiBaseUrl
      ),
      blacklist: normalizeExocorpseEntriesUrls(
        payload.commissions.blacklist,
        apiBaseUrl
      ),
      pictures: normalizeExocorpseEntriesUrls(
        payload.commissions.pictures,
        apiBaseUrl
      ),
      serviceAddons: normalizeExocorpseEntriesUrls(
        payload.commissions.serviceAddons,
        apiBaseUrl
      ),
      services: normalizeExocorpseEntriesUrls(
        payload.commissions.services,
        apiBaseUrl
      ),
      styles: normalizeExocorpseEntriesUrls(
        payload.commissions.styles,
        apiBaseUrl
      ),
    },
    heavenSpace: {
      assets: normalizeExocorpseEntriesUrls(
        payload.heavenSpace.assets,
        apiBaseUrl
      ),
      passages: normalizeExocorpseEntriesUrls(
        payload.heavenSpace.passages,
        apiBaseUrl
      ),
      sceneChoices: normalizeExocorpseEntriesUrls(
        payload.heavenSpace.sceneChoices,
        apiBaseUrl
      ),
      scenes: normalizeExocorpseEntriesUrls(
        payload.heavenSpace.scenes,
        apiBaseUrl
      ),
    },
    landing: {
      content: normalizeExocorpseEntriesUrls(
        payload.landing.content,
        apiBaseUrl
      ),
      faqs: normalizeExocorpseEntriesUrls(payload.landing.faqs, apiBaseUrl),
      settings: payload.landing.settings
        ? normalizeExocorpseEntryUrls(payload.landing.settings, apiBaseUrl)
        : null,
    },
    portfolio: {
      art: normalizeExocorpseEntriesUrls(payload.portfolio.art, apiBaseUrl),
      games: normalizeExocorpseEntriesUrls(payload.portfolio.games, apiBaseUrl),
      writing: normalizeExocorpseEntriesUrls(
        payload.portfolio.writing,
        apiBaseUrl
      ),
    },
    reference: {
      entityTags: normalizeExocorpseEntriesUrls(
        payload.reference.entityTags,
        apiBaseUrl
      ),
      mediaAssets: normalizeExocorpseEntriesUrls(
        payload.reference.mediaAssets,
        apiBaseUrl
      ),
      moodboards: normalizeExocorpseEntriesUrls(
        payload.reference.moodboards,
        apiBaseUrl
      ),
      tags: normalizeExocorpseEntriesUrls(payload.reference.tags, apiBaseUrl),
    },
    wiki: {
      characters: normalizeExocorpseEntriesUrls(
        payload.wiki.characters,
        apiBaseUrl
      ),
      events: normalizeExocorpseEntriesUrls(payload.wiki.events, apiBaseUrl),
      factions: normalizeExocorpseEntriesUrls(
        payload.wiki.factions,
        apiBaseUrl
      ),
      locations: normalizeExocorpseEntriesUrls(
        payload.wiki.locations,
        apiBaseUrl
      ),
      stories: normalizeExocorpseEntriesUrls(payload.wiki.stories, apiBaseUrl),
      timelines: normalizeExocorpseEntriesUrls(
        payload.wiki.timelines,
        apiBaseUrl
      ),
      worlds: normalizeExocorpseEntriesUrls(payload.wiki.worlds, apiBaseUrl),
    },
  };
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

export function isExocorpseExternalProjectLoadingData(
  value: ExternalProjectLoadingData | null | undefined
): value is ExocorpseExternalProjectLoadingData {
  return value?.adapter === 'exocorpse';
}

export function getYoolaSingletonSection(
  loadingData: ExternalProjectLoadingData | null | undefined,
  slug: string
) {
  if (!isYoolaExternalProjectLoadingData(loadingData)) {
    return null;
  }

  return loadingData.singletonSections[slug] ?? null;
}

export function getYoolaSectionMarkdown(
  section: YoolaExternalProjectSectionLoadingItem | null | undefined
) {
  if (!section) {
    return null;
  }

  return section.bodyMarkdown?.trim() || section.summary?.trim() || null;
}

export interface EpmClientConfig {
  apiKey?: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  timeout?: number;
}

type ExternalProjectAssetUploadResponse = {
  contentType?: string;
  filename?: string;
  fullPath?: string | null;
  headers?: Record<string, string>;
  path?: string;
  provider?: 'r2' | 'supabase';
  signedUrl?: string;
  token?: string;
};

type ExternalProjectAssetUploadPayload = {
  contentType?: string;
  filename?: string;
  fullPath: string | null;
  headers?: Record<string, string>;
  path: string;
  provider?: 'r2' | 'supabase';
  signedUrl: string;
  token?: string;
};

function parseExternalProjectUploadPayload(
  payload: ExternalProjectAssetUploadResponse
) {
  if (!payload.signedUrl || !payload.path) {
    throw new Error('Missing upload URL payload');
  }

  return {
    contentType: payload.contentType,
    filename: payload.filename,
    fullPath: payload.fullPath ?? null,
    headers: payload.headers,
    path: payload.path,
    provider: payload.provider,
    signedUrl: payload.signedUrl,
    token: payload.token,
  } satisfies ExternalProjectAssetUploadPayload;
}

async function uploadExternalProjectFileWithSignedUrl(
  file: File,
  uploadUrlResult: ExternalProjectAssetUploadPayload,
  fetchImpl: typeof fetch
) {
  const headers: Record<string, string> = {
    ...(uploadUrlResult.headers ?? {}),
  };

  if (!headers['Content-Type']) {
    headers['Content-Type'] =
      uploadUrlResult.contentType || file.type || 'application/octet-stream';
  }

  if (uploadUrlResult.token) {
    headers.Authorization = `Bearer ${uploadUrlResult.token}`;
  }

  let uploadResponse = await fetchImpl(uploadUrlResult.signedUrl, {
    method: 'PUT',
    cache: 'no-store',
    headers,
    body: file,
  });

  if (!uploadResponse.ok) {
    const fallbackHeaders = { ...headers };
    delete fallbackHeaders['Content-Type'];

    uploadResponse = await fetchImpl(uploadUrlResult.signedUrl, {
      method: 'PUT',
      cache: 'no-store',
      headers: fallbackHeaders,
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
  public readonly sync: {
    apply: (
      workspaceId: string,
      manifest: ExternalProjectSyncManifest,
      options?: { force?: boolean }
    ) => Promise<ExternalProjectSyncApplyResult>;
    diff: (
      workspaceId: string,
      manifest: ExternalProjectSyncManifest
    ) => Promise<ExternalProjectSyncDiff>;
    getSnapshot: (workspaceId: string) => Promise<ExternalProjectSyncSnapshot>;
    setup: (
      workspaceId: string,
      options: {
        adapter?: ExternalProjectAdapterKind;
        manifest?: ExternalProjectSyncManifest;
        schema?: ExternalProjectSyncSchema;
      }
    ) => Promise<{
      autoSetup: true;
      binding: WorkspaceExternalProjectBinding;
      createdBinding: boolean;
      createdCanonicalProject: boolean;
    }>;
  };

  constructor(config: EpmClientConfig = {}) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || 'https://tuturuuu.com/api/v1';
    this.fetchImpl = config.fetch || globalThis.fetch;
    this.timeout = config.timeout || 30000;
    this.sync = {
      apply: (workspaceId, manifest, options = {}) =>
        this.applySyncManifest(workspaceId, manifest, options),
      diff: (workspaceId, manifest) =>
        this.diffSyncManifest(workspaceId, manifest),
      getSnapshot: (workspaceId) => this.getSyncSnapshot(workspaceId),
      setup: (workspaceId, options) =>
        this.setupExternalProjectStudio(workspaceId, options),
    };
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

  async getSyncSnapshot(
    workspaceId: string
  ): Promise<ExternalProjectSyncSnapshot> {
    return this.request(
      `/workspaces/${encodeURIComponent(workspaceId)}/external-projects/sync/snapshot`,
      {
        requiresAuth: true,
      }
    );
  }

  async setupExternalProjectStudio(
    workspaceId: string,
    options: {
      adapter?: ExternalProjectAdapterKind;
      manifest?: ExternalProjectSyncManifest;
      schema?: ExternalProjectSyncSchema;
    }
  ): Promise<{
    autoSetup: true;
    binding: WorkspaceExternalProjectBinding;
    createdBinding: boolean;
    createdCanonicalProject: boolean;
  }> {
    return this.request(
      `/workspaces/${encodeURIComponent(workspaceId)}/external-projects/setup`,
      {
        body: JSON.stringify(options),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
        requiresAuth: true,
      }
    );
  }

  async diffSyncManifest(
    workspaceId: string,
    manifest: ExternalProjectSyncManifest
  ): Promise<ExternalProjectSyncDiff> {
    return this.request(
      `/workspaces/${encodeURIComponent(workspaceId)}/external-projects/sync/diff`,
      {
        body: JSON.stringify({ manifest }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
        requiresAuth: true,
      }
    );
  }

  async applySyncManifest(
    workspaceId: string,
    manifest: ExternalProjectSyncManifest,
    options: { force?: boolean } = {}
  ): Promise<ExternalProjectSyncApplyResult> {
    return this.request(
      `/workspaces/${encodeURIComponent(workspaceId)}/external-projects/sync/apply`,
      {
        body: JSON.stringify({
          force: options.force === true,
          manifest,
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
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

  async batchEntries(
    workspaceId: string,
    payload: ExternalProjectEntryBatchPayload
  ): Promise<ExternalProjectEntryBatchResult> {
    return this.request(
      `/workspaces/${encodeURIComponent(workspaceId)}/external-projects/entries/batch`,
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
    const response = await this.request<ExternalProjectAssetUploadResponse>(
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
      contentType:
        options.contentType || file.type || 'application/octet-stream',
      filename: file.name,
      size: options.size ?? file.size,
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
