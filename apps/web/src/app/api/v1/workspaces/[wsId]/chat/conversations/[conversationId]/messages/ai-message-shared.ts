import { randomUUID } from 'node:crypto';
import { createPOST as createAiChatPost } from '@tuturuuu/ai/chat/google/route';
import {
  GEMINI_31_FLASH_LITE_GATEWAY_MODEL,
  resolveGatewayModelId,
} from '@tuturuuu/ai/credits/model-mapping';
import type { ChatRealtimeAudience } from '@tuturuuu/realtime/chat';
import {
  deleteWorkspaceStorageFolderByPath,
  downloadWorkspaceStorageObjectForProvider,
  resolveWorkspaceStorageProvider,
  uploadWorkspaceStorageFileDirect,
} from '@tuturuuu/storage-core/workspace-storage-provider';
import { NextRequest } from 'next/server';
import type { SessionAuthContext } from '@/lib/api-auth';
import {
  type ChatConversation,
  type ChatMessage,
  type ChatRouteContext,
  callPrivateChatRpc,
} from '@/lib/chat/private-rpc';
import { publishChatRealtimeEvent } from '@/lib/chat/realtime';

export type ChatMessageAttachmentInput = {
  contentType?: string | null;
  filename: string;
  fullPath?: string | null;
  metadata?: Record<string, unknown>;
  path: string;
  sizeBytes?: number | null;
  storageWsId?: string | null;
};

const AI_MESSAGE_SPLIT_DECORATOR = '[[TUTURUUU_CHAT_SPLIT]]';
const AI_MESSAGE_SPLIT_INSTRUCTION = `When a response would be easier to read as a natural chat, you may split it into multiple messages by putting ${AI_MESSAGE_SPLIT_DECORATOR} on its own line between message parts. Use it sparingly, keep each part self-contained, and never mention the decorator to the user.`;

type UiMessageForAi = {
  id: string;
  role: 'assistant' | 'system' | 'user';
  parts: { text: string; type: 'text' }[];
};

export async function publishChatRealtimeMessages({
  actorUserId,
  audience,
  messages,
  wsId,
}: {
  actorUserId: string;
  audience: ChatRealtimeAudience;
  messages: ChatMessage[];
  wsId: string;
}) {
  await Promise.all(
    messages.map((message) =>
      publishChatRealtimeEvent({
        actorUserId,
        audience,
        conversationId: message.conversationId,
        message,
        type: 'message.created',
        wsId,
      })
    )
  );
}

export async function copyChatAttachmentsToAiResources({
  resourceChatId,
  targetWsId,
  userMessage,
}: {
  resourceChatId: string;
  targetWsId: string;
  userMessage: ChatMessage;
}) {
  await copyAttachmentInputsToAiResources({
    attachments: userMessage.attachments.map((attachment) => ({
      ...attachment,
      path: attachment.storagePath,
      storageWsId: attachment.storageWsId,
    })),
    resourceChatId,
    targetWsId,
  });
}

export async function copyAiChatAttachmentInputsToResources({
  attachments,
  chatId,
  wsId,
}: {
  attachments: ChatMessageAttachmentInput[];
  chatId: string;
  wsId: string;
}) {
  await copyAttachmentInputsToAiResources({
    attachments,
    resourceChatId: chatId,
    targetWsId: wsId,
  });
}

async function copyAttachmentInputsToAiResources({
  attachments,
  resourceChatId,
  targetWsId,
}: {
  attachments: ChatMessageAttachmentInput[];
  resourceChatId: string;
  targetWsId: string;
}) {
  for (const [index, attachment] of attachments.entries()) {
    const sourceWsId = attachment.storageWsId ?? targetWsId;
    try {
      const { provider } = await resolveWorkspaceStorageProvider(sourceWsId);
      const downloaded = await downloadWorkspaceStorageObjectForProvider(
        sourceWsId,
        provider,
        attachment.path
      );
      await uploadWorkspaceStorageFileDirect(
        targetWsId,
        `chats/ai/resources/${resourceChatId}/${index}-${attachment.filename}`,
        downloaded.buffer,
        {
          contentType:
            attachment.contentType ?? downloaded.contentType ?? undefined,
          upsert: true,
        }
      );
    } catch (error) {
      console.error('Failed to mirror Chat attachment for AI context', {
        attachmentPath: attachment.path,
        resourceChatId,
        error,
      });
    }
  }
}

export async function cleanupNativeAiResources({
  chatId,
  wsId,
}: {
  chatId: string;
  wsId: string;
}) {
  try {
    await deleteWorkspaceStorageFolderByPath(
      wsId,
      'chats/ai/resources',
      chatId
    );
  } catch (error) {
    console.warn('Failed to clean up native Chat AI resources', {
      chatId,
      error,
    });
  }
}

