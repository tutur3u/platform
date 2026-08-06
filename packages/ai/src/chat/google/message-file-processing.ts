import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { FilePart, ImagePart, ModelMessage, TextPart } from 'ai';

type ChatFile = {
  fileName: string;
  content: string | ArrayBuffer;
  mediaType: string;
};

const FILE_DOWNLOAD_CONCURRENCY = 4;
// Supabase storage `list` defaults to 100 rows, so a chat that accumulated more
// resources than this silently lost everything past the first page.
const STORAGE_LIST_PAGE_SIZE = 100;
const STORAGE_LIST_MAX_PAGES = 20;
// Every request re-sends the chat's whole resource set, so an unbounded chat
// would eventually build a request no provider will accept. Attachments are
// admitted oldest-first until the budget is spent.
const MAX_INJECTED_ATTACHMENT_BYTES = 32 * 1024 * 1024;

// Storage only records a media type when the uploader knew one. Without this,
// an image whose content type was lost on the way in reads as
// `application/octet-stream`, misses the `image/` check, and reaches the model
// as "this format cannot be passed directly" — invisible, with no error.
const MEDIA_TYPE_BY_EXTENSION: Record<string, string> = {
  aac: 'audio/aac',
  avif: 'image/avif',
  csv: 'text/csv',
  flac: 'audio/flac',
  gif: 'image/gif',
  heic: 'image/heic',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  json: 'application/json',
  m4a: 'audio/mp4',
  md: 'text/markdown',
  mov: 'video/quicktime',
  mp3: 'audio/mpeg',
  mp4: 'video/mp4',
  ogg: 'audio/ogg',
  opus: 'audio/ogg',
  pdf: 'application/pdf',
  png: 'image/png',
  txt: 'text/plain',
  wav: 'audio/wav',
  webm: 'video/webm',
  webp: 'image/webp',
};

const UNKNOWN_MEDIA_TYPE = 'application/octet-stream';

export function resolveAttachmentMediaType(
  fileName: string,
  metadataMediaType?: string | null
): string {
  if (metadataMediaType && metadataMediaType !== UNKNOWN_MEDIA_TYPE) {
    return metadataMediaType;
  }

  const extension = fileName.split('.').pop()?.toLowerCase();
  if (extension && MEDIA_TYPE_BY_EXTENSION[extension]) {
    return MEDIA_TYPE_BY_EXTENSION[extension];
  }

  return metadataMediaType || UNKNOWN_MEDIA_TYPE;
}

