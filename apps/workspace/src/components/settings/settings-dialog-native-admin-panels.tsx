'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, KeyRound, Settings } from '@tuturuuu/icons';
import {
  getPeriodicReportSchedules,
  getWorkspaceMemberSettings,
  listEnhancedWorkspaceMembers,
  listWorkspaceApiKeys,
  listWorkspaceApiKeyUsageLogs,
  listWorkspaceSecrets,
} from '@tuturuuu/internal-api';
import { listWorkspaceRoles } from '@tuturuuu/internal-api/settings';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { SettingItemTab } from '@tuturuuu/ui/custom/settings-item-tab';
import {
  SettingsSection,
  SettingsSectionBlock,
} from '@tuturuuu/ui/custom/settings-section';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tuturuuu/ui/table';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import SecretForm from '../../app/[locale]/(dashboard)/[wsId]/(workspace-settings)/secrets/form';
import { PeriodicReportDeliveryReadiness } from '../../app/[locale]/(dashboard)/[wsId]/(workspace-settings)/secrets/periodic-report-delivery-readiness';
import {
  NativeApiPreviewPanel,
  NativeMetricGrid,
  NativePanelError,
  NativePanelFrame,
  NativePanelLoading,
  NativeSimpleTable,
} from './settings-dialog-native-panel-utils';

const INFRASTRUCTURE_APP_URL =
  process.env.NEXT_PUBLIC_INFRA_APP_URL ??
  'https://infrastructure.tuturuuu.com';

interface NativeAdminPanelProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  wsId: string;
}

export const WORKSPACE_ADMIN_NATIVE_TABS = new Set([
  'api_keys',
  'inquiries',
  'integrations',
  'secrets',
  'usage',
]);

export function WorkspaceAdminNativeSettingsPanels({
  activeTab,
  wsId,
}: NativeAdminPanelProps) {
  if (!WORKSPACE_ADMIN_NATIVE_TABS.has(activeTab)) return null;

  return (
    <NativePanelFrame activeTab={activeTab}>
      {activeTab === 'api_keys' && <ApiKeysNativePanel wsId={wsId} />}
      {activeTab === 'secrets' && <SecretsNativePanel wsId={wsId} />}
      {activeTab === 'usage' && <UsageNativePanel wsId={wsId} />}
      {activeTab === 'integrations' && <IntegrationsNativePanel />}
      {activeTab === 'inquiries' && <InquiriesNativePanel />}
    </NativePanelFrame>
  );
}

