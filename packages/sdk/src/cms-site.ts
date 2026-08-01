import {
  CMS_SITE_V1_COLLECTIONS,
  type CmsSiteTemplateMetadataV1,
  type ExternalProjectDeliveryCollection,
  type ExternalProjectDeliveryPayload,
  type ExternalProjectSyncEntry,
  type ExternalProjectSyncManifest,
} from '@tuturuuu/types';

export { CMS_SITE_V1_COLLECTIONS } from '@tuturuuu/types';

export function buildCmsSiteManifest({
  canonicalProjectId = 'cms_site-main',
  entries = [],
  template = { kind: 'standard-site', version: 1 },
}: {
  canonicalProjectId?: string | null;
  entries?: ExternalProjectSyncEntry[];
  template?: CmsSiteTemplateMetadataV1;
} = {}): ExternalProjectSyncManifest {
  return {
    adapter: 'cms_site',
    canonicalProjectId,
    content: { entries },
    schema: {
      collections: CMS_SITE_V1_COLLECTIONS.map(
        ([slug, title, collectionType]) => ({
          collection_type: collectionType,
          slug,
          title,
        })
      ),
    },
    template,
    version: 1,
  };
}

export type CmsSiteDeliveryView = {
  collections: Record<string, ExternalProjectDeliveryCollection>;
  generatedAt: string;
  revision: string;
  template: CmsSiteTemplateMetadataV1;
};

function resolveCmsSiteAssetUrl(assetUrl: string | null, baseUrl: URL | null) {
  if (!assetUrl || !baseUrl) return assetUrl;
  try {
    const directoryBase = new URL(baseUrl);
    if (!directoryBase.pathname.endsWith('/')) {
      directoryBase.pathname = `${directoryBase.pathname}/`;
    }
    return new URL(assetUrl, directoryBase).toString();
  } catch {
    return assetUrl;
  }
}

export function normalizeCmsSiteDelivery(
  payload: ExternalProjectDeliveryPayload,
  publicBaseUrl?: string
): CmsSiteDeliveryView {
  if (payload.adapter !== 'cms_site') {
    throw new Error('Delivery payload is not a CMS site');
  }

  const baseUrl = publicBaseUrl ? new URL(publicBaseUrl) : null;
  const collections = Object.fromEntries(
    payload.collections.map((collection) => [
      collection.slug,
      {
        ...collection,
        entries: collection.entries.map((entry) => ({
          ...entry,
          assets: entry.assets.map((asset) => ({
            ...asset,
            assetUrl: resolveCmsSiteAssetUrl(asset.assetUrl, baseUrl),
          })),
        })),
      },
    ])
  );

  return {
    collections,
    generatedAt: payload.generatedAt,
    revision: payload.revision,
    template: payload.template ?? { kind: 'standard-site', version: 1 },
  };
}
