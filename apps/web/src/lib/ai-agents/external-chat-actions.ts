import 'server-only';

import { google } from '@ai-sdk/google';
import { generateText, type ModelMessage } from 'ai';
import { getAiAgentById } from './agent-registry';
import {
  getAiAgentExternalThread,
  listAiAgentExternalThreadMessages,
  markAiAgentExternalThreadSynced,
  persistAiAgentExternalSdkMessage,
} from './external-chat-mirror';
import { createAiAgentChatRuntime } from './runtime';

export interface AiAgentExternalSyncResult {
  message: string | null;
  ok: boolean;
  synced: number;
}

export interface AiAgentExternalDraftResult {
  draft: string;
  sourceMessages: number;
}

async function resolveExternalThreadContext({
  origin,
  threadId,
}: {
  origin?: string | null;
  threadId: string;
}) {
  const externalThread = await getAiAgentExternalThread({ threadId });
  if (!externalThread) {
    throw new Error('external_thread_not_found');
  }

  const agent = await getAiAgentById({
    agentId: externalThread.agentId,
    origin,
  });
  const channel = agent?.channels.find(
    (candidate) => candidate.id === externalThread.channelId
  );

  if (!agent || !channel) {
    throw new Error('agent_channel_not_found');
  }

  return { agent, channel, externalThread };
}

export async function syncAiAgentExternalThread({
  limit = 80,
  origin,
  threadId,
}: {
  limit?: number;
  origin?: string | null;
  threadId: string;
}): Promise<AiAgentExternalSyncResult> {
  const { agent, channel, externalThread } = await resolveExternalThreadContext(
    {
      origin,
      threadId,
    }
  );

  if (channel.historySyncEnabled === false) {
    return {
      message: 'History sync is disabled for this channel.',
      ok: false,
      synced: 0,
    };
  }

  try {
    const chat = await createAiAgentChatRuntime({ agent, channel });
    const sdkThread = chat.thread(externalThread.externalThreadId);
    let synced = 0;

    for await (const message of sdkThread.messages) {
      await persistAiAgentExternalSdkMessage({
        agent,
        channel,
        direction: message.author.isMe ? 'outbound' : 'inbound',
        message,
        platformUserId: null,
        thread: sdkThread,
      });
      synced += 1;

      if (synced >= limit) break;
    }

    await markAiAgentExternalThreadSynced({ threadId });

    return { message: null, ok: true, synced };
  } catch (error) {
    return {
      message:
        error instanceof Error
          ? error.message
          : 'External history sync failed.',
      ok: false,
      synced: 0,
    };
  }
}

export async function draftAiAgentExternalResponse({
  customPrompt,
  origin,
  threadId,
}: {
  customPrompt: string;
  origin?: string | null;
  threadId: string;
}): Promise<AiAgentExternalDraftResult> {
  const { agent, channel } = await resolveExternalThreadContext({
    origin,
    threadId,
  });
  const messages = await listAiAgentExternalThreadMessages({
    limit: 40,
    threadId,
  });
  const modelMessages: ModelMessage[] = [
    {
      content: `${agent.instructions}

You are drafting a response for ${channel.displayName} (${channel.adapter}).
Use the mirrored external chat history below. Return only the message draft the operator can edit and send.`,
      role: 'system',
    },
    {
      content: `${formatExternalTranscript(messages)}

Operator prompt:
${customPrompt || 'Draft the best helpful response for the latest external message.'}`,
      role: 'user',
    },
  ];

  const result = await generateText({
    maxOutputTokens: 800,
    messages: modelMessages,
    model: google(bareGoogleModel(agent.modelId)),
    temperature: agent.temperature ?? 0.4,
  });

  return {
    draft: result.text.trim(),
    sourceMessages: messages.length,
  };
}

export async function sendAiAgentExternalResponse({
  actorUserId,
  content,
  origin,
  threadId,
}: {
  actorUserId: string;
  content: string;
  origin?: string | null;
  threadId: string;
}) {
  const { agent, channel, externalThread } = await resolveExternalThreadContext(
    {
      origin,
      threadId,
    }
  );
  const chat = await createAiAgentChatRuntime({ agent, channel });
  const sdkThread = chat.thread(externalThread.externalThreadId);
  const sent = await sdkThread.post(content);

  return await persistAiAgentExternalSdkMessage({
    agent,
    channel,
    direction: 'outbound',
    message: sent,
    platformUserId: actorUserId,
    thread: sdkThread,
  });
}

function bareGoogleModel(modelId: string) {
  return modelId.split('/').at(-1) || 'gemini-3.1-flash-lite';
}

function formatExternalTranscript(
  messages: Awaited<ReturnType<typeof listAiAgentExternalThreadMessages>>
) {
  if (messages.length === 0) {
    return 'No mirrored external messages are available yet.';
  }

  return messages
    .slice(-30)
    .map((message) => {
      const author =
        message.sender?.displayName ??
        (message.kind === 'assistant' ? 'AI agent' : 'External user');
      return `[${message.createdAt}] ${author}: ${message.content}`;
    })
    .join('\n');
}
