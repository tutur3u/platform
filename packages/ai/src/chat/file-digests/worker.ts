import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  type FilePart,
  gateway,
  generateObject,
  type ImagePart,
  type TextPart,
} from 'ai';
import { executeConvertFileToMarkdown } from '../../tools/executors/markitdown';
import type { MiraToolContext } from '../../tools/mira-tool-types';
import {
  type ChatAttachmentMetadata,
  normalizeChatAttachmentMetadata,
} from '../chat-attachment-metadata';
import {
  DIGEST_CHUNK_HARD_LIMIT_CHARACTERS,
  DIGEST_CHUNK_TARGET_CHARACTERS,
  FILE_DIGEST_MODEL,
  MAX_MARKITDOWN_DIGEST_CHARACTERS,
  MAX_STORED_EXTRACTED_MARKDOWN_CHARACTERS,
} from './constants';
import type { ChatFileDigestSchemaOutput } from './schema';
import { chatFileDigestSchema } from './schema';
import type { ChatFileDigestUsage } from './types';

type WorkerParams = {
  attachment: ChatAttachmentMetadata;
  attachmentResolved?: boolean;
  chatId: string;
  creditWsId?: string | null;
  userId: string;
  wsId: string;
};

type WorkerResult = ChatFileDigestSchemaOutput & {
  resolvedAttachment?: ChatAttachmentMetadata;
  usage: ChatFileDigestUsage;
};

type UsageLike = {
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
};

const NATIVE_DIGEST_MEDIA_TYPES = new Set([
  'application/json',
  'application/pdf',
  'text/csv',
  'text/markdown',
  'text/plain',
]);
const NATIVE_DIGEST_EXTENSIONS = new Set([
  'aac',
  'csv',
  'flac',
  'gif',
  'jpeg',
  'jpg',
  'json',
  'm4a',
  'md',
  'mov',
  'mp3',
  'mp4',
  'ogg',
  'pdf',
  'png',
  'txt',
  'wav',
  'webm',
  'webp',
]);

