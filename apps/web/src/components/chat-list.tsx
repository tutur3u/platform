import { ChatMessage } from '@/components/chat-message';
import { Separator } from '@repo/ui/components/ui/separator';
import { cn } from '@repo/ui/lib/utils';
import { type Message } from 'ai';
import { Globe, Lock, Sparkles } from 'lucide-react';
import useTranslation from 'next-translate/useTranslation';
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
  setInput,
}: ChatList) {
  const { t } = useTranslation('ai-chat');
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

            <div className="text-xs mt-1 flex justify-center flex-wrap gap-1 items-center">
              <span
                className={cn(
                  'inline-flex items-center gap-1 font-semibold font-mono px-1 py-0.5 border rounded',
                  chatIsPublic
                    ? 'bg-dynamic-green/10 text-dynamic-green border-dynamic-green/20'
                    : 'bg-dynamic-red/10 text-dynamic-red border-dynamic-red/20'
                )}
              >
                {chatIsPublic ? (
                  <>
                    <Lock className="w-3 h-3" />
                    {t('public')}
                  </>
                ) : (
                  <>
                    <Globe className="w-3 h-3" />
                    {t('only_me')}
                  </>
                )}
              </span>
              {chatModel && (
                <span className="font-semibold inline-flex items-center gap-1 font-mono px-1 py-0.5 border rounded bg-dynamic-yellow/10 text-dynamic-yellow border-dynamic-yellow/20">
                  <Sparkles className="w-3 h-3" />
                  {chatModel}
                </span>
              )}
            </div>

            {chatSummary && (
              <>
                <Separator className="my-2" />
                <div className="mb-2 text-base uppercase">{t('summary')}</div>
                <div className="text-start w-full break-words whitespace-pre-wrap font-normal bg-foreground/5 rounded-lg p-2 text-lg">
                  {chatSummary}
                </div>
              </>
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
                message.model || message.role === 'user' ? undefined : model,
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
