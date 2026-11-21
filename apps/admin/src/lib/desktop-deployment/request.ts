import { z } from 'zod';
import { DesktopAdminStoreError } from './store';

const revision = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const version = { versionId: z.uuid(), revision };
export const DesktopMutationSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('create_version'),
      platform: z.enum(['windows', 'macos']),
    })
    .strict(),
  z
    .object({
      action: z.literal('save_scalar'),
      ...version,
      name: z.string().max(80),
      value: z.string().min(1).max(32768),
    })
    .strict(),
  z
    .object({
      action: z.literal('remove_resource'),
      ...version,
      name: z.string().max(80),
    })
    .strict(),
  z.object({ action: z.literal('validate'), ...version }).strict(),
  z.object({ action: z.literal('activate'), ...version }).strict(),
  z
    .object({
      action: z.literal('create_token'),
      versionId: z.uuid(),
      expiresAt: z.iso.datetime({ offset: true }),
    })
    .strict(),
  z.object({ action: z.literal('revoke_token'), tokenId: z.uuid() }).strict(),
  z
    .object({
      action: z.literal('disable_delivery'),
      platform: z.enum(['windows', 'macos']),
      environmentRevision: revision,
    })
    .strict(),
  z
    .object({
      action: z.literal('enable_delivery'),
      platform: z.enum(['windows', 'macos']),
      environmentRevision: revision,
      ...version,
    })
    .strict(),
]);

/** Enforce actual streamed bytes; Content-Length alone does not bound uploads. */
export async function readDesktopBody(
  request: Request,
  maximum: number
): Promise<Buffer> {
  const reader = request.body?.getReader();
  if (!reader) throw new DesktopAdminStoreError(400, 'desktop_request_invalid');
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) return Buffer.concat(chunks, size);
      const bytes = Buffer.from(chunk.value);
      chunks.push(bytes);
      size += bytes.length;
      if (size > maximum) {
        await reader.cancel();
        throw new DesktopAdminStoreError(413, 'desktop_request_too_large');
      }
    }
  } finally {
    reader.releaseLock();
    for (const chunk of chunks) chunk.fill(0);
  }
}