function maskIdentifier(value: string): string {
  if (value.length <= 8) return value;
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function toUsage(usage: UsageLike | undefined): ChatFileDigestUsage {
  return {
    inputTokens: usage?.inputTokens ?? 0,
    outputTokens: usage?.outputTokens ?? 0,
    reasoningTokens: usage?.reasoningTokens ?? 0,
  };
}

function addUsage(
  total: ChatFileDigestUsage,
  usage: UsageLike | ChatFileDigestUsage | undefined
): ChatFileDigestUsage {
  return {
    inputTokens: total.inputTokens + (usage?.inputTokens ?? 0),
    outputTokens: total.outputTokens + (usage?.outputTokens ?? 0),
    reasoningTokens: total.reasoningTokens + (usage?.reasoningTokens ?? 0),
  };
}

function supportsNativeDigest(mediaType: string): boolean {
  return (
    mediaType.startsWith('audio/') ||
    mediaType.startsWith('image/') ||
    mediaType.startsWith('video/') ||
    mediaType.startsWith('text/') ||
    NATIVE_DIGEST_MEDIA_TYPES.has(mediaType)
  );
}

function getFileExtension(fileName: string): string {
  const normalizedName = fileName.toLowerCase();
  const lastDotIndex = normalizedName.lastIndexOf('.');
  if (lastDotIndex === -1) return '';
  return normalizedName.slice(lastDotIndex + 1);
}

function inferMediaTypeFromExtension(fileName: string): string | null {
  const extension = getFileExtension(fileName);
  const normalizedName = fileName.toLowerCase();
  if (extension === 'webm' && normalizedName.includes('mira-audio-')) {
    return 'audio/webm';
  }

  const mapping: Record<string, string> = {
    aac: 'audio/aac',
    csv: 'text/csv',
    flac: 'audio/flac',
    gif: 'image/gif',
    jpeg: 'image/jpeg',
    jpg: 'image/jpeg',
    json: 'application/json',
    m4a: 'audio/mp4',
    md: 'text/markdown',
    mov: 'video/quicktime',
    mp3: 'audio/mpeg',
    mp4: 'video/mp4',
    ogg: 'audio/ogg',
    pdf: 'application/pdf',
    png: 'image/png',
    txt: 'text/plain',
    wav: 'audio/wav',
    webm: 'video/webm',
    webp: 'image/webp',
  };

  return mapping[extension] ?? null;
}

function normalizeAttachmentMediaType(
  attachment: ChatAttachmentMetadata,
  fallbackMediaType: string
): string {
  if (
    fallbackMediaType === 'video/webm' &&
    attachment.name.toLowerCase().includes('mira-audio-')
  ) {
    return 'audio/webm';
  }

  return fallbackMediaType;
}

function getStorageFileName(storagePath: string): string {
  const parts = storagePath.split('/');
  return parts[parts.length - 1] ?? storagePath;
}

function isTempChatStoragePath(storagePath: string): boolean {
  return storagePath.includes('/chats/ai/resources/temp/');
}

function attachmentMatchesDigestCandidate(
  candidate: ChatAttachmentMetadata,
  target: ChatAttachmentMetadata
): boolean {
  const normalizedTargetName = target.name.trim().toLowerCase();
  const normalizedTargetAlias = target.alias?.trim().toLowerCase() ?? '';

  return (
    candidate.name.trim().toLowerCase() === normalizedTargetName ||
    (normalizedTargetAlias.length > 0 &&
      (candidate.alias?.trim().toLowerCase() ?? '') ===
        normalizedTargetAlias) ||
    getStorageFileName(candidate.storagePath) ===
      getStorageFileName(target.storagePath)
  );
}

export async function resolveAttachmentForDigest({
  attachment,
  chatId,
}: WorkerParams): Promise<ChatAttachmentMetadata> {
  if (!isTempChatStoragePath(attachment.storagePath)) {
    return attachment;
  }

  const guessedStablePath = attachment.storagePath.replace(
    /\/chats\/ai\/resources\/temp\/[^/]+\//,
    `/chats/ai/resources/${chatId}/`
  );
  const candidatePaths = new Set<string>();

  if (guessedStablePath !== attachment.storagePath) {
    candidatePaths.add(guessedStablePath);
  }

  const sbAdmin = await createAdminClient();
  const { data: chatMessages, error } = await sbAdmin
    .from('ai_chat_messages')
    .select('metadata')
    .eq('chat_id', chatId);

  if (error) {
    console.error('[Chat File Digest] failed to inspect chat attachments', {
      chatId: maskIdentifier(chatId),
      storagePath: maskIdentifier(attachment.storagePath),
      error: error.message,
    });
  }

  for (const message of chatMessages ?? []) {
    const attachments = normalizeChatAttachmentMetadata(
      (message.metadata as Record<string, unknown> | null)?.attachments
    );

    for (const candidate of attachments) {
      if (!attachmentMatchesDigestCandidate(candidate, attachment)) continue;
      if (candidate.storagePath === attachment.storagePath) continue;
      candidatePaths.add(candidate.storagePath);
    }
  }

  const resolvedStoragePath = [...candidatePaths].find(
    (storagePath) => !isTempChatStoragePath(storagePath)
  );

  if (!resolvedStoragePath) {
    return attachment;
  }

  return {
    ...attachment,
    storagePath: resolvedStoragePath,
  };
}

function buildDigestSystemPrompt() {
  return [
    'You are a file digestion worker for a chat application.',
    'Analyze the provided file or extracted markdown and return grounded structured output only.',
    'Do not invent file contents.',
    'If something is uncertain, say so in limitations.',
    'If the file is empty, silent, blank, unreadable, corrupted, or does not contain discernible meaningful content, say that clearly.',
    'When content is missing or unprocessable, set suggestedAlias to null and use answerContextMarkdown to explain the limitation plainly so the answering model can tell the user.',
    'Write answerContextMarkdown as compact markdown that another model can use to answer user questions.',
    'suggestedAlias should be a concise descriptive file name if the contents clearly support one; otherwise return null.',
    'Keep summaries concise and factual.',
  ].join(' ');
}

function splitMarkdownIntoChunks(markdown: string): string[] {
  if (markdown.length <= DIGEST_CHUNK_HARD_LIMIT_CHARACTERS) {
    return [markdown];
  }

  const paragraphs = markdown.split(/\n{2,}/);
  const chunks: string[] = [];
  let current = '';

  for (const paragraph of paragraphs) {
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length <= DIGEST_CHUNK_TARGET_CHARACTERS) {
      current = candidate;
      continue;
    }

    if (current) {
      chunks.push(current);
    }

    if (paragraph.length <= DIGEST_CHUNK_HARD_LIMIT_CHARACTERS) {
      current = paragraph;
      continue;
    }

    for (
      let index = 0;
      index < paragraph.length;
      index += DIGEST_CHUNK_TARGET_CHARACTERS
    ) {
      chunks.push(
        paragraph.slice(index, index + DIGEST_CHUNK_TARGET_CHARACTERS).trim()
      );
    }
    current = '';
  }

  if (current) {
    chunks.push(current);
  }

  return chunks.filter(Boolean);
}

