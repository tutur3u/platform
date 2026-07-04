import { queryOptions, useQuery } from '@tanstack/react-query';
import { createFileRoute, notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import {
  getPublicAIChatMessages,
  PublicAIChatContent,
  type PublicAIChatConversation,
  type PublicAIChatMessage,
  type PublicAIChatPreview,
} from '../../../../components/ai-chat/public-chat-content';
import { createPageHead } from '../../../../lib/platform/head';
import { resolveMessagesLocale } from '../../../../lib/platform/messages';

const publicChatSelect = 'id,title,summary,created_at,is_public,model';
const publicMessageSelect =
  'id,chat_id,content,created_at,role,type,model,ai_chats!chat_id!inner(is_public)';

type PublicAIChatRouteParams = {
  chatId: string;
  locale: string;
};

type PublicAIChatRow = PublicAIChatPreview;
type PublicAIChatMessageRow = PublicAIChatMessage & {
  ai_chats?: { is_public?: boolean } | { is_public?: boolean }[];
};

function getServerEnvValue(name: string) {
  if (typeof process === 'undefined') {
    return undefined;
  }

  const value = process.env[name]?.trim();
  return value || undefined;
}

function getSupabaseRestUrl(table: string) {
  const rawUrl =
    getServerEnvValue('SUPABASE_SERVER_URL') ??
    getServerEnvValue('SUPABASE_URL') ??
    getServerEnvValue('NEXT_PUBLIC_SUPABASE_URL');

  if (!rawUrl) {
    return null;
  }

  try {
    return new URL(`/rest/v1/${table}`, rawUrl);
  } catch {
    return null;
  }
}

function getSupabaseServiceKey() {
  return (
    getServerEnvValue('SUPABASE_SECRET_KEY') ??
    getServerEnvValue('SUPABASE_SERVICE_ROLE_KEY')
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isPublicAIChatRow(value: unknown): value is PublicAIChatRow {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    value.is_public === true &&
    (typeof value.title === 'string' || value.title === null) &&
    (typeof value.summary === 'string' || value.summary === null) &&
    (typeof value.model === 'string' || value.model === null) &&
    typeof value.created_at === 'string'
  );
}

function isPublicAIChatMessageRow(
  value: unknown
): value is PublicAIChatMessageRow {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.chat_id === 'string' &&
    (typeof value.content === 'string' || value.content === null) &&
    typeof value.created_at === 'string' &&
    typeof value.role === 'string' &&
    typeof value.type === 'string' &&
    (typeof value.model === 'string' || value.model === null)
  );
}

function stripPublicJoin(row: PublicAIChatMessageRow): PublicAIChatMessage {
  const { ai_chats: _aiChats, ...message } = row;
  return message;
}

async function fetchSupabaseJson(url: URL, serviceKey: string) {
  const response = await fetch(url, {
    cache: 'no-store',
    headers: {
      apikey: serviceKey,
      authorization: `Bearer ${serviceKey}`,
    },
  });

  if (!response.ok) {
    return null;
  }

  return response.json() as Promise<unknown>;
}

async function fetchPublicAIChat(chatId: string) {
  const supabaseUrl = getSupabaseRestUrl('ai_chats');
  const serviceKey = getSupabaseServiceKey();

  if (!supabaseUrl || !serviceKey) {
    return null;
  }

  supabaseUrl.searchParams.set('select', publicChatSelect);
  supabaseUrl.searchParams.set('id', `eq.${chatId}`);
  supabaseUrl.searchParams.set('is_public', 'eq.true');
  supabaseUrl.searchParams.set('limit', '1');

  const payload = await fetchSupabaseJson(supabaseUrl, serviceKey);

  if (!Array.isArray(payload)) {
    return null;
  }

  const [chat] = payload;
  return isPublicAIChatRow(chat) ? chat : null;
}

async function fetchPublicAIChatMessages(chatId: string) {
  const supabaseUrl = getSupabaseRestUrl('ai_chat_messages');
  const serviceKey = getSupabaseServiceKey();

  if (!supabaseUrl || !serviceKey) {
    return [];
  }

  supabaseUrl.searchParams.set('select', publicMessageSelect);
  supabaseUrl.searchParams.set('chat_id', `eq.${chatId}`);
  supabaseUrl.searchParams.set('ai_chats.is_public', 'eq.true');
  supabaseUrl.searchParams.set('order', 'created_at.asc');

  const payload = await fetchSupabaseJson(supabaseUrl, serviceKey);

  if (!Array.isArray(payload)) {
    return [];
  }

  return payload.filter(isPublicAIChatMessageRow).map(stripPublicJoin);
}

async function fetchPublicAIChatConversation(
  chatId: string
): Promise<PublicAIChatConversation | null> {
  const chat = await fetchPublicAIChat(chatId);

  if (!chat) {
    return null;
  }

  const messages = await fetchPublicAIChatMessages(chatId);

  return {
    chat,
    messages,
  };
}

const getPublicAIChatConversation = createServerFn({ method: 'GET' })
  .validator((data: { chatId: string }) => data)
  .handler(async ({ data }): Promise<PublicAIChatConversation | null> => {
    const chatId = data.chatId.trim();

    if (!chatId) {
      return null;
    }

    return fetchPublicAIChatConversation(chatId);
  });

function publicAIChatQuery(chatId: string) {
  return queryOptions({
    queryFn: () => getPublicAIChatConversation({ data: { chatId } }),
    queryKey: ['ai-chat', 'public', chatId],
    retry: false,
  });
}

export const Route = createFileRoute('/$locale/ai/chats/$chatId')({
  component: PublicAIChatRoutePage,
  head: ({ loaderData, params }) => {
    const { locale: routeLocale } = params as PublicAIChatRouteParams;
    const locale = resolveMessagesLocale(routeLocale);
    const messages = getPublicAIChatMessages(locale);
    const conversation = loaderData as PublicAIChatConversation | undefined;
    const chatTitle = conversation?.chat.title || messages.untitled;
    const title = `${chatTitle} - ${messages.aiChat}`;

    return createPageHead({
      description: conversation?.chat.summary || messages.summaryFallback,
      locale,
      title,
    });
  },
  loader: async ({ context, params }) => {
    const { chatId = '' } = params as Partial<PublicAIChatRouteParams>;

    if (!chatId) {
      throw notFound();
    }

    const conversation = await context.queryClient.ensureQueryData(
      publicAIChatQuery(chatId)
    );

    if (!conversation) {
      throw notFound();
    }

    return conversation;
  },
});

function PublicAIChatRoutePage() {
  const { chatId, locale } = Route.useParams() as PublicAIChatRouteParams;
  const initialConversation = Route.useLoaderData() as PublicAIChatConversation;
  const conversationQuery = useQuery({
    ...publicAIChatQuery(chatId),
    initialData: initialConversation,
  });
  const messagesLocale = resolveMessagesLocale(locale);

  if (!conversationQuery.data) {
    throw notFound();
  }

  return (
    <PublicAIChatContent
      conversation={conversationQuery.data}
      locale={messagesLocale}
    />
  );
}
