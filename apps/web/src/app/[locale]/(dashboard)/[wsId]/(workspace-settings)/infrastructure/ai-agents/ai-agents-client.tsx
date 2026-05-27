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
} from '@tuturuuu/internal-api/infrastructure';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { AgentForm } from './agent-form';
import { AgentOperations } from './agent-operations';
import {
  type AiAgentsData,
  type OneTimeSecret,
  QUERY_KEY,
} from './ai-agents-utils';
import { IdentityLinks } from './identity-links';
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

      <div className="space-y-3">
        <h2 className="font-semibold text-lg">{t('new_agent.title')}</h2>
        <AgentForm
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

      <div className="space-y-4">
        <h2 className="font-semibold text-lg">{t('registered.title')}</h2>
        {data.agents.length === 0 ? (
          <div className="rounded-lg border border-border border-dashed p-8 text-center text-muted-foreground">
            {t('registered.empty')}
          </div>
        ) : (
          data.agents.map((agent) => (
            <div className="space-y-4" key={agent.id}>
              <AgentForm
                agent={agent}
                isPending={isPending}
                onSubmit={(payload) => saveMutation.mutate(payload)}
              />
              <AgentOperations
                agent={agent}
                isPending={isPending}
                onDeploy={(agentId, channelId) =>
                  deployMutation.mutate({ agentId, channelId })
                }
                onPause={(agentId, channelId) =>
                  pauseMutation.mutate({ agentId, channelId })
                }
                onRotateZalo={(agentId, channelId) =>
                  rotateMutation.mutate({ agentId, channelId })
                }
                onTest={(agentId, channelId) =>
                  testMutation.mutate({ agentId, channelId })
                }
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
