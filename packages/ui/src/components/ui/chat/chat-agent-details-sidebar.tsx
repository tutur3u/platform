'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, LoaderCircle } from '@tuturuuu/icons';
import type { ChatConversation } from '@tuturuuu/internal-api';
import type { SaveAiAgentPayload } from '@tuturuuu/internal-api/infrastructure';
import {
  deployAiAgentChannel,
  listAiAgents,
  pauseAiAgentChannel,
  rotateAiAgentChannelSecret,
  saveAiAgent,
  testAiAgentChannel,
} from '@tuturuuu/internal-api/infrastructure';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { Badge } from '../badge';
import { ScrollArea } from '../scroll-area';
import { toast } from '../sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../tabs';
import { AgentExternalThreadPanel } from './chat-agent-details-external-thread-panel';
import { AgentOperationsPanel } from './chat-agent-details-operations-panel';
import { AgentSetupForm } from './chat-agent-details-setup-panel';
import {
  ChannelStatusBadge,
  readAgentConversationMetadata,
} from './chat-agent-details-utils';
import { chatQueryKeys } from './query-keys';

type AgentTab = 'operations' | 'setup' | 'thread';

const AGENT_QUERY_KEY = ['chat', 'infrastructure-ai-agents'] as const;

export function ChatAgentDetailsSidebar({
  conversation,
  open,
}: {
  conversation?: ChatConversation | null;
  open: boolean;
}) {
  const t = useTranslations('chat');
  const queryClient = useQueryClient();
  const metadata = readAgentConversationMetadata(conversation);
  const [secretPreview, setSecretPreview] = useState<{
    label: string;
    value: string;
  } | null>(null);
  const agentsQuery = useQuery({
    enabled: open && Boolean(metadata),
    queryFn: () => listAiAgents(),
    queryKey: AGENT_QUERY_KEY,
    staleTime: 30_000,
  });
  const agent = useMemo(
    () =>
      metadata
        ? agentsQuery.data?.agents.find((item) => item.id === metadata.agentId)
        : undefined,
    [agentsQuery.data?.agents, metadata]
  );
  const channel = useMemo(
    () =>
      metadata && agent
        ? agent.channels.find((item) => item.id === metadata.channelId)
        : undefined,
    [agent, metadata]
  );
  const tabs: AgentTab[] =
    metadata?.source === 'ai-agent-external-thread'
      ? ['setup', 'operations', 'thread']
      : ['setup', 'operations'];
  const refreshAgent = () =>
    queryClient.invalidateQueries({ queryKey: AGENT_QUERY_KEY });
  const refreshChat = () => {
    if (!conversation?.wsId) return;
    void queryClient.invalidateQueries({
      queryKey: chatQueryKeys.all(conversation.wsId),
    });
  };
  const refreshAll = () => {
    void refreshAgent();
    refreshChat();
  };
  const saveMutation = useMutation({
    mutationFn: (payload: SaveAiAgentPayload) => saveAiAgent(payload),
    onError: (error) => toast.error(error.message || t('agent_save_failed')),
    onSuccess: () => {
      toast.success(t('agent_save_success'));
      void refreshAgent();
    },
  });
  const deployMutation = useMutation({
    mutationFn: () =>
      agent && channel
        ? deployAiAgentChannel(agent.id, channel.id)
        : Promise.reject(new Error(t('agent_not_found'))),
    onError: (error) => toast.error(error.message || t('agent_deploy_failed')),
    onSuccess: (result) => {
      if (result.ok) {
        toast.success(t('agent_deploy_success'));
      } else {
        toast.error(result.missing.join(', ') || t('agent_deploy_failed'));
      }
      void refreshAgent();
    },
  });
  const pauseMutation = useMutation({
    mutationFn: () =>
      agent && channel
        ? pauseAiAgentChannel(agent.id, channel.id)
        : Promise.reject(new Error(t('agent_not_found'))),
    onError: (error) => toast.error(error.message || t('agent_pause_failed')),
    onSuccess: () => {
      toast.success(t('agent_pause_success'));
      void refreshAgent();
    },
  });
  const testMutation = useMutation({
    mutationFn: (prompt?: string) =>
      agent && channel
        ? testAiAgentChannel(agent.id, channel.id, prompt)
        : Promise.reject(new Error(t('agent_not_found'))),
    onError: (error) => toast.error(error.message || t('agent_test_failed')),
    onSuccess: (result) => {
      if (result.ok) toast.success(result.response || t('agent_test_success'));
      else toast.error(result.response || t('agent_test_failed'));
    },
  });
  const rotateMutation = useMutation({
    mutationFn: () =>
      agent && channel
        ? rotateAiAgentChannelSecret(agent.id, channel.id, 'webhookSecret')
        : Promise.reject(new Error(t('agent_not_found'))),
    onError: (error) => toast.error(error.message || t('agent_rotate_failed')),
    onSuccess: (result) => {
      setSecretPreview({
        label: result.secret.name,
        value: result.secret.value,
      });
      toast.success(t('agent_secret_rotated'));
      void refreshAgent();
    },
  });
  const isPending =
    saveMutation.isPending ||
    deployMutation.isPending ||
    pauseMutation.isPending ||
    testMutation.isPending ||
    rotateMutation.isPending;

  if (!open) return null;

  return (
    <aside className="hidden w-96 min-w-0 shrink-0 overflow-hidden border-l bg-background md:flex md:flex-col">
      <Tabs
        className="min-h-0 flex-1 gap-0"
        defaultValue="setup"
        orientation="vertical"
      >
        <div className="border-b p-3">
          <h2 className="flex min-w-0 items-center gap-2 font-semibold text-sm">
            <Bot className="size-4 shrink-0" />
            <span className="truncate">{t('agent_details')}</span>
          </h2>
          {agent && channel ? (
            <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5 text-xs">
              <Badge variant={agent.enabled ? 'success' : 'secondary'}>
                {agent.enabled ? t('agent_enabled') : t('agent_disabled')}
              </Badge>
              <ChannelStatusBadge status={channel.status} />
              <span className="min-w-0 truncate text-muted-foreground">
                {agent.id} / {channel.id}
              </span>
            </div>
          ) : null}
          <TabsList
            className={
              tabs.length === 3
                ? 'mt-3 grid h-9 w-full grid-cols-3 rounded-md'
                : 'mt-3 grid h-9 w-full grid-cols-2 rounded-md'
            }
          >
            {tabs.map((tab) => (
              <TabsTrigger className="text-xs" key={tab} value={tab} asChild>
                <button type="button">{t(`agent_tab_${tab}`)}</button>
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          {renderContent({
            agentsError: agentsQuery.error,
            agentsLoading: agentsQuery.isLoading,
            channel,
            isPending,
            metadata,
            onCopySecret: () => setSecretPreview(null),
            onDeploy: () => deployMutation.mutate(),
            onPause: () => pauseMutation.mutate(),
            onRefresh: refreshAll,
            onRotateSecret: () => rotateMutation.mutate(),
            onSave: (payload) => saveMutation.mutate(payload),
            onTest: (prompt) => testMutation.mutate(prompt),
            secretPreview,
            tabs,
            t,
            agent,
          })}
        </ScrollArea>
      </Tabs>
    </aside>
  );
}

function renderContent({
  agent,
  agentsError,
  agentsLoading,
  channel,
  isPending,
  metadata,
  onCopySecret,
  onDeploy,
  onPause,
  onRefresh,
  onRotateSecret,
  onSave,
  onTest,
  secretPreview,
  tabs,
  t,
}: {
  agent?: Awaited<ReturnType<typeof listAiAgents>>['agents'][number];
  agentsError: Error | null;
  agentsLoading: boolean;
  channel?: Awaited<
    ReturnType<typeof listAiAgents>
  >['agents'][number]['channels'][number];
  isPending: boolean;
  metadata: ReturnType<typeof readAgentConversationMetadata>;
  onCopySecret: () => void;
  onDeploy: () => void;
  onPause: () => void;
  onRefresh: () => void;
  onRotateSecret: () => void;
  onSave: (payload: SaveAiAgentPayload) => void;
  onTest: (prompt?: string) => void;
  secretPreview: { label: string; value: string } | null;
  tabs: AgentTab[];
  t: ReturnType<typeof useTranslations>;
}) {
  if (!metadata) {
    return <SidebarNotice message={t('agent_metadata_missing')} />;
  }

  if (agentsLoading) {
    return (
      <div className="flex items-center justify-center p-6 text-muted-foreground text-sm">
        <LoaderCircle className="mr-2 size-4 animate-spin" />
        {t('loading_ai_settings')}
      </div>
    );
  }

  if (agentsError) {
    return (
      <SidebarNotice
        message={t('agent_admin_required')}
        secondary={agentsError.message}
      />
    );
  }

  if (!agent || !channel) {
    return <SidebarNotice message={t('agent_not_found')} />;
  }

  return (
    <>
      <TabsContent className="m-0 p-3" value={'setup' satisfies AgentTab}>
        <AgentSetupForm
          agent={agent}
          channel={channel}
          isPending={isPending}
          onSubmit={onSave}
        />
      </TabsContent>
      <TabsContent className="m-0 p-3" value={'operations' satisfies AgentTab}>
        <AgentOperationsPanel
          channel={channel}
          isPending={isPending}
          onCopySecret={onCopySecret}
          onDeploy={onDeploy}
          onPause={onPause}
          onRotateSecret={onRotateSecret}
          onTest={onTest}
          secretPreview={secretPreview}
        />
      </TabsContent>
      {tabs.includes('thread') ? (
        <TabsContent className="m-0 p-3" value={'thread' satisfies AgentTab}>
          <AgentExternalThreadPanel metadata={metadata} onRefresh={onRefresh} />
        </TabsContent>
      ) : null}
    </>
  );
}

function SidebarNotice({
  message,
  secondary,
}: {
  message: string;
  secondary?: string | null;
}) {
  return (
    <div className="space-y-2 p-4 text-sm">
      <p className="text-muted-foreground">{message}</p>
      {secondary ? (
        <p className="break-words rounded-md border bg-muted/20 p-2 text-muted-foreground text-xs">
          {secondary}
        </p>
      ) : null}
    </div>
  );
}