async function generateDigestFromMarkdown(
  markdown: string,
  attachment: ChatAttachmentMetadata,
  partLabel?: string
): Promise<WorkerResult> {
  const result = await generateObject({
    model: gateway(FILE_DIGEST_MODEL),
    schema: chatFileDigestSchema,
    system: buildDigestSystemPrompt(),
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: [
              `File name: ${attachment.alias || attachment.name}`,
              `Media type: ${attachment.type || 'application/octet-stream'}`,
              partLabel ? `Segment: ${partLabel}` : null,
              'Analyze this extracted file content and return a grounded digest.',
              'If there is no discernible content, state that explicitly instead of guessing.',
              '',
              markdown,
            ]
              .filter(Boolean)
              .join('\n'),
          },
        ],
      },
    ],
    providerOptions: {
      google: {
        thinkingConfig: {
          includeThoughts: false,
          thinkingBudget: 0,
        },
      },
    },
  });

  return {
    ...result.object,
    resolvedAttachment: attachment,
    usage: toUsage(result.usage),
  };
}

async function digestLargeMarkdown(
  markdown: string,
  attachment: ChatAttachmentMetadata
): Promise<WorkerResult> {
  const chunks = splitMarkdownIntoChunks(markdown);
  if (chunks.length === 1) {
    return generateDigestFromMarkdown(chunks[0]!, attachment);
  }

  let usage: ChatFileDigestUsage = {
    inputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
  };
  const partialDigests: ChatFileDigestSchemaOutput[] = [];

  for (const [index, chunk] of chunks.entries()) {
    const partial = await generateDigestFromMarkdown(
      chunk,
      attachment,
      `Part ${index + 1} of ${chunks.length}`
    );
    usage = addUsage(usage, partial.usage);
    partialDigests.push({
      answerContextMarkdown: partial.answerContextMarkdown,
      extractedMarkdown: partial.extractedMarkdown,
      keyFacts: partial.keyFacts,
      limitations: partial.limitations,
      suggestedAlias: partial.suggestedAlias,
      summary: partial.summary,
      title: partial.title,
    });
  }

  const result = await generateObject({
    model: gateway(FILE_DIGEST_MODEL),
    schema: chatFileDigestSchema,
    system: buildDigestSystemPrompt(),
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: [
              `File name: ${attachment.alias || attachment.name}`,
              `Media type: ${attachment.type || 'application/octet-stream'}`,
              'Merge these partial file digests into one final grounded digest.',
              'If the combined result still lacks discernible content, state that explicitly instead of guessing.',
              '',
              JSON.stringify(partialDigests),
            ].join('\n'),
          },
        ],
      },
    ],
    providerOptions: {
      google: {
        thinkingConfig: {
          includeThoughts: false,
          thinkingBudget: 0,
        },
      },
    },
  });

  return {
    ...result.object,
    resolvedAttachment: attachment,
    usage: addUsage(usage, result.usage),
  };
}

