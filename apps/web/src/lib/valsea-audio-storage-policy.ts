import {
  deleteWorkspaceStorageObjectByPath,
  getWorkspaceStorageObjectMetadataForProvider,
  resolveWorkspaceStorageProvider,
  WorkspaceStorageError,
} from './workspace-storage-provider';

export const MAX_VALSEA_AUDIO_UPLOAD_BYTES = 10 * 1024 * 1024;
export const VALSEA_AUDIO_DRIVE_PATH = 'education/valsea/audio';
export const VALSEA_AUDIO_EXTENSIONS = new Set([
  'flac',
  'm4a',
  'mp3',
  'mp4',
  'mpeg',
  'oga',
  'ogg',
  'wav',
  'webm',
]);

type ValseaAudioStorageValidationResult =
  | { ok: true }
  | { ok: false; message: string; status: number };

export function isValseaAudioStoragePath(path: string) {
  return (
    path === VALSEA_AUDIO_DRIVE_PATH ||
    path.startsWith(`${VALSEA_AUDIO_DRIVE_PATH}/`)
  );
}

export function validateValseaAudioSize(
  size: number | undefined
): ValseaAudioStorageValidationResult {
  if (size === undefined || !Number.isFinite(size) || !Number.isInteger(size)) {
    return {
      ok: false,
      message: 'A valid audio file size is required',
      status: 400,
    };
  }

  if (size <= 0) {
    return {
      ok: false,
      message: 'Audio file is empty',
      status: 400,
    };
  }

  if (size > MAX_VALSEA_AUDIO_UPLOAD_BYTES) {
    return {
      ok: false,
      message: 'Audio file must be 10 MB or smaller',
      status: 413,
    };
  }

  return { ok: true };
}

export async function validateFinalizedValseaAudioUpload({
  path,
  wsId,
}: {
  path: string;
  wsId: string;
}): Promise<ValseaAudioStorageValidationResult> {
  if (!isValseaAudioStoragePath(path)) {
    return { ok: true };
  }

  try {
    const { provider } = await resolveWorkspaceStorageProvider(wsId);
    const metadata = await getWorkspaceStorageObjectMetadataForProvider(
      wsId,
      provider,
      path
    );
    const validation = validateValseaAudioSize(metadata.size);

    if (!validation.ok) {
      await deleteWorkspaceStorageObjectByPath(wsId, path);
    }

    return validation;
  } catch (error) {
    if (error instanceof WorkspaceStorageError) {
      return {
        ok: false,
        message: error.message,
        status: error.status,
      };
    }

    throw error;
  }
}
