import type {
  ExternalProjectEntry,
  ExternalProjectStudioAsset,
  Json,
} from '@tuturuuu/types';
import type {
  CmsSupportedEntryAssetType,
  getCollectionFieldDefinitions,
} from '../../cms-content-model';
import type { EntryDetailUploadProgressItem } from './entry-detail-upload-progress';

export function getUploadProgressId(
  scope: EntryDetailUploadProgressItem['scope'],
  file: File,
  index = 0
) {
  return `${scope}:${file.name}:${file.size}:${file.lastModified}:${index}`;
}

export function clampUploadPercent(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export const AUDIO_UPLOAD_MIME_TYPES = [
  'audio/aac',
  'audio/flac',
  'audio/m4a',
  'audio/mp4',
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
  'audio/webm',
  'audio/x-m4a',
  'audio/x-wav',
];

export const AUDIO_UPLOAD_EXTENSIONS = [
  '.aac',
  '.flac',
  '.m4a',
  '.mp3',
  '.mp4',
  '.oga',
  '.ogg',
  '.wav',
  '.webm',
];

export function getFilenameExtension(filename: string) {
  const normalized = filename.toLowerCase();
  const index = normalized.lastIndexOf('.');
  return index === -1 ? '' : normalized.slice(index);
}

export function getMediaInputAccept(assetTypes: CmsSupportedEntryAssetType[]) {
  const accept = new Set<string>();

  if (assetTypes.includes('image')) {
    accept.add('image/*');
  }

  if (assetTypes.includes('audio')) {
    AUDIO_UPLOAD_MIME_TYPES.forEach((type) => {
      accept.add(type);
    });
    AUDIO_UPLOAD_EXTENSIONS.forEach((extension) => {
      accept.add(extension);
    });
  }

  return [...accept].join(',');
}

export function resolveUploadAssetType(
  file: File,
  supportedAssetTypes: CmsSupportedEntryAssetType[]
): CmsSupportedEntryAssetType | null {
  const extension = getFilenameExtension(file.name);

  if (
    supportedAssetTypes.includes('image') &&
    (file.type.startsWith('image/') ||
      ['.avif', '.gif', '.jpeg', '.jpg', '.png', '.svg', '.webp'].includes(
        extension
      ))
  ) {
    return 'image';
  }

  if (
    supportedAssetTypes.includes('audio') &&
    (file.type.startsWith('audio/') ||
      AUDIO_UPLOAD_EXTENSIONS.includes(extension))
  ) {
    return 'audio';
  }

  return supportedAssetTypes.length === 1
    ? (supportedAssetTypes[0] ?? null)
    : null;
}

export function getCmsPublicWebglPlayerPath(
  pathname: string,
  input: {
    assetId: string;
    workspaceId: string;
  }
) {
  const [firstSegment] = pathname.split('/').filter(Boolean);
  const localePrefix =
    firstSegment === 'en' || firstSegment === 'vi' ? `/${firstSegment}` : '';

  return `${localePrefix}/play/${input.workspaceId}/webgl/${input.assetId}`;
}

export function mergeAssetCaptionMetadata(
  asset: ExternalProjectStudioAsset,
  caption: string
): Json {
  const nextMetadata =
    asset.metadata &&
    typeof asset.metadata === 'object' &&
    !Array.isArray(asset.metadata)
      ? { ...(asset.metadata as Record<string, unknown>) }
      : {};

  if (caption.trim()) {
    nextMetadata.caption = caption.trim();
  } else {
    delete nextMetadata.caption;
  }

  return nextMetadata as Json;
}

export function asProfileDataRecord(
  value: ExternalProjectEntry['profile_data'] | null | undefined
) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function asStringArray(value: unknown) {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
    : [];
}

export function dedupeStrings(values: string[]) {
  return [...new Set(values)];
}

export function normalizeEntryCategory(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizeEntryTags(value: unknown) {
  return dedupeStrings(asStringArray(value));
}

export function normalizeTaxonomyOptions(value: unknown) {
  return dedupeStrings(
    asStringArray(value)
      .map((item) => item.trim())
      .filter(Boolean)
  );
}

export function mergeTaxonomyOptions(current: string[], additions: string[]) {
  return dedupeStrings([
    ...current,
    ...additions.map((value) => value.trim()).filter(Boolean),
  ]);
}

export function parseTaxonomyDraft(value: string) {
  return dedupeStrings(
    value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  );
}

export function areStringArraysEqual(left: string[], right: string[]) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(',')}}`;
  }

  return JSON.stringify(value);
}

export function mergeSchemaFieldValues(
  base: Record<string, unknown>,
  schemaValues: Record<string, unknown>,
  definitions: ReturnType<typeof getCollectionFieldDefinitions>,
  scope: 'metadata' | 'profile_data'
) {
  const next = { ...base };

  for (const definition of definitions) {
    if (definition.field_scope !== scope) {
      continue;
    }

    if (Object.hasOwn(schemaValues, definition.key)) {
      next[definition.key] = schemaValues[definition.key];
    } else {
      delete next[definition.key];
    }
  }

  return next;
}

export function getFeaturedProfileSlugs(
  profileData: Record<string, unknown>,
  keys: string[]
) {
  return dedupeStrings(keys.flatMap((key) => asStringArray(profileData[key])));
}

export function mergeFeaturedProfileData({
  featuredKey,
  nextSlugs,
  profileData,
  resetKeys,
}: {
  featuredKey: string;
  nextSlugs: string[];
  profileData: Record<string, unknown>;
  resetKeys: string[];
}) {
  const nextProfileData = { ...profileData };

  for (const key of resetKeys) {
    delete nextProfileData[key];
  }

  if (nextSlugs.length > 0) {
    nextProfileData[featuredKey] = nextSlugs;
  }

  return nextProfileData;
}
