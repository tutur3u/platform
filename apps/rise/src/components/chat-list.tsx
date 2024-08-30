import { ChatMessage } from '@/components/chat-message';
import { Separator } from '@repo/ui/components/ui/separator';
import { cn } from '@repo/ui/lib/utils';
import { type Message } from 'ai';
import { Box, Globe, Lock, Sparkle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Fragment } from 'react';

export interface ChatList {
  chatId?: string | null;
  chatTitle?: string | null;
  chatIsPublic?: boolean;
  chatModel?: string | null;
  chatSummary?: string | null;
  titleLoading?: boolean;
  messages: (Message & {
    chat_id?: string;
    model?: string;
    created_at?: string;
  })[];
  embeddedUrl?: string;
  locale: string;
  model?: string;
  anonymize?: boolean;
  summarizing?: boolean;
  setInput: (input: string) => void;
}

export function ChatList({
  chatId,
  chatTitle,
  chatIsPublic,
  chatModel,
  chatSummary,
  messages,
  embeddedUrl,
  locale,
  model,
  anonymize,
  summarizing,
  setInput,
}: ChatList) {
  const t = useTranslations('ai_chat');
  if (!messages.length) return null;

  return (
    <div
      className={`relative ${
        embeddedUrl ? 'w-full' : 'mx-auto lg:max-w-4xl xl:max-w-6xl'
      }`}
    >
      {(!!chatTitle || !!chatId) && (
        <Fragment
          key={`chat-${chatId}-${chatTitle}-${chatIsPublic}-${chatModel}-${chatSummary}`}
        >
          <div
            className={`bg-foreground/5 rounded-lg border p-4 text-center text-2xl font-semibold ${
              chatTitle == undefined && !!chatId
                ? 'animate-pulse text-transparent'
                : ''
            }`}
          >
            {chatTitle == undefined && !!chatId ? '...' : chatTitle || '...'}

            <div className="mt-2 flex flex-wrap items-center justify-center gap-1 text-xs">
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded border px-1 py-0.5 font-mono font-semibold lowercase',
                  chatIsPublic
                    ? 'bg-dynamic-green/10 text-dynamic-green border-dynamic-green/20'
                    : 'bg-dynamic-red/10 text-dynamic-red border-dynamic-red/20'
                )}
              >
                {chatIsPublic ? (
                  <>
                    <Globe className="h-3 w-3" />
                    {t('public')}
                  </>
                ) : (
                  <>
                    <Lock className="h-3 w-3" />
                    {t('only_me')}
                  </>
                )}
              </span>
              {chatModel && (
                <span className="bg-dynamic-yellow/10 text-dynamic-yellow border-dynamic-yellow/20 inline-flex items-center gap-1 rounded border px-1 py-0.5 font-mono font-semibold lowercase">
                  <Sparkle className="h-3 w-3" />
                  {chatModel}
                </span>
              )}
              {chatSummary && (
                <span className="bg-dynamic-purple/10 text-dynamic-purple border-dynamic-purple/20 inline-flex items-center gap-1 rounded border px-1 py-0.5 font-mono font-semibold lowercase">
                  <Box className="h-3 w-3" />
                  {t('summarized')}
                </span>
              )}
            </div>

            {(chatSummary || summarizing) && (
              <Fragment key={`chat-${chatId}-${chatSummary}`}>
                <Separator className="my-2" />
                <div className="mb-2 text-base font-bold uppercase tracking-widest">
                  {t('summary')}
                </div>
                {!chatSummary && summarizing ? (
                  <div className="bg-foreground/5 h-32 w-full animate-pulse rounded border" />
                ) : (
                  <div className="bg-foreground/5 w-full whitespace-pre-wrap break-words rounded border p-2 text-start text-lg font-normal">
                    {chatSummary}
                  </div>
                )}
              </Fragment>
            )}
          </div>
          <Separator className="my-4 md:mb-8" />
        </Fragment>
      )}

      {messages.map((message, index) => (
        <div key={index}>
          <ChatMessage
            message={{
              ...message,
              model:
                message.model || (message.role === 'user' ? undefined : model),
              content: message.content.trim(),
            }}
            setInput={setInput}
            embeddedUrl={embeddedUrl}
            locale={locale}
            anonymize={anonymize}
          />
          {index < messages.length - 1 && (
            <Separator className="my-4 md:my-8" />
          )}
        </div>
      ))}
    </div>
  );
}