export async function maybeAutoRenameAiChat({
  chatId,
  currentTitle,
  firstMessageContent,
  previousMessages,
  supabase,
}: {
  chatId: string;
  currentTitle: string | null;
  firstMessageContent: string;
  previousMessages: ChatMessage[];
  supabase: SessionAuthContext['supabase'];
}) {
  if (previousMessages.some((message) => message.kind === 'user')) return;
  if (!shouldAutoRenameAiTitle(currentTitle)) return;

  const title = deriveAiChatTitle(firstMessageContent);
  if (!title) return;

  const { error } = await supabase
    .from('ai_chats')
    .update({ title })
    .eq('id', chatId);

  if (error) {
    console.error('Failed to auto-rename AI chat', { chatId, error });
  }
}

export async function maybeAutoRenameNativeAiConversation({
  auth,
  context,
  conversation,
  firstMessageContent,
  messages,
}: {
  auth: SessionAuthContext;
  context: ChatRouteContext;
  conversation: ChatConversation;
  firstMessageContent: string;
  messages: ChatMessage[];
}) {
  if (conversation.type !== 'ai') return;
  if (messages.filter((message) => message.kind === 'user').length !== 1) {
    return;
  }
  if (!shouldAutoRenameAiTitle(conversation.title)) return;

  const title = deriveAiChatTitle(firstMessageContent);
  if (!title) return;

  try {
    await callPrivateChatRpc<ChatConversation>('chat_update_conversation', {
      p_actor_user_id: auth.user.id,
      p_conversation_id: conversation.id,
      p_input: { title },
      p_ws_id: context.normalizedWsId,
    });
  } catch (error) {
    console.error('Failed to auto-rename native Chat AI conversation', {
      conversationId: conversation.id,
      error,
    });
  }
}

function shouldAutoRenameAiTitle(title?: string | null) {
  const normalized = title?.trim().toLowerCase();
  return (
    !normalized ||
    normalized === 'mira' ||
    normalized === 'new chat' ||
    normalized === 'new ai chat' ||
    normalized === 'untitled chat' ||
    normalized === 'ai agent'
  );
}

function deriveAiChatTitle(content: string) {
  const cleaned = content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !/^\[(?:image attached|file:.+)\]$/iu.test(line))
    .join(' ')
    .replace(/\s+/gu, ' ')
    .trim();

  if (!cleaned) return null;
  if (cleaned.length <= 64) return cleaned;

  const truncated = cleaned.slice(0, 64);
  const lastSpace = truncated.lastIndexOf(' ');
  return `${(lastSpace > 24 ? truncated.slice(0, lastSpace) : truncated).trim()}...`;
}

export function getAiChatAttachmentPlaceholderContent(
  attachments: ChatMessageAttachmentInput[]
) {
  return attachments
    .map((attachment) =>
      attachment.contentType?.startsWith('image/')
        ? '[Image attached]'
        : `[File: ${attachment.filename}]`
    )
    .join('\n')
    .trim();
}

export async function consumeAiResponseTextDeltas(
  response: Response,
  onDelta?: (delta: string) => void,
  onPart?: (part: Record<string, unknown>) => void
) {
  if (!response.body) return '';

  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  let buffer = '';
  let text = '';

  while (true) {
    const { done, value } = await reader.read();
    if (value) {
      buffer += decoder.decode(value, { stream: !done });
      const events = buffer.split('\n\n');
      buffer = events.pop() ?? '';

      for (const event of events) {
        text += emitAiTextDeltaFromSseEvent(event, onDelta, onPart);
      }
    }

    if (done) break;
  }

  text += emitAiTextDeltaFromSseEvent(buffer, onDelta, onPart);
  return text;
}

function emitAiTextDeltaFromSseEvent(
  event: string,
  onDelta?: (delta: string) => void,
  onPart?: (part: Record<string, unknown>) => void
) {
  if (!event.trim()) return '';

  const data = event
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart())
    .join('\n')
    .trim();

  if (!data || data === '[DONE]') return '';

  try {
    const chunk = JSON.parse(data) as Record<string, unknown>;
    if (chunk.type === 'text-delta' && typeof chunk.delta === 'string') {
      onDelta?.(chunk.delta);
      return chunk.delta;
    } else if (
      chunk.type === 'reasoning-delta' &&
      typeof chunk.delta === 'string'
    ) {
      onPart?.({ type: 'reasoning', text: chunk.delta, streaming: true });
    } else if (shouldForwardAiStreamPart(chunk)) {
      onPart?.(chunk);
    }
  } catch {
    // Ignore malformed stream chunks from upstream; the AI route still owns
    // final persistence and error reporting.
  }
  return '';
}

