import 'server-only';

import { createHash } from 'node:crypto';
import type { Message as SdkMessage, SentMessage } from '@tuturuuu/ai/chat-sdk';
import { uploadWorkspaceStorageFileDirect } from '@tuturuuu/storage-core/workspace-storage-provider';

const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
const MAX_ATTACHMENTS_PER_MESSAGE = 10;

export interface MirroredExternalAttachment {
  contentType: string | null;
  filename: string;
  fullPath: string | null;
  id: string;
  sizeBytes: number | null;
  storagePath: string;
}

export async function mirrorExternalMessageAttachments({
  adapter,
  channelId,
  externalMessageId,
  externalThreadId,
  message,
  wsId,
}: {
  adapter: string;
  channelId: string;
  externalMessageId: string;
  externalThreadId: string;
  message: SdkMessage | SentMessage;
  wsId: string;
}) {
  const mirrored: MirroredExternalAttachment[] = [];

  for (const [index, attachment] of (message.attachments ?? [])
    .slice(0, MAX_ATTACHMENTS_PER_MESSAGE)
    .entries()) {
    if (attachment.size && attachment.size > MAX_ATTACHMENT_BYTES) continue;

    try {
      const bytes = await readAttachmentBytes(attachment);
      if (!bytes || bytes.byteLength > MAX_ATTACHMENT_BYTES) continue;

      const filename = normalizeFilename(
        attachment.name || `${adapter}-${attachment.type}-${index + 1}`
      );
      const storagePath = buildStoragePath({
        adapter,
        channelId,
        externalMessageId,
        externalThreadId,
        filename,
        index,
      });
      const contentType = normalizeContentType(attachment.mimeType);
      const uploaded = await uploadWorkspaceStorageFileDirect(
        wsId,
        storagePath,
        bytes,
        {
          contentType: contentType ?? undefined,
          upsert: true,
        }
      );

      mirrored.push({
        contentType,
        filename,
        fullPath: uploaded.fullPath,
        id: deterministicAttachmentId(
          externalThreadId,
          externalMessageId,
          index
        ),
        sizeBytes: bytes.byteLength,
        storagePath: uploaded.path,
      });
    } catch (error) {
      console.warn('External chat attachment mirror skipped', {
        adapter,
        channelId,
        error: error instanceof Error ? error.message : String(error),
        index,
      });
    }
  }

  return mirrored;
}

async function readAttachmentBytes(
  attachment: (SdkMessage | SentMessage)['attachments'][number]
) {
  if (attachment.data instanceof Buffer) {
    return new Uint8Array(attachment.data);
  }
  if (attachment.data instanceof Blob) {
    return new Uint8Array(await attachment.data.arrayBuffer());
  }
  if (attachment.fetchData) {
    return new Uint8Array(await attachment.fetchData());
  }
  if (!attachment.url) return null;

  const response = await fetch(attachment.url, {
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`external_attachment_fetch_failed_${response.status}`);
  }

  const declaredSize = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredSize) && declaredSize > MAX_ATTACHMENT_BYTES) {
    throw new Error('external_attachment_too_large');
  }

  return new Uint8Array(await response.arrayBuffer());
}

function buildStoragePath({
  adapter,
  channelId,
  externalMessageId,
  externalThreadId,
  filename,
  index,
}: {
  adapter: string;
  channelId: string;
  externalMessageId: string;
  externalThreadId: string;
  filename: string;
  index: number;
}) {
  const threadHash = shortHash(externalThreadId);
  const messageHash = shortHash(externalMessageId);
  return [
    'AI Agent Imports',
    normalizeSegment(adapter),
    normalizeSegment(channelId),
    threadHash,
    `${messageHash}-${index + 1}-${filename}`,
  ].join('/');
}

function deterministicAttachmentId(
  externalThreadId: string,
  externalMessageId: string,
  index: number
) {
  const hash = createHash('sha256')
    .update(`${externalThreadId}:${externalMessageId}:${index}`)
    .digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(
    13,
    16
  )}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

function shortHash(value: string) {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

function normalizeFilename(value: string) {
  const normalized = value
    .normalize('NFKC')
    .replace(/[\\/:*?"<>|]/gu, '-')
    .split('')
    .map((character) => (character.charCodeAt(0) < 32 ? '-' : character))
    .join('')
    .replace(/\s+/gu, ' ')
    .trim();
  return (normalized || 'attachment.bin').slice(0, 180);
}

function normalizeSegment(value: string) {
  return value
    .normalize('NFKC')
    .replace(/[^a-zA-Z0-9._-]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 80);
}

function normalizeContentType(value?: string) {
  if (!value || value.endsWith('/*')) return null;
  return value.split(';', 1)[0]?.trim().toLowerCase() || null;
}
