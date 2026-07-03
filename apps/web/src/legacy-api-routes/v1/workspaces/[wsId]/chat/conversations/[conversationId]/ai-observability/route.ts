import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { type NextRequest, NextResponse } from 'next/server';
import { type SessionAuthContext, withSessionAuth } from '@/lib/api-auth';
import {
  canAccessAiChatConversation,
  getAiChatId,
  isAiChatConversationId,
} from '@/lib/chat/agent-discovery';
import {
  type ChatConversation,
  callPrivateChatRpc,
  chatRpcErrorResponse,
  resolveChatRouteContext,
} from '@/lib/chat/private-rpc';
import { serverLogger } from '@/lib/infrastructure/log-drain';

type RouteParams = {
  conversationId: string;
  wsId: string;
};

type AiMessageRow = {
  chat_id: string;
  content: string | null;
  created_at: string;
  id: string;
  metadata: unknown;
  model: string | null;
  role: string;
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
};

type CreditTransactionRow = {
  chat_message_id: string | null;
  cost_usd: string | number | null;
  image_count?: number | null;
  input_tokens?: number | null;
  metadata?: unknown;
  output_tokens?: number | null;
  reasoning_tokens?: number | null;
  search_count?: number | null;
};

type TokenUsage = {
  cachedInputTokens: number;
  cachedOutputTokens: number;
  costUsd: number;
  imageInputCount: number;
  imageOutputCount: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  searchCount: number;
  totalTokens: number;
};

export const GET = withSessionAuth<RouteParams>(
  async (_request: NextRequest, auth, params) => {
    const context = await resolveChatRouteContext({
      auth,
      permission: 'view_chat',
      wsId: params.wsId,
    });
    if (!context.ok) return context.response;

    try {
      const chatId = await resolveObservableAiChatId({
        actorUserId: auth.user.id,
        conversationId: params.conversationId,
        normalizedWsId: context.context.normalizedWsId,
        supabase: auth.supabase,
      });

      if (!chatId) {
        return NextResponse.json(
          { message: 'Conversation is not an AI chat' },
          { status: 400 }
        );
      }

      const messages = await listAiMessages(chatId);
      const transactions = await listAiCreditTransactions(
        messages.map((message) => message.id)
      );
      const transactionsByMessageId =
        groupTransactionsByMessageId(transactions);
      const contextBreakdown = buildContextBreakdown(messages);
      const messageUsages = messages.map((message) =>
        mapMessageUsage({
          contextBreakdown,
          message,
          transactions: transactionsByMessageId.get(message.id) ?? [],
        })
      );

      return NextResponse.json({
        observability: {
          contextBreakdown,
          messages: messageUsages,
          totals: {
            ...sumUsage(messageUsages.map((message) => message.usage)),
            messageCount: messages.length,
          },
        },
      });
    } catch (error) {
      return chatRpcErrorResponse(
        error,
        'Failed to load AI chat observability'
      );
    }
  },
  { allowAppSessionAuth: true, rateLimitKind: 'read' }
);

async function resolveObservableAiChatId({
  actorUserId,
  conversationId,
  normalizedWsId,
  supabase,
}: {
  actorUserId: string;
  conversationId: string;
  normalizedWsId: string;
  supabase: SessionAuthContext['supabase'];
}) {
  if (isAiChatConversationId(conversationId)) {
    const chatId = getAiChatId(conversationId);
    if (!chatId) return null;

    const canAccess = await canAccessAiChatConversation({
      conversationId,
      supabase,
      userId: actorUserId,
    });

    return canAccess ? chatId : null;
  }

  const conversation = await callPrivateChatRpc<ChatConversation>(
    'chat_get_conversation',
    {
      p_actor_user_id: actorUserId,
      p_conversation_id: conversationId,
      p_ws_id: normalizedWsId,
    }
  );

  return conversation?.type === 'ai' ? conversation.id : null;
}

async function listAiMessages(chatId: string) {
  const sbAdmin = await createAdminClient({ noCookie: true });
  const { data, error } = await sbAdmin
    .from('ai_chat_messages')
    .select(
      'id, chat_id, content, created_at, metadata, model, role, prompt_tokens, completion_tokens'
    )
    .eq('chat_id', chatId)
    .order('created_at', { ascending: true });

  if (error) {
    serverLogger.error('Failed to load AI chat messages for observability', {
      chatId,
      error,
    });
    throw error;
  }

  return (data ?? []) as AiMessageRow[];
}

async function listAiCreditTransactions(messageIds: string[]) {
  if (messageIds.length === 0) return [];

  const sbAdmin = await createAdminClient({ noCookie: true });
  const { data, error } = await sbAdmin
    .from('ai_credit_transactions')
    .select(
      'chat_message_id, cost_usd, input_tokens, output_tokens, reasoning_tokens, image_count, search_count, metadata'
    )
    .in('chat_message_id', messageIds);

  if (error) {
    serverLogger.error('Failed to load AI credit transactions for chat', {
      error,
      messageCount: messageIds.length,
    });
    return [];
  }

  return (data ?? []) as CreditTransactionRow[];
}

function groupTransactionsByMessageId(transactions: CreditTransactionRow[]) {
  const grouped = new Map<string, CreditTransactionRow[]>();

  for (const transaction of transactions) {
    if (!transaction.chat_message_id) continue;
    const existing = grouped.get(transaction.chat_message_id) ?? [];
    existing.push(transaction);
    grouped.set(transaction.chat_message_id, existing);
  }

  return grouped;
}

