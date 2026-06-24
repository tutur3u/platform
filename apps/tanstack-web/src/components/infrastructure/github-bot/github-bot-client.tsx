'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  enableGitHubBotWatcherAutoPickup,
  type GitHubBotConfigurationStatus,
  type GitHubBotState,
  getGitHubBotState,
  issueGitHubBotWatcherClient,
  revokeGitHubBotWatcherClient,
  saveGitHubBotConfiguration,
  testGitHubBotConfiguration,
} from '@tuturuuu/internal-api/infrastructure/github-bot';
import { useToast } from '@tuturuuu/ui/hooks/use-toast';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import {
  type ConfigurationForm,
  GitHubBotClientsCard,
  GitHubBotConfigurationCard,
} from './github-bot-cards';
import {
  GitHubBotAuditEvents,
  GitHubBotSummaryCards,
} from './github-bot-sections';

const QUERY_KEY = ['github-bot-state'];

function formFromConfiguration(
  configuration: GitHubBotConfigurationStatus | null
): ConfigurationForm {
  return {
    appId: configuration?.appId ?? '',
    enabled: configuration?.enabled ?? false,
    installationId: configuration?.installationId ?? '',
    privateKey: '',
    repositoryName: configuration?.repository.name ?? 'platform',
    repositoryOwner: configuration?.repository.owner ?? 'tutur3u',
  };
}

export function GitHubBotClient({
  initialData,
  tokenEndpointUrl,
}: {
  initialData: GitHubBotState;
  tokenEndpointUrl: string;
}) {
  const t = useTranslations('github-bot-settings');
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<ConfigurationForm>(
    formFromConfiguration(initialData.configuration)
  );
  const [clientName, setClientName] = useState('Blue/green watcher');
  const [issuedClientToken, setIssuedClientToken] = useState<string | null>(
    null
  );

  const { data } = useQuery({
    initialData,
    queryFn: () => getGitHubBotState(),
    queryKey: QUERY_KEY,
  });

  const refresh = (state?: GitHubBotState) => {
    if (state) {
      queryClient.setQueryData(QUERY_KEY, state);
      setForm(formFromConfiguration(state.configuration));
    }
    queryClient.invalidateQueries({ queryKey: QUERY_KEY });
  };

  const saveMutation = useMutation({
    mutationFn: () =>
      saveGitHubBotConfiguration({
        appId: form.appId,
        enabled: form.enabled,
        installationId: form.installationId,
        privateKey: form.privateKey || undefined,
        repositoryName: form.repositoryName,
        repositoryOwner: form.repositoryOwner,
      }),
    onError: (error) => toast({ title: error.message, variant: 'destructive' }),
    onSuccess: (state) => {
      refresh(state);
      toast({ title: t('saved') });
    },
  });

  const testMutation = useMutation({
    mutationFn: () => testGitHubBotConfiguration(),
    onError: (error) => toast({ title: error.message, variant: 'destructive' }),
    onSuccess: ({ state }) => {
      refresh(state);
      toast({ title: t('validated') });
    },
  });

  const autoPickupMutation = useMutation({
    mutationFn: () => enableGitHubBotWatcherAutoPickup(),
    onError: (error) => toast({ title: error.message, variant: 'destructive' }),
    onSuccess: ({ state }) => {
      refresh(state);
      toast({ title: t('autoPickupQueued') });
    },
  });

  const issueMutation = useMutation({
    mutationFn: () =>
      issueGitHubBotWatcherClient({
        expiresInDays: 90,
        name: clientName,
      }),
    onError: (error) => toast({ title: error.message, variant: 'destructive' }),
    onSuccess: ({ state, token }) => {
      setIssuedClientToken(token);
      refresh(state);
      toast({ title: t('clientIssued') });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (clientId: string) => revokeGitHubBotWatcherClient(clientId),
    onError: (error) => toast({ title: error.message, variant: 'destructive' }),
    onSuccess: (state) => {
      refresh(state);
      toast({ title: t('clientRevoked') });
    },
  });

  const configuration = data.configuration;
  const envSnippet = issuedClientToken
    ? [
        'TUTURUUU_CI_CHECKS_ENABLED=1',
        `TUTURUUU_CI_GITHUB_TOKEN_URL=${tokenEndpointUrl}`,
        `TUTURUUU_CI_GITHUB_TOKEN_CLIENT_TOKEN=${issuedClientToken}`,
      ].join('\n')
    : null;

  return (
    <div className="space-y-4">
      <GitHubBotSummaryCards
        configuration={configuration}
        labels={{
          disabled: t('disabled'),
          enabled: t('enabled'),
          lastValidation: t('lastValidation'),
          notConfigured: t('notConfigured'),
          notValidated: t('notValidated'),
          repository: t('repository'),
          status: t('status'),
        }}
      />

      <GitHubBotConfigurationCard
        configuration={configuration}
        form={form}
        onFormChange={setForm}
        onRefresh={() => refresh()}
        onSave={() => saveMutation.mutate()}
        onTest={() => testMutation.mutate()}
        savePending={saveMutation.isPending}
        t={t}
        testPending={testMutation.isPending}
      />

      <GitHubBotClientsCard
        autoPickupPending={autoPickupMutation.isPending}
        clientName={clientName}
        clients={data.clients}
        configuration={configuration}
        envSnippet={envSnippet}
        issuePending={issueMutation.isPending}
        onAutoPickup={() => autoPickupMutation.mutate()}
        onClientNameChange={setClientName}
        onIssue={() => issueMutation.mutate()}
        onRevoke={(clientId) => revokeMutation.mutate(clientId)}
        revokePending={revokeMutation.isPending}
        t={t}
      />

      <GitHubBotAuditEvents
        auditEvents={data.auditEvents}
        labels={{
          auditTitle: t('auditTitle'),
          noAuditEvents: t('noAuditEvents'),
        }}
      />
    </div>
  );
}
