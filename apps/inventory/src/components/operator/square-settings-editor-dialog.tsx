'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, MonitorSmartphone, Settings2 } from '@tuturuuu/icons';
import {
  createInventorySquareDeviceCode,
  type InventorySquareDeviceCode,
  type InventorySquareEnvironment,
  type InventorySquareSettings,
  listInventorySquareDevices,
  listInventorySquareLocations,
  startInventorySquareOAuth,
  updateInventorySquareSettings,
} from '@tuturuuu/internal-api/inventory';
import { Dialog } from '@tuturuuu/ui/dialog';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  OperatorDialogContent,
  OperatorDialogHeader,
  OperatorDialogTabs,
} from './operator-dialog-shell';
import {
  SquareAppCredentialsCard,
  SquareConnectionCard,
  SquareWebhookCard,
} from './square-settings-cards';
import { SquareTerminalSettingsCard } from './square-terminal-settings-card';

export type SquareSettingsEditorTab = 'application' | 'connection' | 'terminal';

const environments: InventorySquareEnvironment[] = ['sandbox', 'production'];

export function SquareSettingsEditorDialog({
  environment,
  onEnvironmentChange,
  onOpenChange,
  onTabChange,
  open,
  settings,
  tab,
  posCallbackUrl,
  webhookUrl,
  wsId,
}: {
  environment: InventorySquareEnvironment;
  onEnvironmentChange: (environment: InventorySquareEnvironment) => void;
  onOpenChange: (open: boolean) => void;
  onTabChange: (tab: SquareSettingsEditorTab) => void;
  open: boolean;
  settings?: InventorySquareSettings;
  tab: SquareSettingsEditorTab;
  posCallbackUrl: string;
  webhookUrl: string;
  wsId: string;
}) {
  const t = useTranslations('inventory.operator.square');
  const queryClient = useQueryClient();
  const [accessToken, setAccessToken] = useState('');
  const [applicationId, setApplicationId] = useState('');
  const [applicationSecret, setApplicationSecret] = useState('');
  const [oauthRedirectUrl, setOauthRedirectUrl] = useState('');
  const [webhookNotificationUrl, setWebhookNotificationUrl] = useState('');
  const [webhookSignatureKey, setWebhookSignatureKey] = useState('');
  const [locationId, setLocationId] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [sandboxDeviceId, setSandboxDeviceId] = useState('');
  const [deviceCodeName, setDeviceCodeName] = useState('');
  const [lastDeviceCode, setLastDeviceCode] =
    useState<InventorySquareDeviceCode | null>(null);

  const hasReadyConnection = (settings?.connections ?? []).some(
    (item) => item.environment === environment && item.status === 'ready'
  );
  const activeRoutingSettings =
    settings?.environment === environment ? settings : undefined;
  const locations = useQuery({
    enabled: open && hasReadyConnection && Boolean(activeRoutingSettings),
    queryFn: () => listInventorySquareLocations(wsId),
    queryKey: ['inventory', wsId, 'square-locations', environment],
  });
  const devices = useQuery({
    enabled: open && hasReadyConnection && Boolean(activeRoutingSettings),
    queryFn: () => listInventorySquareDevices(wsId),
    queryKey: ['inventory', wsId, 'square-devices', environment],
  });

  const environmentOptions = environments.map((value) => ({
    label: t(`environment.${value}`),
    value,
  }));
  const locationOptions = (locations.data?.data ?? []).map((location) => ({
    label: location.name,
    value: location.id,
  }));
  const deviceOptions = (devices.data?.data ?? []).map((device) => ({
    label: device.name,
    value: device.id,
  }));
  const activeAppCredential = (settings?.appCredentials ?? []).find(
    (item) => item.environment === environment
  );
  const activeConnection = (settings?.connections ?? []).find(
    (item) => item.environment === environment
  );
  const oauthReady = Boolean(
    activeAppCredential?.applicationId &&
      activeAppCredential.applicationSecretLast4
  );

  const invalidateSquare = () => {
    queryClient.invalidateQueries({
      queryKey: ['inventory', wsId, 'square-settings'],
    });
    queryClient.invalidateQueries({
      queryKey: ['inventory', wsId, 'square-locations'],
    });
    queryClient.invalidateQueries({
      queryKey: ['inventory', wsId, 'square-devices'],
    });
  };
  const appCredentialsMutation = useMutation({
    mutationFn: () =>
      updateInventorySquareSettings(wsId, {
        applicationId: applicationId || undefined,
        applicationSecret: applicationSecret || undefined,
        environment,
        oauthRedirectUrl: oauthRedirectUrl || undefined,
        webhookNotificationUrl: webhookNotificationUrl || undefined,
      }),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t('saveError')),
    onSuccess: () => {
      setApplicationId('');
      setApplicationSecret('');
      setOauthRedirectUrl('');
      setWebhookNotificationUrl('');
      toast.success(t('saveSuccess'));
      invalidateSquare();
    },
  });
  const tokenMutation = useMutation({
    mutationFn: () =>
      updateInventorySquareSettings(wsId, {
        accessToken: accessToken || undefined,
        environment,
        webhookSignatureKey: webhookSignatureKey || undefined,
      }),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t('saveError')),
    onSuccess: () => {
      setAccessToken('');
      setWebhookSignatureKey('');
      toast.success(t('saveSuccess'));
      invalidateSquare();
    },
  });
  const defaultsMutation = useMutation({
    mutationFn: () =>
      updateInventorySquareSettings(wsId, {
        deviceId: deviceId || activeRoutingSettings?.deviceId || null,
        environment,
        locationId: locationId || activeRoutingSettings?.locationId || null,
        locationName:
          locations.data?.data.find((item) => item.id === locationId)?.name ??
          activeRoutingSettings?.locationName ??
          null,
        sandboxDeviceId: sandboxDeviceId || settings?.sandboxDeviceId || null,
      }),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t('saveError')),
    onSuccess: () => {
      toast.success(t('saveSuccess'));
      invalidateSquare();
    },
  });
  const oauthMutation = useMutation({
    mutationFn: () => startInventorySquareOAuth(wsId, environment),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t('oauthError')),
    onSuccess: ({ authorizeUrl }) => window.location.assign(authorizeUrl),
  });
  const deviceCodeMutation = useMutation({
    mutationFn: () =>
      createInventorySquareDeviceCode(wsId, {
        locationId:
          locationId || activeRoutingSettings?.locationId || undefined,
        name: deviceCodeName || undefined,
      }),
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : t('deviceCodeError')
      ),
    onSuccess: ({ data }) => {
      setLastDeviceCode(data);
      toast.success(t('deviceCodeSuccess'));
      invalidateSquare();
    },
  });

  const closeDialog = (nextOpen: boolean) => {
    if (!nextOpen) {
      setAccessToken('');
      setApplicationId('');
      setApplicationSecret('');
      setOauthRedirectUrl('');
      setWebhookNotificationUrl('');
      setWebhookSignatureKey('');
      setLocationId('');
      setDeviceId('');
      setSandboxDeviceId('');
      setDeviceCodeName('');
      setLastDeviceCode(null);
    }
    onOpenChange(nextOpen);
  };

  return (
    <Dialog onOpenChange={closeDialog} open={open}>
      <OperatorDialogContent mobileFullscreen size="lg">
        <OperatorDialogHeader
          description={t('settingsDialogDescription', {
            environment: t(`environment.${environment}`),
          })}
          title={t('settingsDialogTitle')}
        />
        <OperatorDialogTabs
          onValueChange={(value) =>
            onTabChange(value as SquareSettingsEditorTab)
          }
          tabs={[
            {
              content: (
                <SquareAppCredentialsCard
                  appCredential={activeAppCredential}
                  applicationId={applicationId}
                  applicationSecret={applicationSecret}
                  environment={environment}
                  environmentOptions={environmentOptions}
                  oauthPending={oauthMutation.isPending}
                  oauthReady={oauthReady}
                  oauthRedirectUrl={oauthRedirectUrl}
                  onOAuth={() => oauthMutation.mutate()}
                  onSaveAppCredentials={() => appCredentialsMutation.mutate()}
                  saveAppCredentialsPending={appCredentialsMutation.isPending}
                  setApplicationId={setApplicationId}
                  setApplicationSecret={setApplicationSecret}
                  setEnvironment={onEnvironmentChange}
                  setOauthRedirectUrl={setOauthRedirectUrl}
                  setWebhookNotificationUrl={setWebhookNotificationUrl}
                  webhookNotificationUrl={webhookNotificationUrl}
                />
              ),
              icon: <Settings2 className="size-4" />,
              label: t('settingsTabs.application'),
              value: 'application',
            },
            {
              content: (
                <div className="grid gap-4">
                  <SquareConnectionCard
                    accessToken={accessToken}
                    environmentLabel={t('selectedEnvironment', {
                      environment: t(`environment.${environment}`),
                    })}
                    onSaveToken={() => tokenMutation.mutate()}
                    saveTokenPending={tokenMutation.isPending}
                    setAccessToken={setAccessToken}
                    setWebhookSignatureKey={setWebhookSignatureKey}
                    webhookSignatureKey={webhookSignatureKey}
                  />
                  <SquareWebhookCard
                    readinessIssues={settings?.readiness.issues ?? []}
                    tokenLast4={activeConnection?.accessTokenLast4 ?? null}
                    webhookUrl={webhookUrl}
                  />
                </div>
              ),
              icon: <KeyRound className="size-4" />,
              label: t('settingsTabs.connection'),
              value: 'connection',
            },
            {
              content: (
                <SquareTerminalSettingsCard
                  deviceCodeName={deviceCodeName}
                  deviceCodePending={deviceCodeMutation.isPending}
                  deviceId={deviceId}
                  deviceOptions={deviceOptions}
                  devicesPending={devices.isFetching}
                  environment={environment}
                  lastDeviceCode={lastDeviceCode}
                  locationId={locationId}
                  locationOptions={locationOptions}
                  onCreateDeviceCode={() => deviceCodeMutation.mutate()}
                  onRefreshDevices={() => devices.refetch()}
                  onSaveDefaults={() => defaultsMutation.mutate()}
                  posCallbackUrl={posCallbackUrl}
                  posReady={settings?.posReadiness.ready ?? false}
                  sandboxDeviceId={sandboxDeviceId}
                  sandboxDevicePlaceholder={
                    settings?.sandboxDeviceId ?? 'device:sandbox'
                  }
                  saveDefaultsPending={defaultsMutation.isPending}
                  selectedDeviceId={activeRoutingSettings?.deviceId ?? ''}
                  selectedDevicePlaceholder={
                    activeRoutingSettings?.deviceName ?? t('devicePlaceholder')
                  }
                  selectedLocationId={activeRoutingSettings?.locationId ?? ''}
                  selectedLocationPlaceholder={
                    activeRoutingSettings?.locationName ??
                    t('locationPlaceholder')
                  }
                  setDeviceCodeName={setDeviceCodeName}
                  setDeviceId={setDeviceId}
                  setLocationId={setLocationId}
                  setSandboxDeviceId={setSandboxDeviceId}
                />
              ),
              icon: <MonitorSmartphone className="size-4" />,
              label: t('settingsTabs.terminal'),
              value: 'terminal',
            },
          ]}
          value={tab}
        />
      </OperatorDialogContent>
    </Dialog>
  );
}
