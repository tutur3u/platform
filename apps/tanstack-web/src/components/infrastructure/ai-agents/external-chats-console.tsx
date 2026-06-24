'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AiAgentDefinition } from '@tuturuuu/internal-api/infrastructure/ai';
import {
  draftAiAgentExternalResponse,
  listAiAgentExternalMessages,
  listAiAgentExternalThreads,
  sendAiAgentExternalResponse,
  syncAiAgentExternalThread,
} from '@tuturuuu/internal-api/infrastructure/ai';
import { toast } from '@tuturuuu/ui/sonner';
import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'use-intl';
import { buildChannelLookup } from './external-chats-utils';
import { ExternalThreadList } from './external-thread-list';
import { ExternalThreadPanel } from './external-thread-panel';

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
      <ExternalThreadList
        channelByKey={channelByKey}
        isFetching={threadsQuery.isFetching}
        onRefresh={() => refreshThreadData(selectedThread?.id ?? null)}
        onSelect={setSelectedThreadId}
        selectedThreadId={selectedThread?.id ?? null}
        threads={threads}
      />
      <ExternalThreadPanel
        channelByKey={channelByKey}
        draft={draft}
        isDraftPending={draftMutation.isPending}
        isLoadingMessages={messagesQuery.isLoading}
        isSendPending={sendMutation.isPending}
        isSyncing={syncMutation.isPending}
        messages={messagesQuery.data?.messages ?? []}
        onDraft={() => {
          if (selectedThread) {
            draftMutation.mutate(selectedThread.id);
          }
        }}
        onDraftChange={setDraft}
        onPromptChange={setPrompt}
        onSend={() => {
          if (selectedThread) {
            sendMutation.mutate(selectedThread.id);
          }
        }}
        onSync={() => {
          if (selectedThread) {
            syncMutation.mutate(selectedThread.id);
          }
        }}
        prompt={prompt}
        thread={selectedThread}
      />
    </section>
  );
}
