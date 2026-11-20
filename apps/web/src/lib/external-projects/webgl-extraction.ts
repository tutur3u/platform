import { createHmac, timingSafeEqual } from 'node:crypto';
import { sanitizePathSegments } from '@tuturuuu/utils/storage-path';
import { z } from 'zod';

const callbackLifetimeSeconds = 15 * 60;
const revisionId = /^[0-9a-f-]{36}$/;

export function isWebglExtractionRoot(path: string) {
  const segments = sanitizePathSegments(path);
  return (
    segments?.[0] === 'external-projects' &&
    segments.at(-3) === 'webgl-packages' &&
    segments.at(-2) === '_revisions' &&
    revisionId.test(segments.at(-1) ?? '')
  );
}

function sign(
  secret: string,
  workspaceId: string,
  root: string,
  expires: number
) {
  return createHmac('sha256', secret)
    .update(
      JSON.stringify(['cms-webgl-extract-v1', workspaceId, root, expires])
    )
    .digest();
}

export function webglExtractionCallbackToken(
  secret: string,
  workspaceId: string,
  root: string
) {
  const expires = Math.floor(Date.now() / 1000) + callbackLifetimeSeconds;
  return `${expires}.${sign(secret, workspaceId, root, expires).toString('hex')}`;
}

export function webglExtractionAllows(
  secret: string,
  token: string | null,
  workspaceId: string,
  root: string,
  path: string
) {
  if (
    !isWebglExtractionRoot(root) ||
    !sanitizePathSegments(path) ||
    !path.startsWith(`${root}/`)
  )
    return false;
  const parsed = /^(\d{10})\.([0-9a-f]{64})$/.exec(token ?? '');
  if (!parsed) return false;
  const expires = Number(parsed[1]);
  const now = Math.floor(Date.now() / 1000);
  return (
    expires > now &&
    expires <= now + callbackLifetimeSeconds &&
    timingSafeEqual(
      Buffer.from(parsed[2]!, 'hex'),
      sign(secret, workspaceId, root, expires)
    )
  );
}

export const webglExtractedInventorySchema = z.object({
  files: z.number().int().positive().max(2000),
  folders: z.number().int().nonnegative().optional(),
  message: z.string().optional(),
  inventory: z
    .array(
      z.object({
        path: z.string().max(1024),
        contentType: z.string().max(255),
        size: z.number().int().nonnegative(),
        sha256: z.string().regex(/^[0-9a-f]{64}$/),
      })
    )
    .min(1)
    .max(2000),
});
