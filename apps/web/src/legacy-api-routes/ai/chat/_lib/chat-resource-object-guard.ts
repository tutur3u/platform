import {
  AI_CHAT_ATTACHMENT_EXTENSIONS,
  AI_CHAT_ATTACHMENT_SIGNATURE_BYTES,
  aiChatAttachmentExtension,
  inspectAiChatAttachment,
  MAX_AI_CHAT_UPLOAD_BYTES,
} from '@tuturuuu/ai/chat/attachment-content-guard';
import type { createDynamicAdminClient } from '@tuturuuu/supabase/next/server';

type StorageAdmin = Awaited<ReturnType<typeof createDynamicAdminClient>>;

const HEAD_URL_EXPIRY_SECONDS = 60;
const VERIFY_CONCURRENCY = 4;
const HEAD_READ_TIMEOUT_MS = 5000;

async function readHead(admin: StorageAdmin, path: string) {
  const { data, error } = await admin.storage
    .from('workspaces')
    .createSignedUrl(path, HEAD_URL_EXPIRY_SECONDS);
  if (error || !data?.signedUrl) return null;
  const response = await fetch(data.signedUrl, {
    headers: { Range: `bytes=0-${AI_CHAT_ATTACHMENT_SIGNATURE_BYTES - 1}` },
    signal: AbortSignal.timeout(HEAD_READ_TIMEOUT_MS),
  });
  if (!response.ok || !response.body) return null;
  // Read only the signature bytes, even if a proxy ignores the Range header.
  const reader = response.body.getReader();
  const head = new Uint8Array(AI_CHAT_ATTACHMENT_SIGNATURE_BYTES);
  let length = 0;
  try {
    while (length < head.length) {
      const { done, value } = await reader.read();
      if (done) break;
      const take = Math.min(value.length, head.length - length);
      head.set(value.subarray(0, take), length);
      length += take;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return head.subarray(0, length);
}

async function verifyObject(
  admin: StorageAdmin,
  path: string,
  knownSize: number | undefined
): Promise<'valid' | 'rejected' | 'unavailable'> {
  let sizeBytes = knownSize;
  if (sizeBytes === undefined) {
    const info = await admin.storage.from('workspaces').info(path);
    if (info.error || typeof info.data?.size !== 'number') return 'unavailable';
    sizeBytes = info.data.size;
  }
  const fileName = path.split('/').at(-1) ?? '';
  // upload-url only signs allowlisted extensions, so any other object came from
  // a trusted server writer: admit it within the size cap, never delete it.
  if (!AI_CHAT_ATTACHMENT_EXTENSIONS.has(aiChatAttachmentExtension(fileName))) {
    return sizeBytes <= MAX_AI_CHAT_UPLOAD_BYTES ? 'valid' : 'unavailable';
  }
  // Size alone fails an oversized upload; no read needed.
  if (sizeBytes > MAX_AI_CHAT_UPLOAD_BYTES) return 'rejected';
  const head = sizeBytes === 0 ? new Uint8Array() : await readHead(admin, path);
  if (!head) return 'unavailable';
  return inspectAiChatAttachment({ fileName, head, sizeBytes }).ok
    ? 'valid'
    : 'rejected';
}

/**
 * Signed upload URLs cannot bound size or content, so an uploaded object only
 * becomes readable once its stored size and leading bytes match its extension.
 * Client-uploadable objects that fail are deleted; ones that cannot be
 * inspected stay unreadable. Other extensions only need to fit the size cap.
 */
export async function verifyAiChatStoredObjects({
  admin,
  objects,
}: {
  admin: StorageAdmin;
  objects: { path: string; sizeBytes?: number }[];
}): Promise<Map<string, 'valid' | 'rejected' | 'unavailable'>> {
  const verdicts = new Map<string, 'valid' | 'rejected' | 'unavailable'>();
  let next = 0;
  await Promise.all(
    Array.from(
      { length: Math.min(VERIFY_CONCURRENCY, objects.length) },
      async () => {
        while (next < objects.length) {
          const object = objects[next++]!;
          try {
            verdicts.set(
              object.path,
              await verifyObject(admin, object.path, object.sizeBytes)
            );
          } catch {
            verdicts.set(object.path, 'unavailable');
          }
        }
      }
    )
  );

  const rejected = [...verdicts]
    .filter(([, verdict]) => verdict === 'rejected')
    .map(([path]) => path);
  if (rejected.length) {
    const { error } = await admin.storage.from('workspaces').remove(rejected);
    if (error) {
      console.error('Failed to remove rejected AI chat uploads', {
        count: rejected.length,
        error,
      });
    }
  }
  return verdicts;
}
