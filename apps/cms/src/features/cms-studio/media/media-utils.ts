import type {
  WorkspaceExternalProjectMediaItem,
  WorkspaceExternalProjectMediaType,
} from '@tuturuuu/internal-api';

export function getMediaType(
  asset: Pick<WorkspaceExternalProjectMediaItem, 'asset_type'>
): Exclude<WorkspaceExternalProjectMediaType, 'all'> {
  if (asset.asset_type.toLowerCase() === 'image') return 'image';
  if (asset.asset_type.toLowerCase() === 'audio') return 'audio';
  return 'other';
}

export function getMediaName(
  asset: Pick<
    WorkspaceExternalProjectMediaItem,
    'asset_type' | 'source_url' | 'storage_path'
  >
) {
  const source = asset.storage_path || asset.source_url || '';
  const segment = source.split(/[/?#]/).filter(Boolean).pop();
  if (!segment) return asset.asset_type;

  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}