async function digestNativeFile(
  attachment: ChatAttachmentMetadata,
  wsId: string,
  chatId: string
): Promise<WorkerResult> {
  const sbAdmin = await createAdminClient();
  const storageCandidates = Array.from(
    new Set([
      attachment.storagePath,
      ...(isTempChatStoragePath(attachment.storagePath)
        ? [
            attachment.storagePath.replace(
              /\/chats\/ai\/resources\/temp\/[^/]+\//,
              `/chats/ai/resources/${chatId}/`
            ),
          ]
        : []),
    ])
  );

  let data: Blob | null = null;
  let resolvedStoragePath = attachment.storagePath;
  let error: { message?: string } | null = null;

  for (const storagePath of storageCandidates) {
    const downloadResult = await sbAdmin.storage
      .from('workspaces')
      .download(storagePath);

    if (!downloadResult.error && downloadResult.data) {
      data = downloadResult.data;
      resolvedStoragePath = storagePath;
      error = null;
      break;
    }

    error = downloadResult.error;
  }

  if (error || !data) {
    console.error('[Chat File Digest] failed to download attachment', {
      chatId: maskIdentifier(chatId),
      fileName: maskIdentifier(attachment.name),
      storagePath: maskIdentifier(attachment.storagePath),
      wsId: maskIdentifier(wsId),
      error: error?.message,
    });
    throw new Error('Failed to download file for digestion.');
  }

  const mediaType = normalizeAttachmentMediaType(
    attachment,
    attachment.type || data.type || 'application/octet-stream'
  );
  const effectiveMediaType =
    mediaType === 'application/octet-stream'
      ? (inferMediaTypeFromExtension(attachment.name) ?? mediaType)
      : mediaType;

  const content: Array<TextPart | ImagePart | FilePart> = [
    {
      type: 'text',
      text: [
        `File name: ${attachment.alias || attachment.name}`,
        `Media type: ${effectiveMediaType}`,
        'Analyze this file and return a grounded structured digest.',
        'If the file has no discernible content or cannot be meaningfully interpreted, state that explicitly instead of guessing.',
      ].join('\n'),
    },
  ];

  if (effectiveMediaType.startsWith('image/')) {
    content.push({
      type: 'image',
      image: new Uint8Array(await data.arrayBuffer()),
      mediaType: effectiveMediaType,
    });
  } else if (
    effectiveMediaType.startsWith('audio/') ||
    effectiveMediaType.startsWith('video/') ||
    NATIVE_DIGEST_MEDIA_TYPES.has(effectiveMediaType)
  ) {
    content.push({
      type: 'file',
      data: new Uint8Array(await data.arrayBuffer()),
      mediaType: effectiveMediaType,
    });
  } else if (effectiveMediaType.startsWith('text/')) {
    content.push({
      type: 'file',
      data: new TextEncoder().encode(await data.text()),
      mediaType: effectiveMediaType,
    });
  } else {
    throw new Error(
      `Unsupported native digest media type: ${effectiveMediaType || 'unknown'}`
    );
  }

  const result = await generateObject({
    model: gateway(FILE_DIGEST_MODEL),
    schema: chatFileDigestSchema,
    system: buildDigestSystemPrompt(),
    messages: [
      {
        role: 'user',
        content,
      },
    ],
    providerOptions: {
      google: {
        thinkingConfig: {
          includeThoughts: false,
          thinkingBudget: 0,
        },
      },
    },
  });

  return {
    ...result.object,
    resolvedAttachment: {
      ...attachment,
      storagePath: resolvedStoragePath,
      type: effectiveMediaType,
    },
    usage: toUsage(result.usage),
  };
}

async function digestDocumentViaMarkdown(
  attachment: ChatAttachmentMetadata,
  params: WorkerParams
): Promise<WorkerResult> {
  const markitdownResult = await executeConvertFileToMarkdown(
    {
      fileName: attachment.name,
      maxCharacters: MAX_MARKITDOWN_DIGEST_CHARACTERS,
      storagePath: attachment.storagePath,
    },
    {
      chatId: params.chatId,
      creditWsId: params.creditWsId ?? undefined,
      supabase: {} as MiraToolContext['supabase'],
      userId: params.userId,
      wsId: params.wsId,
    }
  );

  if (!markitdownResult.ok) {
    throw new Error(markitdownResult.error);
  }

  const markdown = markitdownResult.markdown;
  if (typeof markdown !== 'string' || markdown.length === 0) {
    throw new Error('MarkItDown returned empty markdown.');
  }
  const truncatedMarkdown =
    markdown.length > MAX_STORED_EXTRACTED_MARKDOWN_CHARACTERS
      ? `${markdown.slice(0, MAX_STORED_EXTRACTED_MARKDOWN_CHARACTERS)}\n\n[...truncated for storage...]`
      : markdown;

  const digested = await digestLargeMarkdown(markdown, attachment);

  return {
    ...digested,
    extractedMarkdown: digested.extractedMarkdown ?? truncatedMarkdown,
    resolvedAttachment: attachment,
  };
}

export async function digestChatFileWithGemini(
  params: WorkerParams
): Promise<WorkerResult> {
  const resolvedAttachment = params.attachmentResolved
    ? params.attachment
    : await resolveAttachmentForDigest(params);
  const mediaType = resolvedAttachment.type || 'application/octet-stream';
  const extension = getFileExtension(resolvedAttachment.name);

  if (
    supportsNativeDigest(mediaType) ||
    NATIVE_DIGEST_EXTENSIONS.has(extension)
  ) {
    return digestNativeFile(resolvedAttachment, params.wsId, params.chatId);
  }

  return digestDocumentViaMarkdown(resolvedAttachment, params);
}
