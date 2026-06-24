'use client';

import { MessageSquareText, RefreshCw } from '@tuturuuu/icons';
import type { AiAgentExternalThread } from '@tuturuuu/internal-api/infrastructure/ai';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'use-intl';
import type { ChannelLookup } from './external-chats-types';
import { formatDateTime } from './external-chats-utils';

export function ExternalThreadList({
  channelByKey,
  isFetching,
  onRefresh,
  onSelect,
  selectedThreadId,
  threads,
}: {
  channelByKey: ChannelLookup;
  isFetching: boolean;
  onRefresh: () => void;
  onSelect: (threadId: string) => void;
  selectedThreadId: string | null;
  threads: AiAgentExternalThread[];
}) {
  const t = useTranslations('ai-agents-settings');

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <MessageSquareText className="size-4 text-primary" />
          <h2 className="font-semibold text-lg">{t('external.title')}</h2>
        </div>
        <Button
          aria-label={t('actions.refresh')}
          disabled={isFetching}
          onClick={onRefresh}
          size="icon"
          type="button"
          variant="outline"
        >
          <RefreshCw className={cn('size-4', isFetching && 'animate-spin')} />
        </Button>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {threads.length === 0 ? (
          <div className="rounded-md border border-border border-dashed p-4 text-muted-foreground text-sm">
            {t('external.empty')}
          </div>
        ) : (
          threads.map((thread) => {
            const channel = channelByKey.get(
              `${thread.agentId}:${thread.channelId}`
            );
            return (
              <button
                className={cn(
                  'flex w-full flex-col gap-2 rounded-md border border-border bg-background p-3 text-left transition-colors hover:bg-muted/40',
                  selectedThreadId === thread.id &&
                    'border-primary/60 bg-primary/5'
                )}
                key={thread.id}
                onClick={() => onSelect(thread.id)}
                type="button"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-medium">
                      {thread.title || thread.externalThreadId}
                    </div>
                    <div className="truncate text-muted-foreground text-xs">
                      {channel?.agent.name ?? thread.agentId} /{' '}
                      {channel?.channel.displayName ?? thread.channelId}
                    </div>
                  </div>
                  <Badge variant="secondary">{thread.adapter}</Badge>
                </div>
                <div className="flex items-center justify-between gap-3 text-muted-foreground text-xs">
                  <span>
                    {t('external.message_count', {
                      count: thread.messageCount,
                    })}
                  </span>
                  <span>{formatDateTime(thread.lastEventAt)}</span>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
