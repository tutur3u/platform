import { Bot, Globe2, Loader2, User } from '@tuturuuu/icons';
import type { AIChat, Database } from '@tuturuuu/types/db';
import type { Locale } from '../../lib/platform/locale';

export type PublicAIChatPreview = Pick<
  AIChat,
  'created_at' | 'id' | 'is_public' | 'model' | 'summary' | 'title'
>;

export type PublicAIChatMessage = Pick<
  Database['public']['Tables']['ai_chat_messages']['Row'],
  'chat_id' | 'content' | 'created_at' | 'id' | 'model' | 'role' | 'type'
>;

export type PublicAIChatConversation = {
  chat: PublicAIChatPreview;
  messages: PublicAIChatMessage[];
};

type PublicAIChatMessages = {
  aiChat: string;
  assistant: string;
  empty: string;
  loading: string;
  publicConversation: string;
  summaryFallback: string;
  untitled: string;
  user: string;
};

const messagesByLocale: Record<Locale, PublicAIChatMessages> = {
  en: {
    aiChat: 'AI Chat',
    assistant: 'Assistant',
    empty: 'No messages have been shared in this conversation yet.',
    loading: 'Loading',
    publicConversation: 'Public conversation',
    summaryFallback: 'Discuss with AI about anything, anytime, anywhere.',
    untitled: 'Untitled',
    user: 'User',
  },
  vi: {
    aiChat: 'Tro chuyen AI',
    assistant: 'Tro ly',
    empty: 'Chua co tin nhan nao duoc chia se trong cuoc tro chuyen nay.',
    loading: 'Dang tai',
    publicConversation: 'Cuoc tro chuyen cong khai',
    summaryFallback: 'Tro chuyen voi AI ve moi thu, moi luc, moi noi.',
    untitled: 'Chua dat ten',
    user: 'Nguoi dung',
  },
};

export function getPublicAIChatMessages(locale: Locale) {
  return messagesByLocale[locale];
}

function formatDateTime(locale: Locale, value: string) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function normalizeRole(role: string) {
  return role.toLowerCase();
}

function roleLabel(messages: PublicAIChatMessages, role: string) {
  const normalizedRole = normalizeRole(role);

  if (normalizedRole === 'assistant' || normalizedRole === 'model') {
    return messages.assistant;
  }

  if (normalizedRole === 'user') {
    return messages.user;
  }

  return role;
}

function MessageAvatar({ assistant }: { assistant: boolean }) {
  const Icon = assistant ? Bot : User;

  return (
    <div
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border ${
        assistant
          ? 'border-dynamic-purple/40 bg-dynamic-purple/10 text-dynamic-purple'
          : 'border-dynamic-blue/40 bg-dynamic-blue/10 text-dynamic-blue'
      }`}
    >
      <Icon aria-hidden="true" className="h-4 w-4" />
    </div>
  );
}

function ChatMessage({
  locale,
  message,
  messages,
}: {
  locale: Locale;
  message: PublicAIChatMessage;
  messages: PublicAIChatMessages;
}) {
  const normalizedRole = normalizeRole(message.role);
  const assistant =
    normalizedRole === 'assistant' || normalizedRole === 'model';

  return (
    <article className="flex gap-3 rounded-lg border border-border bg-background p-4">
      <MessageAvatar assistant={assistant} />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-sm">
            {roleLabel(messages, message.role)}
          </span>
          <time
            className="text-muted-foreground text-xs"
            dateTime={message.created_at}
          >
            {formatDateTime(locale, message.created_at)}
          </time>
          {message.model && (
            <span className="rounded-md border border-border px-1.5 py-0.5 text-muted-foreground text-xs">
              {message.model}
            </span>
          )}
        </div>
        <p className="whitespace-pre-wrap break-words text-sm leading-6">
          {message.content || ''}
        </p>
      </div>
    </article>
  );
}

export function PublicAIChatContent({
  conversation,
  locale,
}: {
  conversation: PublicAIChatConversation | null;
  locale: Locale;
}) {
  const messages = getPublicAIChatMessages(locale);

  if (!conversation) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-root-background text-dynamic-foreground">
        <Loader2 aria-hidden="true" className="h-6 w-6 animate-spin" />
        <span className="ml-2">{messages.loading}...</span>
      </div>
    );
  }

  const title = conversation.chat.title || messages.untitled;
  const summary = conversation.chat.summary || messages.summaryFallback;

  return (
    <main className="min-h-screen bg-root-background text-dynamic-foreground">
      <header className="border-dynamic-border/60 border-b bg-background">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-3 px-4 py-6">
          <div className="flex flex-wrap items-center gap-2 text-dynamic-green text-sm">
            <Globe2 aria-hidden="true" className="h-4 w-4" />
            {messages.publicConversation}
          </div>
          <div className="space-y-2">
            <h1 className="font-semibold text-3xl tracking-tight">{title}</h1>
            <p className="max-w-2xl text-muted-foreground text-sm leading-6">
              {summary}
            </p>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-6">
        {conversation.messages.length > 0 ? (
          conversation.messages.map((message) => (
            <ChatMessage
              key={message.id}
              locale={locale}
              message={message}
              messages={messages}
            />
          ))
        ) : (
          <div className="rounded-lg border border-border bg-background p-6 text-center text-muted-foreground text-sm">
            {messages.empty}
          </div>
        )}
      </div>
    </main>
  );
}
