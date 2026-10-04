import {
  EXOCORPSE_WORKSPACE_ID,
  type LettinNode,
} from '@tuturuuu/internal-api/lettin';
import { readExocorpseAssetPath } from '@tuturuuu/internal-api/lettin-server';
import {
  WORKSPACE_STORAGE_PROVIDER_OPTIONS,
  type WorkspaceStorageProvider,
} from '@tuturuuu/storage-core/workspace-storage-config';
import {
  downloadWorkspaceStorageObjectForProvider,
  resolveWorkspaceStorageProvider,
} from '@tuturuuu/storage-core/workspace-storage-provider';
import type { Actor } from './context';
import { LettinError } from './context';
import type { ImportPlan } from './import-plan';
import { mediaTypes } from './media';

export type ImportMedia = { id: string; path: string };
export type PreparedImport = {
  plan: ImportPlan;
  media: ImportMedia[];
  cleanup: () => Promise<void>;
};
export async function prepareImportMedia(
  bucket: R2Bucket,
  actor: Actor,
  worldId: string,
  source: ImportPlan
): Promise<PreparedImport> {
  const plan = structuredClone(source);
  const media: ImportMedia[] = [];
  const replacements = new Map<string, string>();
  const cleanup = async () => {
    for (const item of media) await bucket.delete(item.path);
  };
  const copy = async (url: string) => {
    if (replacements.has(url)) return replacements.get(url)!;
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return url;
    }
    const prefix = `/api/v1/workspaces/${EXOCORPSE_WORKSPACE_ID}/external-projects/assets/`;
    if (
      parsed.origin !== 'https://tuturuuu.com' ||
      !parsed.pathname.startsWith(prefix)
    )
      return url;
    const assetId = parsed.pathname.slice(prefix.length);
    if (!/^[0-9a-f-]{36}$/.test(assetId))
      throw new LettinError(400, 'Invalid source artwork');
    const asset = await readExocorpseAssetPath(assetId);
    const storage = await resolveWorkspaceStorageProvider(
      EXOCORPSE_WORKSPACE_ID
    );
    if (storage.misconfigured)
      throw new LettinError(503, 'Source storage unavailable');
    const metadata =
      asset.metadata &&
      typeof asset.metadata === 'object' &&
      !Array.isArray(asset.metadata)
        ? asset.metadata
        : {};
    const declared =
      typeof metadata.provider === 'string' &&
      WORKSPACE_STORAGE_PROVIDER_OPTIONS.includes(
        metadata.provider as WorkspaceStorageProvider
      )
        ? (metadata.provider as WorkspaceStorageProvider)
        : storage.provider;
    let object: { buffer: Uint8Array; contentType?: string | null } | undefined;
    for (const provider of new Set([
      declared,
      storage.provider,
      ...WORKSPACE_STORAGE_PROVIDER_OPTIONS,
    ])) {
      try {
        object = await downloadWorkspaceStorageObjectForProvider(
          EXOCORPSE_WORKSPACE_ID,
          provider,
          asset.storage_path!
        );
        break;
      } catch {
        /* Legacy assets may still be stored on an earlier workspace provider. */
      }
    }
    if (!object) throw new LettinError(503, 'Source artwork unavailable');
    const type = object.contentType?.split(';')[0]?.trim() ?? '';
    if (
      !mediaTypes.has(type) ||
      !object.buffer.length ||
      object.buffer.length > 10 * 1024 * 1024
    )
      throw new LettinError(400, 'Unsupported source artwork');
    const id = crypto.randomUUID();
    const path = `${actor.wsId}/${worldId}/${id}`;
    await bucket.put(path, object.buffer, {
      httpMetadata: { contentType: type, cacheControl: 'private, no-store' },
    });
    media.push({ id, path });
    const target = `/api/v1/lettin/media/${id}`;
    replacements.set(url, target);
    return target;
  };
  const visit = async (node: LettinNode) => {
    if (typeof node.attrs?.src === 'string')
      node.attrs.src = await copy(node.attrs.src);
    for (const child of node.content ?? []) await visit(child);
  };
  try {
    for (const draft of [
      plan.world,
      ...plan.entries.map((entry) => entry.draft),
    ]) {
      draft.image = await copy(draft.image);
      await visit(draft.content);
    }
    return { plan, media, cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