function mapMessageUsage({
  contextBreakdown,
  message,
  transactions,
}: {
  contextBreakdown: ReturnType<typeof buildContextBreakdown>;
  message: AiMessageRow;
  transactions: CreditTransactionRow[];
}) {
  const metadataUsage = readMetadataUsage(message.metadata);
  const transactionUsage = sumUsage(transactions.map(mapTransactionUsage));
  const fallbackUsage = createUsage({
    inputTokens: message.prompt_tokens ?? 0,
    outputTokens: message.completion_tokens ?? 0,
  });
  const usage =
    transactionUsage.totalTokens > 0 || transactionUsage.costUsd > 0
      ? mergeUsage(metadataUsage, transactionUsage)
      : mergeUsage(metadataUsage, fallbackUsage);

  return {
    contentPreview: (message.content ?? '').replace(/\s+/gu, ' ').slice(0, 140),
    contextBreakdown:
      readMetadataContextBreakdown(message.metadata) ?? contextBreakdown,
    createdAt: message.created_at,
    exact: transactions.length > 0,
    id: message.id,
    model: message.model,
    role: message.role,
    usage,
  };
}

function buildContextBreakdown(messages: AiMessageRow[]) {
  return messages.slice(-10).map((message) => {
    const chars = message.content?.length ?? 0;
    return {
      chars,
      id: message.id,
      kind: mapRoleToKind(message.role),
      label:
        message.role.toLowerCase() === 'assistant'
          ? 'Assistant message'
          : message.role.toLowerCase() === 'system'
            ? 'System message'
            : 'User message',
      tokensEstimate: Math.ceil(chars / 4),
    };
  });
}

function mapRoleToKind(role: string) {
  const normalized = role.toLowerCase();
  if (normalized === 'assistant') return 'assistant' as const;
  if (normalized === 'system') return 'system' as const;
  return 'user' as const;
}

function mapTransactionUsage(transaction: CreditTransactionRow): TokenUsage {
  return createUsage({
    costUsd: toNumber(transaction.cost_usd),
    imageInputCount: transaction.image_count ?? 0,
    inputTokens: transaction.input_tokens ?? 0,
    outputTokens: transaction.output_tokens ?? 0,
    reasoningTokens: transaction.reasoning_tokens ?? 0,
    searchCount: transaction.search_count ?? 0,
  });
}

function readMetadataUsage(metadata: unknown): TokenUsage {
  const ai = readRecord(readRecord(metadata)?.ai);
  const usage = readRecord(ai?.usage);

  return createUsage({
    cachedInputTokens: readNumber(usage?.cachedInputTokens),
    cachedOutputTokens: readNumber(usage?.cachedOutputTokens),
    inputTokens: readNumber(usage?.inputTokens),
    outputTokens: readNumber(usage?.outputTokens),
    reasoningTokens: readNumber(usage?.reasoningTokens),
  });
}

function readMetadataContextBreakdown(metadata: unknown) {
  const ai = readRecord(readRecord(metadata)?.ai);
  const observability = readRecord(ai?.observability);
  const contextBreakdown = observability?.contextBreakdown;
  return Array.isArray(contextBreakdown) ? contextBreakdown : null;
}

function mergeUsage(left: TokenUsage, right: TokenUsage): TokenUsage {
  return createUsage({
    cachedInputTokens: left.cachedInputTokens + right.cachedInputTokens,
    cachedOutputTokens: left.cachedOutputTokens + right.cachedOutputTokens,
    costUsd: left.costUsd + right.costUsd,
    imageInputCount: left.imageInputCount + right.imageInputCount,
    imageOutputCount: left.imageOutputCount + right.imageOutputCount,
    inputTokens: Math.max(left.inputTokens, right.inputTokens),
    outputTokens: Math.max(left.outputTokens, right.outputTokens),
    reasoningTokens: Math.max(left.reasoningTokens, right.reasoningTokens),
    searchCount: left.searchCount + right.searchCount,
  });
}

function sumUsage(usages: TokenUsage[]): TokenUsage {
  return usages.reduce(
    (total, usage) =>
      createUsage({
        cachedInputTokens: total.cachedInputTokens + usage.cachedInputTokens,
        cachedOutputTokens: total.cachedOutputTokens + usage.cachedOutputTokens,
        costUsd: total.costUsd + usage.costUsd,
        imageInputCount: total.imageInputCount + usage.imageInputCount,
        imageOutputCount: total.imageOutputCount + usage.imageOutputCount,
        inputTokens: total.inputTokens + usage.inputTokens,
        outputTokens: total.outputTokens + usage.outputTokens,
        reasoningTokens: total.reasoningTokens + usage.reasoningTokens,
        searchCount: total.searchCount + usage.searchCount,
      }),
    createUsage()
  );
}

function createUsage(values: Partial<Omit<TokenUsage, 'totalTokens'>> = {}) {
  const usage = {
    cachedInputTokens: values.cachedInputTokens ?? 0,
    cachedOutputTokens: values.cachedOutputTokens ?? 0,
    costUsd: values.costUsd ?? 0,
    imageInputCount: values.imageInputCount ?? 0,
    imageOutputCount: values.imageOutputCount ?? 0,
    inputTokens: values.inputTokens ?? 0,
    outputTokens: values.outputTokens ?? 0,
    reasoningTokens: values.reasoningTokens ?? 0,
    searchCount: values.searchCount ?? 0,
  };

  return {
    ...usage,
    totalTokens:
      usage.inputTokens +
      usage.outputTokens +
      usage.reasoningTokens +
      usage.cachedInputTokens +
      usage.cachedOutputTokens,
  };
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function toNumber(value: string | number | null | undefined) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}
