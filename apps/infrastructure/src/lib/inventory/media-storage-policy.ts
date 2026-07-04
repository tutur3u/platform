import type { WorkspaceStorageProvider } from '../workspace-storage-config';
import {
  deleteWorkspaceStorageObjectByPath,
  downloadWorkspaceStorageObjectForProvider,
  getWorkspaceStorageObjectMetadataForProvider,
  resolveWorkspaceStorageProvider,
  WorkspaceStorageError,
} from '../workspace-storage-provider';

export const MAX_INVENTORY_IMAGE_BYTES = 8 * 1024 * 1024;
export const INVENTORY_IMAGE_CONTENT_TYPES = [
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;
export const INVENTORY_MEDIA_TARGETS = [
  'bundle-image',
  'listing-image',
  'product-featured-image',
  'storefront-banner',
  'storefront-cover',
  'storefront-hero',
] as const;

type InventoryImageContentType = (typeof INVENTORY_IMAGE_CONTENT_TYPES)[number];

type InventoryMediaValidationResult =
  | { ok: true; contentType: InventoryImageContentType }
  | { ok: false; message: string; status: number };

export function isInventoryImageContentType(
  contentType: string | null | undefined
): contentType is InventoryImageContentType {
  return INVENTORY_IMAGE_CONTENT_TYPES.includes(
    contentType as InventoryImageContentType
  );
}

export function isInventoryMediaPath(path: string) {
  const parts = path.split('/');
  const target = parts[2];
  const filename = parts[3] ?? '';

  return (
    parts.length === 4 &&
    parts[0] === 'inventory' &&
    parts[1] === 'media' &&
    target !== undefined &&
    INVENTORY_MEDIA_TARGETS.includes(
      target as (typeof INVENTORY_MEDIA_TARGETS)[number]
    ) &&
    filename.trim().length > 0 &&
    !parts.includes('..')
  );
}

function validationError(
  message: string,
  status: number
): InventoryMediaValidationResult {
  return { ok: false, message, status };
}

function validateInventoryImageSize(size: number | undefined) {
  if (size === undefined || !Number.isFinite(size) || !Number.isInteger(size)) {
    return validationError('A valid inventory image size is required', 400);
  }

  if (size <= 0) {
    return validationError('Inventory image is empty', 400);
  }

  if (size > MAX_INVENTORY_IMAGE_BYTES) {
    return validationError('Inventory image must be 8 MB or smaller', 413);
  }

  return { ok: true as const };
}

export function detectInventoryImageContentType(
  bytes: Uint8Array
): InventoryImageContentType | null {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return 'image/jpeg';
  }

  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png';
  }

  if (
    bytes.length >= 6 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38 &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) &&
    bytes[5] === 0x61
  ) {
    return 'image/gif';
  }

  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp';
  }

  return null;
}

async function deleteInvalidInventoryMedia(wsId: string, path: string) {
  await deleteWorkspaceStorageObjectByPath(wsId, path);
}

export async function validateFinalizedInventoryMediaUpload({
  path,
  provider,
  wsId,
}: {
  path: string;
  provider?: WorkspaceStorageProvider;
  wsId: string;
}): Promise<InventoryMediaValidationResult> {
  if (!isInventoryMediaPath(path)) {
    return validationError('Path must point to inventory media', 400);
  }

  try {
    const resolvedProvider =
      provider ?? (await resolveWorkspaceStorageProvider(wsId)).provider;
    const metadata = await getWorkspaceStorageObjectMetadataForProvider(
      wsId,
      resolvedProvider,
      path
    );
    const sizeValidation = validateInventoryImageSize(metadata.size);

    if (!sizeValidation.ok) {
      await deleteInvalidInventoryMedia(wsId, path);
      return sizeValidation;
    }

    if (
      metadata.contentType &&
      !isInventoryImageContentType(metadata.contentType)
    ) {
      await deleteInvalidInventoryMedia(wsId, path);
      return validationError(
        'Inventory media content type must be an image',
        415
      );
    }

    const object = await downloadWorkspaceStorageObjectForProvider(
      wsId,
      resolvedProvider,
      path
    );
    const detectedContentType = detectInventoryImageContentType(object.buffer);

    if (!detectedContentType) {
      await deleteInvalidInventoryMedia(wsId, path);
      return validationError(
        'Inventory media upload must be a valid image',
        415
      );
    }

    if (object.buffer.byteLength !== metadata.size) {
      await deleteInvalidInventoryMedia(wsId, path);
      return validationError(
        'Inventory image size does not match metadata',
        400
      );
    }

    if (metadata.contentType && metadata.contentType !== detectedContentType) {
      await deleteInvalidInventoryMedia(wsId, path);
      return validationError(
        'Inventory media content type does not match uploaded bytes',
        415
      );
    }

    return { ok: true, contentType: detectedContentType };
  } catch (error) {
    if (error instanceof WorkspaceStorageError) {
      return validationError(error.message, error.status);
    }

    throw error;
  }
}
