'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type AiAgentIdentityLink,
  deployAiAgentChannel,
  listAiAgents,
  pauseAiAgentChannel,
  rotateAiAgentChannelSecret,
  type SaveAiAgentPayload,
  saveAiAgent,
  saveAiAgentIdentityLink,
  testAiAgentChannel,
} from '@tuturuuu/internal-api/infrastructure/ai';
import { toast } from '@tuturuuu/ui/sonner';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { AgentForm } from './agent-form';
import { AiAgentsSummary } from './ai-agents-summary';
import {
  type AiAgentsData,
  type OneTimeSecret,
  QUERY_KEY,
} from './ai-agents-utils';
import { ExternalChatsConsole } from './external-chats-console';
import { IdentityLinks } from './identity-links';
import { RegisteredAgents } from './registered-agents';
import { SecretPanel } from './secret-panel';

export function AiAgentsClient({ initialData }: { initialData: AiAgentsData }) {
  const t = useTranslations('ai-agents-settings');
  const queryClient = useQueryClient();
  const [secret, setSecret] = useState<OneTimeSecret>(null);
  const { data } = useQuery({
    initialData,
    queryFn: () => listAiAgents(),
    queryKey: QUERY_KEY,
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: QUERY_KEY });
  const saveMutation = useMutation({
    mutationFn: (payload: SaveAiAgentPayload) => saveAiAgent(payload),
    onError: (error) => toast.error(error.message || t('messages.save_error')),
    onSuccess: () => {
      toast.success(t('messages.save_success'));
      void refresh();
    },
  });
  const deployMutation = useMutation({
    mutationFn: ({
      agentId,
      channelId,
    }: {
      agentId: string;
      channelId: string;
    }) => deployAiAgentChannel(agentId, channelId),
    onError: (error) =>
      toast.error(error.message || t('messages.deploy_error')),
    onSuccess: (result) => {
      if (result.ok) {
        toast.success(t('messages.deploy_success'));
      } else {
        toast.error(result.missing.join(', '));
      }
      void refresh();
    },
  });
  const pauseMutation = useMutation({
    mutationFn: ({
      agentId,
      channelId,
    }: {
      agentId: string;
      channelId: string;
    }) => pauseAiAgentChannel(agentId, channelId),
    onError: (error) => toast.error(error.message || t('messages.pause_error')),
    onSuccess: () => {
      toast.success(t('messages.pause_success'));
      void refresh();
    },
  });
  const testMutation = useMutation({
    mutationFn: ({
      agentId,
      channelId,
    }: {
      agentId: string;
      channelId: string;
    }) => testAiAgentChannel(agentId, channelId),
    onError: (error) => toast.error(error.message || t('messages.test_error')),
    onSuccess: (result) => {
      if (result.ok) {
        toast.success(result.response);
      } else {
        toast.error(result.response);
      }
    },
  });
  const rotateMutation = useMutation({
    mutationFn: ({
      agentId,
      channelId,
    }: {
      agentId: string;
      channelId: string;
    }) => rotateAiAgentChannelSecret(agentId, channelId, 'webhookSecret'),
    onError: (error) =>
      toast.error(error.message || t('messages.rotate_error')),
    onSuccess: (result, variables) => {
      setSecret({
        channelId: variables.channelId,
        name: result.secret.name,
        value: result.secret.value,
      });
      toast.success(t('messages.rotate_success'));
      void refresh();
    },
  });
  const identityMutation = useMutation({
    mutationFn: (payload: AiAgentIdentityLink) =>
      saveAiAgentIdentityLink(payload),
    onError: (error) =>
      toast.error(error.message || t('messages.identity_error')),
    onSuccess: () => {
      toast.success(t('messages.identity_success'));
      void refresh();
    },
  });
  const isPending =
    saveMutation.isPending ||
    deployMutation.isPending ||
    pauseMutation.isPending ||
    testMutation.isPending ||
    rotateMutation.isPending ||
    identityMutation.isPending;

  return (
    <div className="space-y-6">
      <SecretPanel secret={secret} setSecret={setSecret} />

      <AiAgentsSummary data={data} />

      <ExternalChatsConsole agents={data.agents} />

      <div className="space-y-3">
        <h2 className="font-semibold text-lg">{t('new_agent.title')}</h2>
        <AgentForm
          includeInternalWorkspace
          isPending={isPending}
          onSubmit={(payload, reset) =>
            saveMutation.mutate(payload, {
              onSuccess: () => reset?.(),
            })
          }
        />
      </div>

      <IdentityLinks
        identities={data.identities}
        isPending={isPending}
        onSubmit={(payload, reset) =>
          identityMutation.mutate(payload, {
            onSuccess: reset,
          })
        }
      />

      <RegisteredAgents
        agents={data.agents}
        isPending={isPending}
        onDeploy={(agentId, channelId) =>
          deployMutation.mutate({ agentId, channelId })
        }
        onPause={(agentId, channelId) =>
          pauseMutation.mutate({ agentId, channelId })
        }
        onRefresh={refresh}
        onRotateZalo={(agentId, channelId) =>
          rotateMutation.mutate({ agentId, channelId })
        }
        onSave={(payload) => saveMutation.mutate(payload)}
        onTest={(agentId, channelId) =>
          testMutation.mutate({ agentId, channelId })
        }
      />
    </div>
  );
}