function shouldForwardAiStreamPart(chunk: Record<string, unknown>) {
  const type = typeof chunk.type === 'string' ? chunk.type : '';
  return (
    type === 'source-url' ||
    type === 'dynamic-tool' ||
    type.startsWith('tool-') ||
    type.endsWith('-tool-call') ||
    type.endsWith('-tool-result')
  );
}

export function splitAiAssistantContent(content: string) {
  const parts = content
    .split(
      new RegExp(`\\s*${escapeRegExp(AI_MESSAGE_SPLIT_DECORATOR)}\\s*`, 'gu')
    )
    .map((part) => part.trim())
    .filter(Boolean);

  return parts.length > 0 ? parts : [content.trim()].filter(Boolean);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

export function toAiChatUiMessages(messages: ChatMessage[]): UiMessageForAi[] {
  const uiMessages = messages
    .filter((message) => message.content.trim())
    .map(
      (message): UiMessageForAi => ({
        id: message.id,
        parts: [{ text: message.content, type: 'text' }],
        role: message.kind,
      })
    );

  if (uiMessages.length > 0) return withAiMessageSplitInstruction(uiMessages);

  return withAiMessageSplitInstruction([
    {
      id: randomUUID(),
      parts: [
        {
          text: 'Continue this migrated AI chat in Tuturuuu Chat.',
          type: 'text',
        },
      ],
      role: 'system',
    },
  ]);
}

export function toNativeAiUiMessages(
  messages: ChatMessage[],
  systemPrompt?: string | null
): UiMessageForAi[] {
  const uiMessages = messages.flatMap((message): UiMessageForAi[] => {
    if (message.kind !== 'assistant' && message.kind !== 'user') return [];
    const content =
      message.content.trim() ||
      getAiChatAttachmentPlaceholderContent(
        message.attachments.map((attachment) => ({
          contentType: attachment.contentType,
          filename: attachment.filename,
          path: attachment.storagePath,
        }))
      );
    return content
      ? [
          {
            id: message.id,
            parts: [{ text: content, type: 'text' }],
            role: message.kind,
          },
        ]
      : [];
  });

  const prompt = systemPrompt?.trim();
  if (!prompt) return withAiMessageSplitInstruction(uiMessages);

  return withAiMessageSplitInstruction([
    {
      id: randomUUID(),
      parts: [{ text: prompt, type: 'text' }],
      role: 'system',
    },
    ...uiMessages,
  ]);
}

function withAiMessageSplitInstruction(messages: UiMessageForAi[]) {
  return [
    {
      id: randomUUID(),
      parts: [{ text: AI_MESSAGE_SPLIT_INSTRUCTION, type: 'text' }],
      role: 'system',
    },
    ...messages,
  ] satisfies UiMessageForAi[];
}

export async function callAiChatRoute({
  chatId,
  creditSource,
  creditWsId,
  messages,
  miraMode,
  model,
  observabilityContext,
  request,
  supabase,
  thinkingMode,
  user,
  wsId,
}: {
  chatId: string;
  creditSource: 'personal' | 'workspace';
  creditWsId?: string;
  messages: UiMessageForAi[];
  miraMode: boolean;
  model: string;
  observabilityContext?: Record<string, unknown>[];
  request: NextRequest;
  supabase: SessionAuthContext['supabase'];
  thinkingMode: 'fast' | 'thinking';
  user: SessionAuthContext['user'];
  wsId: string;
}) {
  const headers = new Headers(request.headers);
  headers.set('content-type', 'application/json');
  headers.delete('content-length');

  const aiRequest = new NextRequest(request.url, {
    body: JSON.stringify({
      creditSource,
      id: chatId,
      isMiraMode: miraMode,
      messages,
      model,
      observabilityContext,
      thinkingMode,
      workspaceContextId: wsId,
      wsId,
      ...(creditWsId ? { creditWsId } : {}),
    }),
    headers,
    method: 'POST',
  });

  return createAiChatPost({
    serverAPIKeyFallback: true,
    resolveAuth: async () => ({
      ok: true,
      supabase,
      user,
    }),
  })(aiRequest);
}

export function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function normalizeAiChatModel(model: string | null) {
  if (!model?.trim()) return GEMINI_31_FLASH_LITE_GATEWAY_MODEL;
  return resolveGatewayModelId(model.trim());
}

export function normalizeNativeAiModel(model: string | null) {
  if (!model?.trim()) return GEMINI_31_FLASH_LITE_GATEWAY_MODEL;
  return resolveGatewayModelId(model.trim());
}

export function buildNativeAiObservabilityContext(messages: ChatMessage[]) {
  return messages.slice(-20).map((message) => {
    const chars = message.content.length;

    return {
      chars,
      id: message.id,
      kind: message.kind,
      label:
        message.kind === 'assistant'
          ? 'Assistant message'
          : message.kind === 'system'
            ? 'System message'
            : 'User message',
      tokensEstimate: Math.ceil(chars / 4),
    };
  });
}
