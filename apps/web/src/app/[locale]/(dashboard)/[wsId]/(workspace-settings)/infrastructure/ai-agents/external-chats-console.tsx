'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bot,
  Loader2,
  MessageSquareText,
  RefreshCw,
  Send,
  Sparkles,
} from '@tuturuuu/icons';
import type { ChatMessage } from '@tuturuuu/internal-api';
import {
  type AiAgentDefinition,
  type AiAgentExternalThread,
  draftAiAgentExternalResponse,
  listAiAgentExternalMessages,
  listAiAgentExternalThreads,
  sendAiAgentExternalResponse,
  syncAiAgentExternalThread,
} from '@tuturuuu/internal-api/infrastructure';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { toast } from '@tuturuuu/ui/sonner';
import { Textarea } from '@tuturuuu/ui/textarea';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';

const THREADS_QUERY_KEY = ['infrastructure', 'ai-agents', 'external-threads'];

export function ExternalChatsConsole({
  agents,
}: {
  agents: AiAgentDefinition[];
}) {
  const t = useTranslations('ai-agents-settings');
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');
  const [prompt, setPrompt] = useState('');
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const channelByKey = useMemo(() => buildChannelLookup(agents), [agents]);
  const threadsQuery = useQuery({
    queryFn: () => listAiAgentExternalThreads(),
    queryKey: THREADS_QUERY_KEY,
  });
  const threads = useMemo(
    () => threadsQuery.data?.threads ?? [],
    [threadsQuery.data?.threads]
  );
  const selectedThread =
    threads.find((thread) => thread.id === selectedThreadId) ??
    threads[0] ??
    null;
  const messagesQuery = useQuery({
    enabled: Boolean(selectedThread),
    queryFn: () =>
      listAiAgentExternalMessages(selectedThread?.id ?? '', { limit: 80 }),
    queryKey: [...THREADS_QUERY_KEY, selectedThread?.id, 'messages'],
  });
  const syncMutation = useMutation({
    mutationFn: (threadId: string) => syncAiAgentExternalThread(threadId),
    onError: (error) => toast.error(error.message || t('messages.sync_error')),
    onSuccess: (result) => {
      if (result.ok) {
        toast.success(t('messages.sync_success'));
      } else {
        toast.error(result.message || t('messages.sync_error'));
      }
      refreshThreadData(selectedThread?.id ?? null);
    },
  });
  const draftMutation = useMutation({
    mutationFn: (threadId: string) =>
      draftAiAgentExternalResponse(threadId, prompt),
    onError: (error) => toast.error(error.message || t('messages.draft_error')),
    onSuccess: (result) => {
      setDraft(result.draft);
      toast.success(t('messages.draft_success'));
    },
  });
  const sendMutation = useMutation({
    mutationFn: (threadId: string) =>
      sendAiAgentExternalResponse(threadId, draft),
    onError: (error) => toast.error(error.message || t('messages.send_error')),
    onSuccess: () => {
      setDraft('');
      setPrompt('');
      toast.success(t('messages.send_success'));
      refreshThreadData(selectedThread?.id ?? null);
    },
  });

  useEffect(() => {
    if (
      selectedThreadId &&
      threads.some((thread) => thread.id === selectedThreadId)
    ) {
      return;
    }

    setSelectedThreadId(threads[0]?.id ?? null);
  }, [selectedThreadId, threads]);

  function refreshThreadData(threadId: string | null) {
    void queryClient.invalidateQueries({ queryKey: THREADS_QUERY_KEY });
    if (threadId) {
      void queryClient.invalidateQueries({
        queryKey: [...THREADS_QUERY_KEY, threadId, 'messages'],
      });
    }
  }

  return (
    <section className="grid min-h-[34rem] gap-4 rounded-lg border border-border bg-card p-4 xl:grid-cols-[22rem_minmax(0,1fr)]">
      <div className="flex min-h-0 flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <MessageSquareText className="size-4 text-primary" />
            <h2 className="font-semibold text-lg">{t('external.title')}</h2>
          </div>
          <Button
            aria-label={t('actions.refresh')}
            disabled={threadsQuery.isFetching}
            onClick={() => refreshThreadData(selectedThread?.id ?? null)}
            size="icon"
            type="button"
            variant="outline"
          >
            <RefreshCw
              className={cn(
                'size-4',
                threadsQuery.isFetching && 'animate-spin'
              )}
            />
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
                    selectedThread?.id === thread.id &&
                      'border-primary/60 bg-primary/5'
                  )}
                  key={thread.id}
                  onClick={() => setSelectedThreadId(thread.id)}
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

      <div className="flex min-h-0 flex-col gap-3">
        {selectedThread ? (
          <>
            <ThreadHeader
              channelByKey={channelByKey}
              isSyncing={syncMutation.isPending}
              onSync={() => syncMutation.mutate(selectedThread.id)}
              thread={selectedThread}
            />
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto rounded-md border border-border bg-background p-4">
              {(messagesQuery.data?.messages ?? []).map((message) => (
                <ExternalMessageBubble key={message.id} message={message} />
              ))}
              {messagesQuery.isLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Loader2 className="size-4 animate-spin" />
                  {t('external.loading_messages')}
                </div>
              ) : null}
            </div>
            <div className="grid gap-3 rounded-md border border-border bg-background p-3 lg:grid-cols-2">
              <Textarea
                onChange={(event) => setPrompt(event.target.value)}
                placeholder={t('external.prompt_placeholder')}
                rows={4}
                value={prompt}
              />
              <Textarea
                onChange={(event) => setDraft(event.target.value)}
                placeholder={t('external.draft_placeholder')}
                rows={4}
                value={draft}
              />
              <div className="flex flex-wrap gap-2 lg:col-span-2">
                <Button
                  disabled={draftMutation.isPending}
                  onClick={() => draftMutation.mutate(selectedThread.id)}
                  type="button"
                  variant="secondary"
                >
                  {draftMutation.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Sparkles className="size-4" />
                  )}
                  {t('actions.draft')}
                </Button>
                <Button
                  disabled={!draft.trim() || sendMutation.isPending}
                  onClick={() => sendMutation.mutate(selectedThread.id)}
                  type="button"
                >
                  {sendMutation.isPending ? (
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
    </section>
  );
}

function ThreadHeader({
  channelByKey,
  isSyncing,
  onSync,
  thread,
}: {
  channelByKey: Map<
    string,
    {
      agent: AiAgentDefinition;
      channel: AiAgentDefinition['channels'][number];
    }
  >;
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

function buildChannelLookup(agents: AiAgentDefinition[]) {
  const lookup = new Map<
    string,
    {
      agent: AiAgentDefinition;
      channel: AiAgentDefinition['channels'][number];
    }
  >();

  for (const agent of agents) {
    for (const channel of agent.channels) {
      lookup.set(`${agent.id}:${channel.id}`, { agent, channel });
    }
  }

  return lookup;
}

function formatDateTime(value?: string | null) {
  if (!value) return '';

  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
  }).format(new Date(value));
}
