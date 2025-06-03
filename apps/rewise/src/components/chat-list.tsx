import { ChatMessage } from '@/components/chat-message';
import { OnlineUsers } from '@/components/online-users';
import { type Message } from '@tuturuuu/ai/types';
import { RealtimePresenceState } from '@tuturuuu/supabase/next/realtime';
import { Box, Globe, Lock, Sparkle } from '@tuturuuu/ui/icons';
import { Separator } from '@tuturuuu/ui/separator';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { Fragment } from 'react';

interface PresenceUser {
  id: string;
  display_name?: string;
  email?: string;
  avatar_url?: string;
}

interface PresenceState {
  user: PresenceUser;
  online_at: string;
  presence_ref: string;
}

export interface ChatListProps {
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
  presenceState?: RealtimePresenceState<PresenceState>;
  currentUserId?: string;
  // eslint-disable-next-line no-unused-vars
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
  presenceState,
  currentUserId,
  setInput,
}: ChatListProps) {
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
                    ? 'border-dynamic-green/20 bg-dynamic-green/10 text-dynamic-green'
                    : 'border-dynamic-red/20 bg-dynamic-red/10 text-dynamic-red'
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
                <span className="border-dynamic-yellow/20 bg-dynamic-yellow/10 text-dynamic-yellow inline-flex items-center gap-1 rounded border px-1 py-0.5 font-mono font-semibold lowercase">
                  <Sparkle className="h-3 w-3" />
                  {chatModel}
                </span>
              )}
              {chatSummary && (
                <span className="border-dynamic-purple/20 bg-dynamic-purple/10 text-dynamic-purple inline-flex items-center gap-1 rounded border px-1 py-0.5 font-mono font-semibold lowercase">
                  <Box className="h-3 w-3" />
                  {t('summarized')}
                </span>
              )}
            </div>

            {presenceState && (
              <div className="mt-4 flex justify-center">
                <OnlineUsers
                  presenceState={presenceState}
                  currentUserId={currentUserId}
                />
              </div>
            )}

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
                    {chatSummary?.trim()}
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