function ApiKeysNativePanel({ wsId }: { wsId: string }) {
  const t = useTranslations();
  const [selectedKeyId, setSelectedKeyId] = useState<string | null>(null);
  const apiKeysQuery = useQuery({
    queryFn: () => listWorkspaceApiKeys({ pageSize: 25, workspaceId: wsId }),
    queryKey: ['native-settings', 'api-keys', wsId],
  });

  if (apiKeysQuery.isPending) return <NativePanelLoading />;
  if (apiKeysQuery.isError) {
    return <NativePanelError onRetry={() => apiKeysQuery.refetch()} />;
  }

  return (
    <div className="space-y-8">
      <SettingsSection>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {['name', 'key_prefix', 'last_used_at', 'expires_at', ''].map(
                (column) => (
                  <TableHead className="md:px-5" key={column}>
                    {column}
                  </TableHead>
                )
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {apiKeysQuery.data.data.map((key) => (
              <TableRow className="hover:bg-transparent" key={key.id}>
                <TableCell className="px-4 py-2.5 md:px-5">
                  {key.name}
                </TableCell>
                <TableCell className="px-4 py-2.5 font-mono md:px-5">
                  {key.key_prefix}
                </TableCell>
                <TableCell className="px-4 py-2.5 md:px-5">
                  {key.last_used_at ?? '-'}
                </TableCell>
                <TableCell className="px-4 py-2.5 md:px-5">
                  {key.expires_at ?? '-'}
                </TableCell>
                <TableCell className="px-4 py-2.5 text-right md:px-5">
                  <Button
                    onClick={() => setSelectedKeyId(key.id)}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    {t('common.details')}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </SettingsSection>
      {selectedKeyId && (
        <ApiKeyUsageLogsNativePanel keyId={selectedKeyId} wsId={wsId} />
      )}
    </div>
  );
}

function ApiKeyUsageLogsNativePanel({
  keyId,
  wsId,
}: {
  keyId: string;
  wsId: string;
}) {
  const logsQuery = useQuery({
    queryFn: () =>
      listWorkspaceApiKeyUsageLogs({ keyId, pageSize: 10, workspaceId: wsId }),
    queryKey: ['native-settings', 'api-key-usage', wsId, keyId],
  });

  if (logsQuery.isPending) return <NativePanelLoading />;
  if (logsQuery.isError) {
    return <NativePanelError onRetry={() => logsQuery.refetch()} />;
  }

  return (
    <NativeSimpleTable
      columns={['created_at', 'method', 'endpoint', 'status_code']}
      rows={logsQuery.data.data as unknown as Record<string, unknown>[]}
    />
  );
}

function SecretsNativePanel({ wsId }: { wsId: string }) {
  const queryClient = useQueryClient();
  const secretsQuery = useQuery({
    queryFn: () => listWorkspaceSecrets(wsId),
    queryKey: ['native-settings', 'secrets', wsId],
  });
  const reportReadinessQuery = useQuery({
    queryFn: () => getPeriodicReportSchedules(wsId),
    queryKey: ['native-settings', 'report-delivery-readiness', wsId],
  });

  const secretNames =
    secretsQuery.data
      ?.map((secret) => String(secret.name ?? ''))
      .filter(Boolean) ?? [];

  return (
    <div className="space-y-8">
      {reportReadinessQuery.data && (
        <PeriodicReportDeliveryReadiness
          existingSecrets={secretNames}
          globalGateEnabled={
            reportReadinessQuery.data.emailDelivery.globalGateEnabled
          }
          periodicGateEnabled={
            reportReadinessQuery.data.emailDelivery.periodicGateEnabled
          }
          senderConfigured={
            reportReadinessQuery.data.emailDelivery.senderConfigured
          }
          wsId={wsId}
        />
      )}
      <SettingsSection>
        <SettingsSectionBlock>
          <SecretForm
            existingSecrets={secretNames}
            onFinish={() =>
              queryClient.invalidateQueries({
                queryKey: ['native-settings', 'secrets', wsId],
              })
            }
            submitClassName="ml-auto flex w-fit"
            wsId={wsId}
          />
        </SettingsSectionBlock>
      </SettingsSection>
      {secretsQuery.isPending ? (
        <NativePanelLoading />
      ) : secretsQuery.isError ? (
        <NativePanelError onRetry={() => secretsQuery.refetch()} />
      ) : (
        <NativeSimpleTable
          columns={['name', 'created_at', 'updated_at']}
          rows={secretsQuery.data as unknown as Record<string, unknown>[]}
        />
      )}
    </div>
  );
}

function UsageNativePanel({ wsId }: { wsId: string }) {
  const usageQuery = useQuery({
    queryFn: async () => {
      const [members, roles, apiKeys, secrets, memberSettings] =
        await Promise.all([
          listEnhancedWorkspaceMembers(wsId, 'all'),
          listWorkspaceRoles(wsId, { pageSize: '1' }),
          listWorkspaceApiKeys({ pageSize: 1, workspaceId: wsId }),
          listWorkspaceSecrets(wsId),
          getWorkspaceMemberSettings(wsId),
        ]);

      return {
        apiKeys: apiKeys.count,
        invitesDisabled: memberSettings.disableInvite,
        members: members.length,
        roles: roles.count,
        secrets: secrets.length,
      };
    },
    queryKey: ['native-settings', 'usage', wsId],
  });

  if (usageQuery.isPending) return <NativePanelLoading />;
  if (usageQuery.isError) {
    return <NativePanelError onRetry={() => usageQuery.refetch()} />;
  }

  return (
    <NativeMetricGrid
      items={[
        { label: 'Members', value: usageQuery.data.members },
        { label: 'Roles', value: usageQuery.data.roles },
        { label: 'API keys', value: usageQuery.data.apiKeys },
        { label: 'Secrets', value: usageQuery.data.secrets },
        {
          label: 'Invites disabled',
          value: usageQuery.data.invitesDisabled ? 'Yes' : 'No',
        },
      ]}
    />
  );
}

function IntegrationsNativePanel() {
  const integrations = [
    {
      description: 'Bot commands, link shortening, and server notifications.',
      name: 'Discord',
      status: 'available',
    },
    {
      description: 'Team communication and notification bridge.',
      name: 'Slack',
      status: 'planned',
    },
    {
      description: 'Repository automation and workflow updates.',
      name: 'GitHub',
      status: 'planned',
    },
  ];

  return (
    <SettingsSection>
      {integrations.map((integration) => (
        <SettingItemTab
          description={integration.description}
          icon={
            integration.name === 'Discord' ? (
              <Bot className="h-4 w-4" />
            ) : (
              <Settings className="h-4 w-4" />
            )
          }
          key={integration.name}
          title={integration.name}
        >
          <div className="flex items-center gap-3">
            <Badge variant="outline">{integration.status}</Badge>
            {integration.name === 'Discord' && (
              <Button asChild size="sm" variant="outline">
                <a href={`${INFRASTRUCTURE_APP_URL}/internal/ai-agents`}>
                  <KeyRound className="h-4 w-4" />
                  AI agents
                </a>
              </Button>
            )}
          </div>
        </SettingItemTab>
      ))}
    </SettingsSection>
  );
}

function InquiriesNativePanel() {
  return (
    <NativeApiPreviewPanel
      columns={['id', 'subject', 'type', 'product', 'created_at']}
      path="/api/v1/inquiries"
      queryKey={['native-settings', 'inquiries']}
    />
  );
}
