import type { ExternalProjectDeliveryPayload, Json } from '@tuturuuu/types';
import type { ResolvedWorkspaceDomain } from './resolve';

/**
 * Published site content for the edge Worker. A strict allowlist of fields
 * from the External Projects delivery payload: published entries only, no
 * profile data, entry metadata, relations, storage paths or drafts.
 */
export interface PublicSiteBlock {
  id: string;
  block_type: string;
  title: string | null;
  sort_order: number;
  content: Json;
}
export interface PublicSiteAsset {
  id: string;
  asset_type: string;
  assetUrl: string | null;
  alt_text: string | null;
  sort_order: number;
}
export interface PublicSiteEntry {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  summary: string | null;
  blocks: PublicSiteBlock[];
  assets: PublicSiteAsset[];
}
export interface PublicSiteCollection {
  id: string;
  slug: string;
  title: string;
  collection_type: string | null;
  description: string | null;
  entries: PublicSiteEntry[];
}
export interface PublicSitePayload {
  workspace: { wsId: string; name: string; avatarUrl: string | null };
  revision: string;
  collections: PublicSiteCollection[];
}

/**
 * Delivery asset URLs are app-relative (`/api/v1/...`); on a custom domain
 * they must point back at the app origin. Only https URLs are kept.
 */
function absoluteAssetUrl(value: string | null | undefined, origin: string) {
  if (!value) return null;
  try {
    const url = new URL(value, origin);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export function toPublicSitePayload(
  workspace: ResolvedWorkspaceDomain,
  payload: ExternalProjectDeliveryPayload,
  assetOrigin: string
): PublicSitePayload {
  return {
    workspace: {
      wsId: workspace.wsId,
      name: workspace.name,
      avatarUrl: workspace.avatarUrl,
    },
    revision: payload.revision,
    collections: payload.collections.map((collection) => ({
      id: collection.id,
      slug: collection.slug,
      title: collection.title,
      collection_type: collection.collection_type ?? null,
      description: collection.description ?? null,
      entries: collection.entries
        .filter((entry) => entry.status === 'published')
        .map((entry) => ({
          id: entry.id,
          slug: entry.slug,
          title: entry.title,
          subtitle: entry.subtitle ?? null,
          summary: entry.summary ?? null,
          blocks: entry.blocks.map((block) => ({
            id: block.id,
            block_type: block.block_type,
            title: block.title ?? null,
            sort_order: block.sort_order,
            content: block.content,
          })),
          assets: entry.assets.map((asset) => ({
            id: asset.id,
            asset_type: asset.asset_type,
            assetUrl: absoluteAssetUrl(asset.assetUrl, assetOrigin),
            alt_text: asset.alt_text ?? null,
            sort_order: asset.sort_order,
          })),
        })),
    })),
  };
}

export interface WorkspaceDomainSiteDeps {
  resolve: (host: string | null) => Promise<ResolvedWorkspaceDomain | null>;
  /** Published-only delivery payload, or null when the workspace has no site. */
  publishedPayload: (
    wsId: string
  ) => Promise<ExternalProjectDeliveryPayload | null>;
  /** Origin that serves delivery assets, e.g. https://tuturuuu.com. */
  assetOrigin: string;
}

/** Published content for an active, entitled domain; null otherwise. */
export async function buildWorkspaceDomainSite(
  deps: WorkspaceDomainSiteDeps,
  host: string | null
): Promise<PublicSitePayload | null> {
  const workspace = await deps.resolve(host);
  if (!workspace?.siteAvailable) return null;
  const payload = await deps.publishedPayload(workspace.wsId);
  return payload
    ? toPublicSitePayload(workspace, payload, deps.assetOrigin)
    : null;
}
