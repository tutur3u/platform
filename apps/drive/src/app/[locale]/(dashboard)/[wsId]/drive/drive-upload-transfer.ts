import {
  createWorkspaceStorageUploadUrl,
  finalizeWorkspaceStorageUpload,
} from '@tuturuuu/internal-api';
import {
  DriveUploadNetworkError,
  DriveUploadProviderError,
} from './drive-upload-queue';

type UploadTarget = Awaited<ReturnType<typeof createWorkspaceStorageUploadUrl>>;

export class DriveUploadAbortedError extends Error {
  constructor() {
    super('Upload canceled');
    this.name = 'DriveUploadAbortedError';
  }
}

function putFile(
  file: File,
  target: UploadTarget,
  headers: Record<string, string>,
  signal: AbortSignal,
  onProgress: (loaded: number) => void
) {
  return new Promise<void>((resolve, reject) => {
    // A cancel can land between a refused attempt and its retry.
    if (signal.aborted) return reject(new DriveUploadAbortedError());
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    signal.addEventListener('abort', abort, { once: true });
    const settle = (error?: Error) => {
      signal.removeEventListener('abort', abort);
      if (error) reject(error);
      else resolve();
    };

    xhr.upload.onprogress = (event) => onProgress(event.loaded);
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? settle()
        : settle(new DriveUploadProviderError(xhr.status));
    xhr.onerror = () => settle(new DriveUploadNetworkError());
    xhr.onabort = () => settle(new DriveUploadAbortedError());

    xhr.open('PUT', target.signedUrl);
    for (const [key, value] of Object.entries(headers)) {
      xhr.setRequestHeader(key, value);
    }
    xhr.send(file);
  });
}

/** Only a 400 or 415 can mean the signed upload refused the Content-Type. */
export function isContentTypeRejection(error: unknown) {
  return (
    error instanceof DriveUploadProviderError &&
    (error.status === 400 || error.status === 415)
  );
}

/**
 * The Drive upload chain (upload-url, signed PUT, finalize-upload) with
 * per-file progress and cancellation. Mirrors uploadWorkspaceStorageFile,
 * which has no abort signal.
 */
export async function transferDriveUpload({
  file,
  onFinalizing,
  onProgress,
  path,
  signal,
  wsId,
}: {
  file: File;
  onFinalizing: () => void;
  onProgress: (loaded: number) => void;
  path: string;
  signal: AbortSignal;
  wsId: string;
}) {
  const contentType = file.type || 'application/octet-stream';
  const target = await createWorkspaceStorageUploadUrl(
    wsId,
    file.name,
    { path: path || undefined, size: file.size, contentType },
    { fetch }
  );
  if (signal.aborted) throw new DriveUploadAbortedError();

  const headers: Record<string, string> = { ...(target.headers ?? {}) };
  if (!headers['Content-Type']) {
    headers['Content-Type'] = target.contentType || contentType;
  }
  if (target.token) headers.Authorization = `Bearer ${target.token}`;

  try {
    await putFile(file, target, headers, signal, onProgress);
  } catch (error) {
    if (!isContentTypeRejection(error)) throw error;
    // Some providers reject an explicit Content-Type on signed uploads.
    const { 'Content-Type': _ignored, ...fallbackHeaders } = headers;
    await putFile(file, target, fallbackHeaders, signal, onProgress);
  }

  onFinalizing();
  // The object is stored once the PUT succeeds; finalize only runs
  // post-processing such as archive extraction, so its failure is not an
  // upload failure.
  await finalizeWorkspaceStorageUpload(
    wsId,
    { path: target.path, contentType, originalFilename: file.name },
    { fetch }
  ).catch((error: unknown) => {
    console.warn('Drive upload finalize failed', error);
  });
}
