'use client';

import { Bot, Loader2, RefreshCw, Send, Sparkles } from '@tuturuuu/icons';
import type { ChatMessage } from '@tuturuuu/internal-api';
import type { AiAgentExternalThread } from '@tuturuuu/internal-api/infrastructure/ai';
import { Button } from '@tuturuuu/ui/button';
import { Textarea } from '@tuturuuu/ui/textarea';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'use-intl';
import type { ChannelLookup } from './external-chats-types';
import { formatDateTime } from './external-chats-utils';

export function ExternalThreadPanel({
  channelByKey,
  draft,
  isDraftPending,
  isLoadingMessages,
  isSendPending,
  isSyncing,
  messages,
  onDraft,
  onDraftChange,
  onPromptChange,
  onSend,
  onSync,
  prompt,
  thread,
}: {
  channelByKey: ChannelLookup;
  draft: string;
  isDraftPending: boolean;
  isLoadingMessages: boolean;
  isSendPending: boolean;
  isSyncing: boolean;
  messages: ChatMessage[];
  onDraft: () => void;
  onDraftChange: (value: string) => void;
  onPromptChange: (value: string) => void;
  onSend: () => void;
  onSync: () => void;
  prompt: string;
  thread: AiAgentExternalThread | null;
}) {
  const t = useTranslations('ai-agents-settings');

  return (
    <div className="flex min-h-0 flex-col gap-3">
      {thread ? (
        <>
          <ThreadHeader
            channelByKey={channelByKey}
            isSyncing={isSyncing}
            onSync={onSync}
            thread={thread}
          />
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto rounded-md border border-border bg-background p-4">
            {messages.map((message) => (
              <ExternalMessageBubble key={message.id} message={message} />
            ))}
            {isLoadingMessages ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Loader2 className="size-4 animate-spin" />
                {t('external.loading_messages')}
              </div>
            ) : null}
          </div>
          <div className="grid gap-3 rounded-md border border-border bg-background p-3 lg:grid-cols-2">
            <Textarea
              onChange={(event) => onPromptChange(event.target.value)}
              placeholder={t('external.prompt_placeholder')}
              rows={4}
              value={prompt}
            />
            <Textarea
              onChange={(event) => onDraftChange(event.target.value)}
              placeholder={t('external.draft_placeholder')}
              rows={4}
              value={draft}
            />
            <div className="flex flex-wrap gap-2 lg:col-span-2">
              <Button
                disabled={isDraftPending}
                onClick={onDraft}
                type="button"
                variant="secondary"
              >
                {isDraftPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Sparkles className="size-4" />
                )}
                {t('actions.draft')}
              </Button>
              <Button
                disabled={!draft.trim() || isSendPending}
                onClick={onSend}
                type="button"
              >
                {isSendPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" />
                )}
                {t('actions.send')}
              </Button>
            </div>
          </div>
        </>
      ) : (
        <div className="grid h-full min-h-80 place-items-center rounded-md border border-border border-dashed text-muted-foreground text-sm">
          {t('external.no_thread')}
        </div>
      )}
    </div>
  );
}

function ThreadHeader({
  channelByKey,
  isSyncing,
  onSync,
  thread,
}: {
  channelByKey: ChannelLookup;
  isSyncing: boolean;
  onSync: () => void;
  thread: AiAgentExternalThread;
}) {
  const t = useTranslations('ai-agents-settings');
  const channel = channelByKey.get(`${thread.agentId}:${thread.channelId}`);

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border bg-background p-3 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <Bot className="size-4 text-primary" />
          <h3 className="truncate font-semibold">
            {thread.title || thread.externalThreadId}
          </h3>
        </div>
        <div className="truncate text-muted-foreground text-sm">
          {channel?.agent.name ?? thread.agentId} /{' '}
          {channel?.channel.displayName ?? thread.channelId}
        </div>
      </div>
      <Button
        disabled={isSyncing}
        onClick={onSync}
        type="button"
        variant="outline"
      >
        {isSyncing ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <RefreshCw className="size-4" />
        )}
        {t('actions.sync')}
      </Button>
    </div>
  );
}

function ExternalMessageBubble({ message }: { message: ChatMessage }) {
  const t = useTranslations('ai-agents-settings');
  const outbound = message.metadata.direction === 'outbound';

  return (
    <div className={cn('flex', outbound ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'w-fit max-w-[min(40rem,85%)] rounded-md border px-3 py-2 text-sm',
          outbound ? 'border-primary/20 bg-primary/10' : 'bg-muted/40'
        )}
      >
        <div className="mb-1 flex items-center gap-2 text-muted-foreground text-xs">
          <span>{message.sender?.displayName ?? t('external.ai_agent')}</span>
          <span>{formatDateTime(message.createdAt)}</span>
        </div>
        <div className="whitespace-pre-wrap break-words leading-6">
          {message.content}
        </div>
      </div>
    </div>
  );
}
