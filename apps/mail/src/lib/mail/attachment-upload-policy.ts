/** Draft files retain the repository's 10 MiB per-file and aggregate limit. */
export const MAIL_ATTACHMENT_FILE_BYTES = 10 * 1024 * 1024;

/** Multipart boundaries and the bounded filename/content-ID metadata need room. */
export const MAIL_ATTACHMENT_MULTIPART_BYTES = 64 * 1024;

export const MAIL_ATTACHMENT_REQUEST_BYTES =
  MAIL_ATTACHMENT_FILE_BYTES + MAIL_ATTACHMENT_MULTIPART_BYTES;

const draftAttachmentUploadPath =
  /^\/api\/v1\/workspaces\/[A-Za-z0-9_-]+\/mail\/mailboxes\/[A-Za-z0-9_-]+\/drafts\/[A-Za-z0-9_-]+\/attachments$/u;

/** nextUrl.pathname is app-relative after NextRequest applies its basePath. */
export function mailAttachmentUploadPayloadPolicy(request: {
  method: string;
  nextUrl: { pathname: string };
}): { maxPayloadBytes?: number } {
  return request.method === 'POST' &&
    draftAttachmentUploadPath.test(request.nextUrl.pathname)
    ? { maxPayloadBytes: MAIL_ATTACHMENT_REQUEST_BYTES }
    : {};
}
