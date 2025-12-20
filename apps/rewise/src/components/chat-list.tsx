import type { UIMessage } from '@tuturuuu/ai/types';
import { Box, Globe, Lock, Sparkle } from '@tuturuuu/icons';
import type { RealtimePresenceState } from '@tuturuuu/supabase/next/realtime';
import { Separator } from '@tuturuuu/ui/separator';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { Fragment } from 'react';
import { ChatMessage } from '@/components/chat-message';
import { OnlineUsers } from '@/components/online-users';

interface PresenceUser {
  id: string;
  display_name?: string;
  email?: string;
  avatar_url?: string;
}

interface PresenceState {
  presence_ref: string;
  user: PresenceUser;
  online_at: string;
}

export interface ChatListProps {
  chatId?: string | null;
  chatTitle?: string | null;
  chatIsPublic?: boolean;
  chatModel?: string | null;
  chatSummary?: string | null;
  titleLoading?: boolean;
  messages: (UIMessage & {
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
        embeddedUrl ? 'w-full' : 'mx-auto lg:max-w-3xl xl:max-w-4xl'
      }`}
    >
      {(!!chatTitle || !!chatId) && (
        <Fragment
          key={`chat-${chatId}-${chatTitle}-${chatIsPublic}-${chatModel}-${chatSummary}`}
        >
          <div
            className={`rounded-lg border bg-foreground/5 p-4 text-center font-semibold text-2xl ${
              chatTitle === undefined && !!chatId
                ? 'animate-pulse text-transparent'
                : ''
            }`}
          >
            {chatTitle === undefined && !!chatId ? '...' : chatTitle || '...'}

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
                <span className="inline-flex items-center gap-1 rounded border border-dynamic-yellow/20 bg-dynamic-yellow/10 px-1 py-0.5 font-mono font-semibold text-dynamic-yellow lowercase">
                  <Sparkle className="h-3 w-3" />
                  {chatModel}
                </span>
              )}
              {chatSummary && (
                <span className="inline-flex items-center gap-1 rounded border border-dynamic-purple/20 bg-dynamic-purple/10 px-1 py-0.5 font-mono font-semibold text-dynamic-purple lowercase">
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
                <div className="mb-2 font-bold text-base uppercase tracking-widest">
                  {t('summary')}
                </div>
                {!chatSummary && summarizing ? (
                  <div className="h-32 w-full animate-pulse rounded border bg-foreground/5" />
                ) : (
                  <div className="wrap-break-word w-full whitespace-pre-wrap rounded border bg-foreground/5 p-2 text-start font-normal text-lg">
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
        <div key={`${message.role}-${message.id}-${index}`}>
          <ChatMessage
            message={{
              ...message,
              model:
                message.model || (message.role === 'user' ? undefined : model),
              parts: message.parts,
              metadata: message.metadata as
                | {
                    response_types?: (
                      | 'summary'
                      | 'notes'
                      | 'multi_choice_quiz'
                      | 'paragraph_quiz'
                      | 'flashcards'
                    )[];
                  }
                | undefined,
            }}
            setInput={setInput}
            embeddedUrl={embeddedUrl}
            locale={locale}
            anonymize={anonymize}
          />
        </div>
      ))}
    </div>
  );
}
