'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import {
  LoaderCircle,
  MessageSquareText,
  RefreshCw,
  Send,
  Sparkles,
} from '@tuturuuu/icons';
import {
  draftAiAgentExternalResponse,
  listAiAgentExternalThreads,
  sendAiAgentExternalResponse,
  syncAiAgentExternalThread,
} from '@tuturuuu/internal-api/infrastructure/ai';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '../button';
import { toast } from '../sonner';
import { Textarea } from '../textarea';
import {
  type AgentConversationMetadata,
  KeyValue,
  PanelSection,
} from './chat-agent-details-utils';

export function AgentExternalThreadPanel({
  metadata,
  onRefresh,
}: {
  metadata: AgentConversationMetadata;
  onRefresh: () => void;
}) {
  const t = useTranslations('chat');
  const [draft, setDraft] = useState('');
  const [prompt, setPrompt] = useState('');
  const threadId = metadata.externalThreadUuid;
  const threadsQuery = useQuery({
    enabled: Boolean(metadata.agentId && metadata.channelId),
    queryFn: async () => {
      const result = await listAiAgentExternalThreads({
        agentId: metadata.agentId,
        channelId: metadata.channelId,
      });

      return result.threads;
    },
    queryKey: [
      'chat',
      'ai-agent-external-threads',
      metadata.agentId,
      metadata.channelId,
    ],
    staleTime: 30_000,
  });
  const threads = threadsQuery.data ?? [];
  const selectedThread = threadId
    ? threads.find((thread) => thread.id === threadId)
    : null;
  const syncMutation = useMutation({
    mutationFn: (targetThreadId?: string) => {
      if (!targetThreadId) {
        throw new Error(t('agent_external_thread_missing'));
      }
      return syncAiAgentExternalThread(targetThreadId);
    },
    onError: (error) =>
      toast.error(error.message || t('agent_external_sync_failed')),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message || t('agent_external_sync_failed'));
        return;
      }

      toast.success(
        result.synced === 0
          ? t('agent_external_sync_no_new')
          : t('agent_external_sync_success', { count: result.synced })
      );
      void threadsQuery.refetch();
      onRefresh();
    },
  });
  const draftMutation = useMutation({
    mutationFn: () => {
      if (!threadId) throw new Error(t('agent_external_thread_missing'));
      return draftAiAgentExternalResponse(threadId, prompt);
    },
    onError: (error) =>
      toast.error(error.message || t('agent_external_draft_failed')),
    onSuccess: (result) => {
      setDraft(result.draft);
      toast.success(t('agent_external_draft_success'));
    },
  });
  const sendMutation = useMutation({
    mutationFn: () => {
      if (!threadId) throw new Error(t('agent_external_thread_missing'));
      return sendAiAgentExternalResponse(threadId, draft);
    },
    onError: (error) =>
      toast.error(error.message || t('agent_external_send_failed')),
    onSuccess: () => {
      setDraft('');
      setPrompt('');
      toast.success(t('agent_external_send_success'));
      onRefresh();
    },
  });
  const isPending =
    syncMutation.isPending || draftMutation.isPending || sendMutation.isPending;

  return (
    <div className="space-y-4">
      <PanelSection
        icon={<MessageSquareText className="size-4" />}
        title={t('agent_external_thread')}
      >
        <div className="space-y-2">
          <KeyValue label={t('agent_channel_id')} value={metadata.channelId} />
          <KeyValue
            label={t('agent_external_thread_id')}
            value={metadata.externalThreadId ?? threadId ?? t('unknown')}
          />
          <KeyValue
            label={t('agent_external_channel_id')}
            value={metadata.externalChannelId ?? t('unknown')}
          />
          <KeyValue
            label={t('agent_external_message_count')}
            value={String(metadata.messageCount ?? 0)}
          />
          <KeyValue
            label={t('agent_external_last_sync')}
            value={selectedThread?.lastSyncedAt ?? t('unknown')}
          />
        </div>
      </PanelSection>

      {threadId ? (
        <Button
          className="w-full"
          disabled={syncMutation.isPending}
          onClick={() => syncMutation.mutate(threadId)}
          type="button"
          variant="outline"
        >
          {syncMutation.isPending ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
          {t('agent_external_sync')}
        </Button>
      ) : (
        <PanelSection
          icon={<RefreshCw className="size-4" />}
          title={t('agent_external_recent_threads')}
        >
          <div className="space-y-2">
            {threadsQuery.isLoading ? (
              <p className="flex items-center gap-2 text-muted-foreground text-xs">
                <LoaderCircle className="size-3.5 animate-spin" />
                {t('loading_ai_settings')}
              </p>
            ) : threads.length > 0 ? (
              threads.map((thread) => (
                <div
                  className="space-y-2 rounded-md border bg-muted/20 p-2"
                  key={thread.id}
                >
                  <div className="min-w-0 text-xs">
                    <div className="truncate font-medium">
                      {thread.title || thread.externalThreadId}
                    </div>
                    {thread.title ? (
                      <div className="truncate text-muted-foreground">
                        {thread.externalThreadId}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex items-center justify-between gap-2 text-muted-foreground text-xs">
                    <span>
                      {t('agent_external_message_count')}: {thread.messageCount}
                    </span>
                    <Button
                      disabled={syncMutation.isPending}
                      onClick={() => syncMutation.mutate(thread.id)}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      {syncMutation.isPending ? (
                        <LoaderCircle className="size-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="size-3.5" />
                      )}
                      {t('agent_external_sync')}
                    </Button>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-muted-foreground text-xs">
                {t('agent_external_no_threads')}
              </p>
            )}
          </div>
        </PanelSection>
      )}

      {!threadId ? null : (
        <PanelSection
          icon={<Sparkles className="size-4" />}
          title={t('agent_external_response')}
        >
          <div className="space-y-2">
            <Textarea
              onChange={(event) => setPrompt(event.target.value)}
              placeholder={t('agent_external_prompt_placeholder')}
              rows={3}
              value={prompt}
            />
            <Textarea
              onChange={(event) => setDraft(event.target.value)}
              placeholder={t('agent_external_draft_placeholder')}
              rows={5}
              value={draft}
            />
            <div className="grid grid-cols-2 gap-2">
              <Button
                disabled={!threadId || draftMutation.isPending}
                onClick={() => draftMutation.mutate()}
                type="button"
                variant="secondary"
              >
                {draftMutation.isPending ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <Sparkles className="size-4" />
                )}
                {t('agent_external_draft')}
              </Button>
              <Button
                disabled={!threadId || !draft.trim() || sendMutation.isPending}
                onClick={() => sendMutation.mutate()}
                type="button"
              >
                {sendMutation.isPending ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" />
                )}
                {t('agent_external_send')}
              </Button>
            </div>
            {isPending ? (
              <p className="text-muted-foreground text-xs">
                {t('agent_external_refresh_after_action')}
              </p>
            ) : null}
          </div>
        </PanelSection>
      )}
    </div>
  );
}
