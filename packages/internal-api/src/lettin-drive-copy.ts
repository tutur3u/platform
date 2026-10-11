import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
} from './client';
import {
  parseSignedUploadPayload,
  uploadFileWithSignedUrl,
  type WorkspaceStorageUploadResult,
  type WorkspaceUploadUrlResponse,
} from './storage';

/** Narrow notebook-copy routes; generic workspace storage audiences stay unchanged. */
export async function uploadLettinNotebookDriveCopy(
  workspaceId: string,
  expectedActor: string,
  file: File,
  options?: InternalApiClientOptions
): Promise<WorkspaceStorageUploadResult> {
  const client = getInternalApiClient(options);
  const endpoint = `/api/v1/workspaces/${encodePathSegment(workspaceId)}/lettin/drive-copy`;
  const payload = await client.json<WorkspaceUploadUrlResponse>(
    `${endpoint}/upload-url`,
    {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expectedActor,
        filename: file.name,
        path: 'Lettin',
        upsert: false,
        contentType: 'application/json',
        size: file.size,
      }),
    }
  );
  const signed = parseSignedUploadPayload(payload);
  if (
    !signed.provider ||
    signed.path !== `Lettin/${file.name}` ||
    file.type !== 'application/json' ||
    file.size < 1 ||
    file.size > 10 * 1024 * 1024
  ) {
    throw new Error('Invalid notebook upload authorization');
  }
  return uploadFileWithSignedUrl(
    file,
    signed,
    options?.fetch ?? globalThis.fetch,
    undefined,
    async (result) => {
      try {
        await client.json(`${endpoint}/finalize-upload`, {
          method: 'POST',
          cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            expectedActor,
            path: result.path,
            originalFilename: file.name,
            contentType: 'application/json',
            provider: signed.provider,
          }),
        });
        return { finalize: { success: true } };
      } catch {
        return { finalize: { success: false } };
      }
    }
  );
}
