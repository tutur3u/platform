import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { FilePart, ImagePart, ModelMessage, TextPart } from 'ai';
import type { ChatAttachmentMetadata } from '../chat-attachment-metadata';

type ResolvedChatFile = {
  content: string | ArrayBuffer;
  fileName: string;
  introText: string;
  mediaType: string;
};

type ReferencedChatFile = ChatAttachmentMetadata & {
  introText?: string;
};

type ProcessMessagesWithFilesParams = {
  chatFiles: ChatAttachmentMetadata[];
  chatId: string;
  messages: ModelMessage[];
  wsId: string;
};

const FILE_DOWNLOAD_CONCURRENCY = 4;
const MARKITDOWN_RECOMMENDED_MEDIA_TYPES = new Set([
  'application/json',
  'application/msword',
  'application/pdf',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/csv',
  'text/markdown',
  'text/plain',
]);

const INLINE_FILE_MEDIA_TYPES = new Set([
  'application/json',
  'application/pdf',
  'text/csv',
  'text/markdown',
  'text/plain',
]);

function maskIdentifier(value: string): string {
  if (value.length <= 8) return value;
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

async function downloadReferencedChatFiles(
  chatFiles: ReferencedChatFile[],
  wsId: string,
  chatId: string
): Promise<ResolvedChatFile[]> {
  try {
    const supabase = await createAdminClient();
    let nextIndex = 0;
    const results = new Array<ResolvedChatFile | null>(chatFiles.length).fill(
      null
    );

    const workers = Array.from(
      { length: Math.min(FILE_DOWNLOAD_CONCURRENCY, chatFiles.length) },
      async () => {
        while (true) {
          const currentIndex = nextIndex++;
          if (currentIndex >= chatFiles.length) return;

          const attachment = chatFiles[currentIndex]!;
          const { data, error } = await supabase.storage
            .from('workspaces')
            .download(attachment.storagePath);

          if (error || !data) {
            console.error('[Google Chat Files] failed to download attachment', {
              chatId: maskIdentifier(chatId),
              fileName: attachment.name,
              storagePath: maskIdentifier(attachment.storagePath),
              wsId: maskIdentifier(wsId),
              error: error?.message,
            });
            continue;
          }

          const mediaType =
            attachment.type || data.type || 'application/octet-stream';
          const content =
            mediaType.startsWith('text/') || mediaType === 'application/json'
              ? await data.text()
              : await data.arrayBuffer();

          results[currentIndex] = {
            content,
            fileName: attachment.alias || attachment.name,
            introText:
              attachment.introText ??
              `Current-turn attachment: ${
                attachment.alias || attachment.name
              } (${mediaType}). Reference this file only if it is relevant to the user's request.`,
            mediaType,
          };
        }
      }
    );

    await Promise.all(workers);

    return results.filter((file): file is ResolvedChatFile => file !== null);
  } catch (error) {
    console.error('[Google Chat Files] unexpected attachment download error', {
      chatId: maskIdentifier(chatId),
      wsId: maskIdentifier(wsId),
      error,
    });
    return [];
  }
}

function addFilesToContent(
  existingContent: ModelMessage['content'],
  chatFiles: ResolvedChatFile[]
): Array<TextPart | ImagePart | FilePart> {
  const contentParts: Array<TextPart | ImagePart | FilePart> = [];

  if (typeof existingContent === 'string') {
    contentParts.push({ type: 'text', text: existingContent });
  } else if (Array.isArray(existingContent)) {
    for (const part of existingContent) {
      if (
        part.type === 'text' ||
        part.type === 'image' ||
        part.type === 'file'
      ) {
        contentParts.push(part);
      }
    }
  }

  for (const file of chatFiles) {
    const { content, fileName, introText, mediaType } = file;

    contentParts.push({
      type: 'text',
      text: introText,
    });

    if (mediaType.startsWith('image/')) {
      contentParts.push({
        type: 'image',
        image:
          content instanceof ArrayBuffer ? new Uint8Array(content) : content,
        mediaType,
      });
      continue;
    }

    if (
      (mediaType.startsWith('audio/') ||
        INLINE_FILE_MEDIA_TYPES.has(mediaType)) &&
      content instanceof ArrayBuffer &&
      content.byteLength > 0
    ) {
      contentParts.push({
        type: 'file',
        data: new Uint8Array(content),
        mediaType,
      });
      continue;
    }

    if (INLINE_FILE_MEDIA_TYPES.has(mediaType) && typeof content === 'string') {
      contentParts.push({
        type: 'file',
        data: new TextEncoder().encode(content),
        mediaType,
      });
      continue;
    }

    const canRecommendMarkitdown =
      MARKITDOWN_RECOMMENDED_MEDIA_TYPES.has(mediaType);
    contentParts.push({
      type: 'text',
      text: canRecommendMarkitdown
        ? `Attachment available: ${fileName} (${mediaType}). This format is not inlined. Use convert_file_to_markdown with fileName "${fileName}" if you need to read it.`
        : `Attachment available: ${fileName} (${mediaType}). This format is not inlined into the current turn.`,
    });
  }

  return contentParts;
}

export async function processMessagesWithFiles({
  chatFiles,
  chatId,
  messages,
  wsId,
}: ProcessMessagesWithFilesParams): Promise<ModelMessage[]> {
  return injectReferencedChatFilesIntoMessages({
    chatFiles,
    chatId,
    messages,
    wsId,
  });
}

export async function injectReferencedChatFilesIntoMessages({
  chatFiles,
  chatId,
  messages,
  wsId,
}: ProcessMessagesWithFilesParams & {
  chatFiles: ReferencedChatFile[];
}): Promise<ModelMessage[]> {
  if (chatFiles.length === 0) {
    return messages;
  }

  const resolvedFiles = await downloadReferencedChatFiles(
    chatFiles,
    wsId,
    chatId
  );
  if (resolvedFiles.length === 0) {
    return messages;
  }

  let lastUserMessageIndex = -1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === 'user') {
      lastUserMessageIndex = index;
      break;
    }
  }

  if (lastUserMessageIndex === -1) {
    return messages;
  }

  const processedMessages = [...messages];
  const lastUserMessage = processedMessages[lastUserMessageIndex]!;

  processedMessages[lastUserMessageIndex] = {
    role: 'user',
    content: addFilesToContent(lastUserMessage.content, resolvedFiles),
  };

  return processedMessages;
}
