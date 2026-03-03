import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  normalizeChatAttachmentMetadata,
  stripChatUploadTimestampPrefix,
} from '../../chat/chat-attachment-metadata';
import { listChatFileDigestStatuses } from '../../chat/file-digests/cache';
import { ensureChatFileDigest } from '../../chat/file-digests/ensure';
import { formatChatFileDigestForModel } from '../../chat/file-digests/format';
import type { MiraToolContext } from '../mira-tools';

type ChatMessageRow = {
  created_at?: string | null;
  id: string;
  metadata: unknown;
  role?: string;
};

type ListedChatFile = {
  alias: string | null;
  createdAt: string | null;
  digestStatus?: 'failed' | 'processing' | 'ready' | null;
  displayName: string;
  fileName: string;
  mediaType: string;
  messageId: string | null;
  size: number;
  storagePath: string;
  turnIndex: number | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeQuery(value: unknown): string {
  if (typeof value !== 'string') return '';

  const normalized = value.trim().toLowerCase();
  if (!normalized) return '';
  if ([...normalized].every((char) => char === '*')) return '';

  return normalized;
}

function buildAttachmentContext(chatMessages: ChatMessageRow[]) {
  const attachmentContext = new Map<
    string,
    {
      alias?: string | null;
      messageCreatedAt?: string | null;
      messageId: string;
      turnIndex: number;
    }
  >();

  for (const [index, message] of chatMessages.entries()) {
    const attachments = normalizeChatAttachmentMetadata(
      (message.metadata as Record<string, unknown> | null)?.attachments
    );

    for (const attachment of attachments) {
      attachmentContext.set(attachment.storagePath, {
        alias: attachment.alias,
        messageCreatedAt:
          typeof message.created_at === 'string' ? message.created_at : null,
        messageId: message.id,
        turnIndex: index + 1,
      });
    }
  }

  return attachmentContext;
}

async function loadChatFileState(ctx: MiraToolContext, latestFirst: boolean) {
  if (!ctx.chatId) {
    return {
      error:
        'Chat context is missing. Ask the user to send a message in a chat first.',
      ok: false as const,
    };
  }

  const sbAdmin = await createAdminClient();
  const storagePath = `${ctx.wsId}/chats/ai/resources/${ctx.chatId}`;

  const [
    { data: fileList, error: listError },
    { data: chatMessages, error: messageError },
  ] = await Promise.all([
    sbAdmin.storage.from('workspaces').list(storagePath, {
      limit: 100,
      sortBy: { column: 'created_at', order: latestFirst ? 'desc' : 'asc' },
    }),
    sbAdmin
      .from('ai_chat_messages')
      .select('id, created_at, metadata, role')
      .eq('chat_id', ctx.chatId)
      .order('created_at', { ascending: true }),
  ]);

  if (listError) {
    return {
      error: `Failed to list chat files: ${listError.message}`,
      ok: false as const,
    };
  }

  if (messageError) {
    return {
      error: `Failed to inspect chat messages: ${messageError.message}`,
      ok: false as const,
    };
  }

  const digestStatuses = await listChatFileDigestStatuses(
    [
      ...(fileList ?? []).map((file) => `${storagePath}/${file.name}`),
      ...(chatMessages ?? []).flatMap((message) =>
        normalizeChatAttachmentMetadata(
          (message.metadata as Record<string, unknown> | null)?.attachments
        ).map((attachment) => attachment.storagePath)
      ),
    ],
    undefined
  );

  return {
    chatMessages: (chatMessages ?? []) as ChatMessageRow[],
    digestStatuses,
    fileList: fileList ?? [],
    ok: true as const,
    sbAdmin,
    storagePath,
  };
}

function matchesRequestedFile(
  attachment: {
    alias?: string | null;
    name: string;
    storagePath: string;
  },
  requestedFileName: string,
  requestedStoragePath: string
): boolean {
  if (requestedStoragePath) {
    return attachment.storagePath === requestedStoragePath;
  }

  if (!requestedFileName) return false;

  return (
    attachment.name.toLowerCase() === requestedFileName ||
    stripChatUploadTimestampPrefix(attachment.name).toLowerCase() ===
      requestedFileName ||
    (attachment.alias?.toLowerCase() ?? '') === requestedFileName
  );
}

function buildListedChatFiles(
  chatMessages: ChatMessageRow[],
  fileList: Array<{
    created_at?: string | null;
    id?: string | null;
    metadata?: Record<string, unknown>;
    name: string;
  }>,
  storagePath: string,
  digestStatuses: ReadonlyMap<string, 'failed' | 'processing' | 'ready'>
): ListedChatFile[] {
  const attachmentContext = buildAttachmentContext(chatMessages);
  const filesByStoragePath = new Map<string, ListedChatFile>();

  for (const [index, message] of chatMessages.entries()) {
    const attachments = normalizeChatAttachmentMetadata(
      (message.metadata as Record<string, unknown> | null)?.attachments
    );

    for (const attachment of attachments) {
      filesByStoragePath.set(attachment.storagePath, {
        alias: attachment.alias ?? null,
        createdAt:
          typeof message.created_at === 'string' ? message.created_at : null,
        digestStatus: digestStatuses.get(attachment.storagePath) ?? null,
        displayName:
          attachment.alias || stripChatUploadTimestampPrefix(attachment.name),
        fileName: stripChatUploadTimestampPrefix(attachment.name),
        mediaType: attachment.type ?? 'application/octet-stream',
        messageId: message.id,
        size: attachment.size ?? 0,
        storagePath: attachment.storagePath,
        turnIndex: index + 1,
      });
    }
  }

  for (const file of fileList) {
    if (file.id == null || file.name === '.emptyFolderPlaceholder') continue;

    const fullPath = `${storagePath}/${file.name}`;
    const metadata =
      attachmentContext.get(fullPath) ?? attachmentContext.get(file.name);
    const displayName = stripChatUploadTimestampPrefix(file.name);
    const mediaType =
      typeof file.metadata?.mimetype === 'string'
        ? file.metadata.mimetype
        : typeof file.metadata?.mediaType === 'string'
          ? file.metadata.mediaType
          : 'application/octet-stream';
    const existing = filesByStoragePath.get(fullPath);

    filesByStoragePath.set(fullPath, {
      alias: existing?.alias ?? metadata?.alias ?? null,
      createdAt:
        file.created_at ??
        existing?.createdAt ??
        metadata?.messageCreatedAt ??
        null,
      digestStatus:
        existing?.digestStatus ?? digestStatuses.get(fullPath) ?? null,
      displayName:
        existing?.alias ??
        metadata?.alias ??
        existing?.displayName ??
        displayName,
      fileName: existing?.fileName ?? displayName,
      mediaType: existing?.mediaType ?? mediaType,
      messageId: existing?.messageId ?? metadata?.messageId ?? null,
      size:
        typeof file.metadata?.size === 'number'
          ? file.metadata.size
          : (existing?.size ?? 0),
      storagePath: fullPath,
      turnIndex: existing?.turnIndex ?? metadata?.turnIndex ?? null,
    });
  }

  return [...filesByStoragePath.values()];
}

function matchesRequestedListedFile(
  file: ListedChatFile,
  requestedFileName: string,
  requestedStoragePath: string
): boolean {
  if (requestedStoragePath) {
    return file.storagePath === requestedStoragePath;
  }

  if (!requestedFileName) return false;

  return (
    file.fileName.toLowerCase() === requestedFileName ||
    file.displayName.toLowerCase() === requestedFileName ||
    (file.alias?.toLowerCase() ?? '') === requestedFileName
  );
}

export async function executeListChatFiles(
  args: Record<string, unknown>,
  ctx: MiraToolContext
) {
  const limit =
    typeof args.limit === 'number' && Number.isFinite(args.limit)
      ? Math.min(Math.max(Math.floor(args.limit), 1), 50)
      : 20;
  const latestFirst = args.latestFirst !== false;
  const query = normalizeQuery(args.query);

  const state = await loadChatFileState(ctx, latestFirst);
  if (!state.ok) {
    return state;
  }

  const { chatMessages, digestStatuses, fileList, storagePath } = state;
  const files = buildListedChatFiles(
    chatMessages,
    fileList,
    storagePath,
    digestStatuses
  )
    .filter((file) => {
      if (!query) return true;
      return (
        file.fileName.toLowerCase().includes(query) ||
        file.mediaType.toLowerCase().includes(query) ||
        file.displayName.toLowerCase().includes(query) ||
        (file.alias?.toLowerCase().includes(query) ?? false)
      );
    })
    .sort((a, b) => {
      const aTime = a.createdAt ? Date.parse(a.createdAt) : 0;
      const bTime = b.createdAt ? Date.parse(b.createdAt) : 0;
      return latestFirst ? bTime - aTime : aTime - bTime;
    })
    .slice(0, limit);

  return {
    files,
    ok: true,
  };
}

export async function executeLoadChatFile(
  args: Record<string, unknown>,
  ctx: MiraToolContext
) {
  const forceRefresh = args.forceRefresh === true;
  const requestedStoragePath =
    typeof args.storagePath === 'string' ? args.storagePath.trim() : '';
  const requestedFileName = normalizeQuery(args.fileName);

  if (!requestedStoragePath && !requestedFileName) {
    return {
      ok: false,
      error:
        'Provide either storagePath or fileName. Use list_chat_files first if you need to inspect available files.',
    };
  }

  const state = await loadChatFileState(ctx, true);
  if (!state.ok) {
    return state;
  }

  const { chatMessages, digestStatuses, fileList, storagePath } = state;
  const matches = buildListedChatFiles(
    chatMessages,
    fileList,
    storagePath,
    digestStatuses
  )
    .filter((file) =>
      matchesRequestedListedFile(file, requestedFileName, requestedStoragePath)
    )
    .sort((a, b) => {
      const aTime = a.createdAt ? Date.parse(a.createdAt) : 0;
      const bTime = b.createdAt ? Date.parse(b.createdAt) : 0;
      return bTime - aTime;
    });

  if (matches.length === 0) {
    return {
      ok: false,
      error:
        'No matching chat file was found. Use list_chat_files first to inspect exact file names.',
    };
  }

  if (!requestedStoragePath && matches.length > 1) {
    return {
      ok: false,
      error:
        'Multiple files match that name. Use list_chat_files and pass the exact storagePath to load the intended file.',
      matches: matches.slice(0, 5).map((file) => ({
        alias: file.alias,
        displayName: file.displayName,
        fileName: file.fileName,
        storagePath: file.storagePath,
      })),
    };
  }

  const file = matches[0]!;

  const digestResult = await ensureChatFileDigest({
    attachment: {
      alias: file.alias,
      name: file.fileName,
      size: file.size,
      storagePath: file.storagePath,
      type: file.mediaType,
    },
    chatId: ctx.chatId!,
    creditWsId: ctx.creditWsId ?? null,
    forceRefresh,
    messageId: file.messageId,
    userId: ctx.userId,
    wsId: ctx.wsId,
  });

  if (!digestResult.ok) {
    return {
      ok: false,
      error: digestResult.error,
      file: {
        ...file,
        digestStatus: 'failed' as const,
      },
    };
  }

  return {
    ok: true,
    file: {
      ...file,
      digestStatus: 'ready' as const,
      mediaType: digestResult.digest.mediaType,
      storagePath: digestResult.digest.storagePath,
    },
    digest: {
      answerContextMarkdown: digestResult.digest.answerContextMarkdown,
      cached: digestResult.cached,
      extractedMarkdown: digestResult.digest.extractedMarkdown,
      forceRefresh,
      formatted: formatChatFileDigestForModel(digestResult.digest, 'expanded'),
      keyFacts: digestResult.digest.keyFacts,
      limitations: digestResult.digest.limitations,
      processorModel: digestResult.digest.processorModel,
      suggestedAlias: digestResult.digest.suggestedAlias,
      summary: digestResult.digest.summary,
      title: digestResult.digest.title,
    },
  };
}

export async function executeRenameChatFile(
  args: Record<string, unknown>,
  ctx: MiraToolContext
) {
  const requestedStoragePath =
    typeof args.storagePath === 'string' ? args.storagePath.trim() : '';
  const requestedFileName = normalizeQuery(args.fileName);
  const newName = typeof args.newName === 'string' ? args.newName.trim() : '';

  if (!newName) {
    return {
      ok: false,
      error: 'newName is required to rename a chat file.',
    };
  }

  if (!requestedStoragePath && !requestedFileName) {
    return {
      ok: false,
      error:
        'Provide either storagePath or fileName. Use list_chat_files first if you need to inspect available files.',
    };
  }

  const state = await loadChatFileState(ctx, true);
  if (!state.ok) {
    return state;
  }

  const { chatMessages, sbAdmin } = state;
  const candidates: Array<{
    alias?: string | null;
    fileName: string;
    messageId: string;
    metadata: Record<string, unknown>;
    storagePath: string;
  }> = [];

  for (const message of chatMessages) {
    if (!isRecord(message.metadata)) continue;

    const attachments = normalizeChatAttachmentMetadata(
      message.metadata.attachments
    );
    for (const attachment of attachments) {
      if (
        !matchesRequestedFile(
          attachment,
          requestedFileName,
          requestedStoragePath
        )
      ) {
        continue;
      }

      candidates.push({
        alias: attachment.alias,
        fileName: attachment.name,
        messageId: message.id,
        metadata: message.metadata,
        storagePath: attachment.storagePath,
      });
    }
  }

  if (candidates.length === 0) {
    return {
      ok: false,
      error:
        'No matching chat file was found. Use list_chat_files first to inspect exact file names.',
    };
  }

  const matchingStoragePaths = [
    ...new Set(candidates.map((file) => file.storagePath)),
  ];
  if (!requestedStoragePath && matchingStoragePaths.length > 1) {
    return {
      ok: false,
      error:
        'Multiple files match that name. Use list_chat_files and pass the exact storagePath to rename the intended file.',
      matches: candidates.slice(0, 5).map((candidate) => ({
        alias: candidate.alias ?? null,
        fileName: candidate.fileName,
        storagePath: candidate.storagePath,
      })),
    };
  }

  const targetStoragePath = requestedStoragePath || matchingStoragePaths[0]!;
  const targetMatches = candidates.filter(
    (candidate) => candidate.storagePath === targetStoragePath
  );
  const previousName = targetMatches[0]?.alias || targetMatches[0]?.fileName;

  const updates = await Promise.all(
    targetMatches.map(async (candidate) => {
      const attachments = normalizeChatAttachmentMetadata(
        candidate.metadata.attachments
      );
      const rewrittenAttachments = attachments.map((attachment) =>
        attachment.storagePath === targetStoragePath
          ? {
              ...attachment,
              alias: newName,
            }
          : attachment
      );

      const { error } = await sbAdmin
        .from('ai_chat_messages')
        .update({
          metadata: {
            ...candidate.metadata,
            attachments: rewrittenAttachments,
          },
        })
        .eq('id', candidate.messageId);

      return error;
    })
  );

  const updateError = updates.find((error) => error != null);
  if (updateError) {
    return {
      ok: false,
      error: `Failed to rename chat file: ${updateError.message}`,
    };
  }

  return {
    ok: true,
    file: {
      displayName: newName,
      fileName: targetMatches[0]?.fileName ?? newName,
      previousName: previousName ?? null,
      storagePath: targetStoragePath,
    },
  };
}
