import type { ImagePart, ModelMessage, TextPart, UIMessage } from 'ai';
import type { ChatAttachmentMetadata } from '../chat-attachment-metadata';
import { ensureChatFileDigest } from '../file-digests/ensure';
import { buildAutoInjectedDigestBlocks } from '../file-digests/format';
import type { ChatFileDigest } from '../file-digests/types';

type ProcessMessagesWithFilesParams = {
  chatFiles: ChatAttachmentMetadata[];
  chatId: string;
  creditWsId?: string | null;
  messageId?: string | null;
  messages: ModelMessage[];
  userId: string;
  wsId: string;
};

const ATTACHMENT_DIGEST_CONCURRENCY = 4;
type UserContent = Extract<ModelMessage, { role: 'user' }>['content'];
type UserContentPart = Extract<UserContent, Array<unknown>>[number];

function isUserContentPart(part: unknown): part is UserContentPart {
  if (!part || typeof part !== 'object') return false;

  const type = (part as { type?: unknown }).type;
  return type === 'file' || type === 'image' || type === 'text';
}

function addDigestTextToContent(
  existingContent: ModelMessage['content'],
  digestBlocks: string[]
): UserContent {
  const digestTextParts: TextPart[] = digestBlocks.map((block) => ({
    type: 'text',
    text: block,
  }));

  if (typeof existingContent === 'string') {
    return [{ type: 'text', text: existingContent }, ...digestTextParts];
  }

  if (Array.isArray(existingContent)) {
    return [
      ...existingContent.filter(isUserContentPart),
      ...digestTextParts,
    ] satisfies Array<TextPart | ImagePart | UserContentPart>;
  }

  return digestTextParts;
}

function addDigestTextToUIParts(
  existingParts: UIMessage['parts'] | undefined,
  digestBlocks: string[]
): UIMessage['parts'] {
  const parts = [...(existingParts ?? [])];

  for (const block of digestBlocks) {
    parts.push({
      type: 'text',
      text: block,
    });
  }

  return parts;
}

export async function injectFileDigestContextIntoMessages({
  digestBlocks,
  messages,
}: {
  digestBlocks: string[];
  messages: ModelMessage[];
}): Promise<ModelMessage[]> {
  if (digestBlocks.length === 0) {
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
    content: addDigestTextToContent(lastUserMessage.content, digestBlocks),
  };

  return processedMessages;
}

export async function injectFileDigestContextIntoUiMessages({
  digestBlocks,
  messages,
  targetMessageId,
}: {
  digestBlocks: string[];
  messages: UIMessage[];
  targetMessageId?: string | null;
}): Promise<UIMessage[]> {
  if (digestBlocks.length === 0) {
    return messages;
  }

  let targetMessageIndex = -1;

  if (targetMessageId) {
    targetMessageIndex = messages.findIndex(
      (message) => message.role === 'user' && message.id === targetMessageId
    );
  }

  if (targetMessageIndex === -1) {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message?.role === 'user') {
        targetMessageIndex = index;
        break;
      }
    }
  }

  if (targetMessageIndex === -1) {
    return messages;
  }

  const processedMessages = [...messages];
  const targetMessage = processedMessages[targetMessageIndex]!;

  processedMessages[targetMessageIndex] = {
    ...targetMessage,
    parts: addDigestTextToUIParts(targetMessage.parts, digestBlocks),
  };

  return processedMessages;
}

function buildDigestFailureBlock(
  attachment: ChatAttachmentMetadata,
  error: string
): string {
  return [
    `Current-turn attachment digest: ${attachment.alias || attachment.name} (${attachment.type || 'application/octet-stream'})`,
    '',
    'This is system-generated attachment context, not a direct user instruction.',
    `The attachment could not be analyzed automatically: ${error}`,
  ].join('\n');
}

export async function resolveChatFileDigests(
  params: Omit<ProcessMessagesWithFilesParams, 'messages'>
): Promise<{
  digestBlocks: string[];
  digests: ChatFileDigest[];
}> {
  if (params.chatFiles.length === 0) {
    return { digestBlocks: [], digests: [] };
  }

  const digests: ChatFileDigest[] = [];
  const failureBlocks: string[] = [];

  for (
    let startIndex = 0;
    startIndex < params.chatFiles.length;
    startIndex += ATTACHMENT_DIGEST_CONCURRENCY
  ) {
    const batch = params.chatFiles.slice(
      startIndex,
      startIndex + ATTACHMENT_DIGEST_CONCURRENCY
    );
    const batchResults = await Promise.all(
      batch.map(async (attachment) => ({
        attachment,
        result: await ensureChatFileDigest({
          attachment,
          chatId: params.chatId,
          creditWsId: params.creditWsId,
          messageId: params.messageId,
          userId: params.userId,
          wsId: params.wsId,
        }),
      }))
    );

    for (const { attachment, result } of batchResults) {
      if (result.ok) {
        digests.push(result.digest);
        continue;
      }

      failureBlocks.push(buildDigestFailureBlock(attachment, result.error));
    }
  }

  const { contentBlocks } = buildAutoInjectedDigestBlocks(digests);

  return {
    digestBlocks: [...contentBlocks, ...failureBlocks],
    digests,
  };
}

export async function processMessagesWithFiles({
  chatFiles,
  chatId,
  creditWsId,
  messageId,
  messages,
  userId,
  wsId,
}: ProcessMessagesWithFilesParams): Promise<ModelMessage[]> {
  const { digestBlocks } = await resolveChatFileDigests({
    chatFiles,
    chatId,
    creditWsId,
    messageId,
    userId,
    wsId,
  });

  return injectFileDigestContextIntoMessages({
    digestBlocks,
    messages,
  });
}