function maskIdentifier(value: string): string {
  if (value.length <= 8) return value;
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

type StorageListClient = {
  storage: {
    from: (bucket: string) => {
      list: (
        path: string,
        options: Record<string, unknown>
      ) => Promise<{
        data:
          | { name: string; metadata?: Record<string, unknown> | null }[]
          | null;
        error: unknown;
      }>;
    };
  };
};

export async function listAllChatResourceFiles(
  sbAdmin: StorageListClient,
  storagePath: string
) {
  const files: { name: string; metadata?: Record<string, unknown> | null }[] =
    [];

  for (let page = 0; page < STORAGE_LIST_MAX_PAGES; page += 1) {
    const { data, error } = await sbAdmin.storage
      .from('workspaces')
      .list(storagePath, {
        limit: STORAGE_LIST_PAGE_SIZE,
        offset: page * STORAGE_LIST_PAGE_SIZE,
        sortBy: { column: 'created_at', order: 'asc' },
      });

    if (error) {
      console.error('Error listing files:', error);
      // Keep whatever paged in rather than dropping the whole set.
      return { files, truncated: false };
    }

    if (!data || data.length === 0) break;

    files.push(...data);
    if (data.length < STORAGE_LIST_PAGE_SIZE) {
      return { files, truncated: false };
    }
  }

  return {
    files,
    truncated: files.length >= STORAGE_LIST_PAGE_SIZE * STORAGE_LIST_MAX_PAGES,
  };
}

async function getAllChatFiles(
  wsId: string,
  chatId: string,
  _request?: Pick<Request, 'headers'>
): Promise<ChatFile[]> {
  try {
    const sbAdmin = await createAdminClient();

    const storagePath = `${wsId}/chats/ai/resources/${chatId}`;
    const { files, truncated } = await listAllChatResourceFiles(
      sbAdmin,
      storagePath
    );

    console.info('[Google Chat Files] listed chat files', {
      wsId: maskIdentifier(wsId),
      chatId: maskIdentifier(chatId),
      fileCount: files.length,
      truncated,
    });

    if (files.length === 0) {
      return [];
    }

    let nextFileIndex = 0;
    const results = new Array<ChatFile | null>(files.length).fill(null);
    const workers = Array.from(
      { length: Math.min(FILE_DOWNLOAD_CONCURRENCY, files.length) },
      async () => {
        while (true) {
          const currentIndex = nextFileIndex++;
          if (currentIndex >= files.length) {
            return;
          }

          const file = files[currentIndex]!;
          const fileName = file.name || 'unknown';
          const mediaType = resolveAttachmentMediaType(
            fileName,
            (file.metadata?.mediaType as string | undefined) ||
              (file.metadata?.mimetype as string | undefined)
          );

          const { data: fileData, error: downloadError } = await sbAdmin.storage
            .from('workspaces')
            .download(`${storagePath}/${file.name}`);

          if (downloadError) {
            console.error(`Error downloading file ${fileName}:`, downloadError);
            continue;
          }

          if (!fileData) {
            console.error(`No data received for file ${fileName}`);
            continue;
          }

          const content =
            mediaType.startsWith('text/') || mediaType === 'application/json'
              ? await fileData.text()
              : await fileData.arrayBuffer();

          results[currentIndex] = {
            fileName,
            content,
            mediaType,
          } satisfies ChatFile;
        }
      }
    );

    await Promise.all(workers);
    const fileContents = results.filter(
      (file): file is ChatFile => file !== null
    );

    return fileContents;
  } catch (error) {
    console.error('Error getting all chat files:', error);
    return [];
  }
}

function addFilesToContent(
  existingContent: ModelMessage['content'],
  chatFiles: ChatFile[]
): Array<TextPart | ImagePart | FilePart> {
  const contentParts: Array<TextPart | ImagePart | FilePart> = [];
  const supportedFileMediaTypes = new Set([
    'application/pdf',
    'video/mp4',
    'video/quicktime',
    'video/webm',
    'text/plain',
    'text/csv',
    'application/json',
    'text/markdown',
    // Gemini accepts audio natively; without these an attached recording
    // reached the model only as a "cannot be passed directly" note.
    'audio/aac',
    'audio/flac',
    'audio/mp4',
    'audio/mpeg',
    'audio/ogg',
    'audio/wav',
  ]);

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

  let injectedBytes = 0;
  let skippedForBudget = 0;

  for (const file of chatFiles) {
    const { content, mediaType, fileName } = file;
    const byteLength =
      content instanceof ArrayBuffer ? content.byteLength : content.length;

    // Oldest-first: an early attachment the conversation is actually about
    // should not be evicted by a later one.
    if (injectedBytes + byteLength > MAX_INJECTED_ATTACHMENT_BYTES) {
      skippedForBudget += 1;
      continue;
    }
    injectedBytes += byteLength;

    if (mediaType.startsWith('image/')) {
      const imagePart: ImagePart = {
        type: 'image',
        image:
          content instanceof ArrayBuffer ? new Uint8Array(content) : content,
        mediaType,
      };
      contentParts.push(imagePart);
    } else if (
      supportedFileMediaTypes.has(mediaType) &&
      content instanceof ArrayBuffer &&
      content.byteLength > 0
    ) {
      const filePart: FilePart = {
        type: 'file',
        data: new Uint8Array(content),
        mediaType,
      };
      contentParts.push(filePart);
    } else if (
      supportedFileMediaTypes.has(mediaType) &&
      typeof content === 'string'
    ) {
      const filePart: FilePart = {
        type: 'file',
        data: new TextEncoder().encode(content),
        mediaType,
      };
      contentParts.push(filePart);
    } else {
      contentParts.push({
        type: 'text',
        text: `Attachment available: ${fileName} (${mediaType}). This format cannot be passed directly to the model. Use convert_file_to_markdown with fileName "${fileName}" if you need to read it.`,
      });
    }
  }

  if (skippedForBudget > 0) {
    // Say so rather than answering as though nothing was attached.
    contentParts.push({
      type: 'text',
      text: `${skippedForBudget} older attachment(s) were omitted from this request because the conversation exceeds the attachment size budget. Ask the user to re-attach anything you need.`,
    });
  }

  return contentParts;
}

export async function processMessagesWithFiles(
  messages: ModelMessage[],
  wsId: string,
  chatId: string,
  request?: Pick<Request, 'headers'>
): Promise<ModelMessage[]> {
  const chatFiles = await getAllChatFiles(wsId, chatId, request);
  if (chatFiles.length === 0) {
    return messages;
  }

  let lastUserMessageIndex = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message && message.role === 'user') {
      lastUserMessageIndex = i;
      break;
    }
  }

  if (lastUserMessageIndex === -1) {
    return messages;
  }

  const processedMessages = [...messages];
  const lastUserMessage = processedMessages[lastUserMessageIndex]!;
  const newContent = addFilesToContent(lastUserMessage.content, chatFiles);

  processedMessages[lastUserMessageIndex] = {
    role: 'user',
    content: newContent,
  };

  return processedMessages;
}
