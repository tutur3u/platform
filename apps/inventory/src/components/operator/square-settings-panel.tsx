'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Settings2 } from '@tuturuuu/icons';
import {
  createInventorySquareDeviceCode,
  getInventorySquareSettings,
  type InventorySquareEnvironment,
  listInventorySquareDevices,
  listInventorySquareLocations,
  startInventorySquareOAuth,
  updateInventorySquareSettings,
} from '@tuturuuu/internal-api/inventory';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { CompactEditButton } from './payment-read-only-fields';
import { SquareProductionSetupGuide } from './square-production-setup-guide';
import {
  SquareAppCredentialsCard,
  SquareConnectionCard,
  SquareTerminalCard,
  SquareWebhookCard,
} from './square-settings-cards';
import { SquareSettingsSummary } from './square-settings-summary';

const environments: InventorySquareEnvironment[] = ['sandbox', 'production'];

export function SquareSettingsPanel({ wsId }: { wsId: string }) {
  const t = useTranslations('inventory.operator.square');
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [environment, setEnvironment] =
    useState<InventorySquareEnvironment | null>(null);
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
  const [lastPairingCode, setLastPairingCode] = useState<string | null>(null);

  const settings = useQuery({
    queryFn: () => getInventorySquareSettings(wsId),
    queryKey: ['inventory', wsId, 'square-settings'],
  });
  const selectedEnvironment =
    environment ?? settings.data?.environment ?? 'sandbox';
  const hasReadyConnection = (settings.data?.connections ?? []).some(
    (item) =>
      item.environment === selectedEnvironment && item.status === 'ready'
  );
  const activeRoutingSettings =
    settings.data?.environment === selectedEnvironment
      ? settings.data
      : undefined;
  const locations = useQuery({
    enabled: hasReadyConnection && Boolean(activeRoutingSettings),
    queryFn: () => listInventorySquareLocations(wsId),
    queryKey: ['inventory', wsId, 'square-locations', selectedEnvironment],
  });
  const devices = useQuery({
    enabled: hasReadyConnection && Boolean(activeRoutingSettings),
    queryFn: () => listInventorySquareDevices(wsId),
    queryKey: ['inventory', wsId, 'square-devices', selectedEnvironment],
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
  const activeAppCredential = (settings.data?.appCredentials ?? []).find(
    (item) => item.environment === selectedEnvironment
  );
  const oauthReady = Boolean(
    activeAppCredential?.applicationId &&
      activeAppCredential.applicationSecretLast4
  );
  const webhookUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
    const resolvedWsId = settings.data?.wsId ?? wsId;
    return `${window.location.origin}/api/v1/inventory/square/webhook/${resolvedWsId}`;
  }, [settings.data?.wsId, wsId]);

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
        environment: selectedEnvironment,
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
        environment: selectedEnvironment,
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
        environment: selectedEnvironment,
        locationId: locationId || activeRoutingSettings?.locationId || null,
        locationName:
          locations.data?.data.find((item) => item.id === locationId)?.name ??
          activeRoutingSettings?.locationName ??
          null,
        sandboxDeviceId:
          sandboxDeviceId || settings.data?.sandboxDeviceId || null,
      }),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t('saveError')),
    onSuccess: () => {
      toast.success(t('saveSuccess'));
      invalidateSquare();
    },
  });
  const oauthMutation = useMutation({
    mutationFn: () => startInventorySquareOAuth(wsId, selectedEnvironment),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t('oauthError')),
    onSuccess: ({ authorizeUrl }) => {
      window.location.assign(authorizeUrl);
    },
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
      setLastPairingCode(data.code);
      toast.success(t('deviceCodeSuccess'));
      invalidateSquare();
    },
  });

  const activeConnection = (settings.data?.connections ?? []).find(
    (item) => item.environment === selectedEnvironment
  );

  const stopEditing = () => {
    setIsEditing(false);
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
  };

  return (
    <section className="grid gap-5">
      <div className="flex items-start justify-between gap-3 rounded-lg border border-border bg-card p-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-md border border-border bg-primary/10 text-primary">
            <Settings2 className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="font-semibold">{t('settingsTitle')}</p>
            <p className="mt-1 text-muted-foreground text-sm">
              {isEditing ? t('editingHint') : t('readOnlyHint')}
            </p>
          </div>
        </div>
        <CompactEditButton
          editing={isEditing}
          label={isEditing ? t('cancelEditing') : t('editSettings')}
          onClick={() => (isEditing ? stopEditing() : setIsEditing(true))}
        />
      </div>
      <SquareProductionSetupGuide
        environment={selectedEnvironment}
        onEnvironmentChange={setEnvironment}
        settings={settings.data}
        webhookUrl={webhookUrl}
      />
      <SquareSettingsSummary
        appCredential={activeAppCredential}
        connection={activeConnection}
        environment={selectedEnvironment}
        settings={settings.data}
      />
      {isEditing ? (
        <>
          <SquareAppCredentialsCard
            appCredential={activeAppCredential}
            applicationId={applicationId}
            applicationSecret={applicationSecret}
            environment={selectedEnvironment}
            environmentOptions={environmentOptions}
            oauthPending={oauthMutation.isPending}
            oauthReady={oauthReady}
            oauthRedirectUrl={oauthRedirectUrl}
            onOAuth={() => oauthMutation.mutate()}
            onSaveAppCredentials={() => appCredentialsMutation.mutate()}
            saveAppCredentialsPending={appCredentialsMutation.isPending}
            setApplicationId={setApplicationId}
            setApplicationSecret={setApplicationSecret}
            setEnvironment={setEnvironment}
            setOauthRedirectUrl={setOauthRedirectUrl}
            setWebhookNotificationUrl={setWebhookNotificationUrl}
            webhookNotificationUrl={webhookNotificationUrl}
          />
          <SquareConnectionCard
            accessToken={accessToken}
            environmentLabel={t('selectedEnvironment', {
              environment: t(`environment.${selectedEnvironment}`),
            })}
            onSaveToken={() => tokenMutation.mutate()}
            saveTokenPending={tokenMutation.isPending}
            setAccessToken={setAccessToken}
            setWebhookSignatureKey={setWebhookSignatureKey}
            webhookSignatureKey={webhookSignatureKey}
          />
          <SquareTerminalCard
            deviceCodeName={deviceCodeName}
            deviceCodePending={deviceCodeMutation.isPending}
            deviceId={deviceId}
            deviceOptions={deviceOptions}
            lastPairingCode={lastPairingCode}
            locationId={locationId}
            locationOptions={locationOptions}
            onCreateDeviceCode={() => deviceCodeMutation.mutate()}
            onSaveDefaults={() => defaultsMutation.mutate()}
            sandboxDeviceId={sandboxDeviceId}
            sandboxDevicePlaceholder={
              settings.data?.sandboxDeviceId ?? 'device:sandbox'
            }
            saveDefaultsPending={defaultsMutation.isPending}
            selectedDeviceId={activeRoutingSettings?.deviceId ?? ''}
            selectedDevicePlaceholder={
              activeRoutingSettings?.deviceName ?? t('devicePlaceholder')
            }
            selectedLocationId={activeRoutingSettings?.locationId ?? ''}
            selectedLocationPlaceholder={
              activeRoutingSettings?.locationName ?? t('locationPlaceholder')
            }
            setDeviceCodeName={setDeviceCodeName}
            setDeviceId={setDeviceId}
            setLocationId={setLocationId}
            setSandboxDeviceId={setSandboxDeviceId}
          />
        </>
      ) : null}
      <SquareWebhookCard
        readinessIssues={settings.data?.readiness.issues ?? []}
        tokenLast4={activeConnection?.accessTokenLast4 ?? null}
        webhookUrl={webhookUrl}
      />
    </section>
  );
}
