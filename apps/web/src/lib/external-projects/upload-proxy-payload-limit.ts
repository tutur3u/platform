/**
 * Request-body cap the Web proxy applies to linked-site multipart uploads.
 *
 * The proxy guard caps every other /api body at 512 KiB before the handler
 * runs. Asset and Drive uploads carry the file itself, so they get this larger
 * bound. It leaves room for multipart fields around a 10 MiB file and limits
 * the buffering required to inspect a cloned request body.
 */
export const EXTERNAL_PROJECT_UPLOAD_REQUEST_BYTES = 12 * 1024 * 1024;

const MULTIPART_UPLOAD_PATH =
  /^\/api\/v1\/workspaces\/[^/]+\/external-projects\/(?:assets\/upload-url|storage)\/?$/;

export function externalProjectUploadProxyPayloadLimit(
  method: string,
  pathname: string,
  contentType: string | null
) {
  if (method !== 'POST') return undefined;
  const mediaType = contentType?.split(';', 1)[0]?.trim().toLowerCase();
  if (mediaType !== 'multipart/form-data') return undefined;
  return MULTIPART_UPLOAD_PATH.test(pathname)
    ? EXTERNAL_PROJECT_UPLOAD_REQUEST_BYTES
    : undefined;
}
