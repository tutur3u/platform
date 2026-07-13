'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import { SquareProductionSetupGuide } from './square-production-setup-guide';
import {
  SquareAppCredentialsCard,
  SquareConnectionCard,
  SquareTerminalCard,
  SquareWebhookCard,
} from './square-settings-cards';

const environments: InventorySquareEnvironment[] = ['sandbox', 'production'];

export function SquareSettingsPanel({ wsId }: { wsId: string }) {
  const t = useTranslations('inventory.operator.square');
  const queryClient = useQueryClient();
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
  const locations = useQuery({
    enabled: hasReadyConnection,
    queryFn: () => listInventorySquareLocations(wsId),
    queryKey: ['inventory', wsId, 'square-locations'],
  });
  const devices = useQuery({
    enabled: hasReadyConnection,
    queryFn: () => listInventorySquareDevices(wsId),
    queryKey: ['inventory', wsId, 'square-devices'],
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
        deviceId: deviceId || settings.data?.deviceId || null,
        environment: selectedEnvironment,
        locationId: locationId || settings.data?.locationId || null,
        locationName:
          locations.data?.data.find((item) => item.id === locationId)?.name ??
          settings.data?.locationName ??
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
        locationId: locationId || settings.data?.locationId || undefined,
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

  return (
    <section className="grid gap-5">
      <SquareProductionSetupGuide
        environment={selectedEnvironment}
        onEnvironmentChange={setEnvironment}
        settings={settings.data}
        webhookUrl={webhookUrl}
      />
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
        selectedDeviceId={settings.data?.deviceId ?? ''}
        selectedDevicePlaceholder={
          settings.data?.deviceName ?? t('devicePlaceholder')
        }
        selectedLocationId={settings.data?.locationId ?? ''}
        selectedLocationPlaceholder={
          settings.data?.locationName ?? t('locationPlaceholder')
        }
        setDeviceCodeName={setDeviceCodeName}
        setDeviceId={setDeviceId}
        setLocationId={setLocationId}
        setSandboxDeviceId={setSandboxDeviceId}
      />
      <SquareWebhookCard
        readinessIssues={settings.data?.readiness.issues ?? []}
        tokenLast4={activeConnection?.accessTokenLast4 ?? null}
        webhookUrl={webhookUrl}
      />
    </section>
  );
}
