'use client';

import {
  Copy,
  KeyRound,
  MonitorSmartphone,
  Settings2,
  Webhook,
} from '@tuturuuu/icons';
import type {
  InventorySquareAppCredential,
  InventorySquareEnvironment,
} from '@tuturuuu/internal-api/inventory';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { useTranslations } from 'next-intl';
import { SelectValueField } from './operator-form-fields';

export type SquareSelectOption = { label: string; value: string };

export function SquareAppCredentialsCard({
  appCredential,
  applicationId,
  applicationSecret,
  environment,
  environmentOptions,
  oauthPending,
  oauthReady,
  oauthRedirectUrl,
  onOAuth,
  onSaveAppCredentials,
  saveAppCredentialsPending,
  setApplicationId,
  setApplicationSecret,
  setEnvironment,
  setOauthRedirectUrl,
  setWebhookNotificationUrl,
  webhookNotificationUrl,
}: {
  appCredential?: InventorySquareAppCredential;
  applicationId: string;
  applicationSecret: string;
  environment: InventorySquareEnvironment;
  environmentOptions: SquareSelectOption[];
  oauthPending: boolean;
  oauthReady: boolean;
  oauthRedirectUrl: string;
  onOAuth: () => void;
  onSaveAppCredentials: () => void;
  saveAppCredentialsPending: boolean;
  setApplicationId: (value: string) => void;
  setApplicationSecret: (value: string) => void;
  setEnvironment: (value: InventorySquareEnvironment) => void;
  setOauthRedirectUrl: (value: string) => void;
  setWebhookNotificationUrl: (value: string) => void;
  webhookNotificationUrl: string;
}) {
  const t = useTranslations('inventory.operator.square');

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-1 inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-primary/10 text-primary">
            <Settings2 className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="font-semibold">{t('appCredentialsTitle')}</p>
            <p className="mt-1 text-muted-foreground text-sm">
              {t('appCredentialsDescription')}
            </p>
          </div>
        </div>
        <Button
          disabled={oauthPending || !oauthReady}
          onClick={onOAuth}
          type="button"
          variant="outline"
        >
          <Settings2 className="h-4 w-4" />
          {t('connectOAuth')}
        </Button>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <SelectValueField
          allowEmpty={false}
          label={t('environmentLabel')}
          onChange={(value) =>
            setEnvironment(value as InventorySquareEnvironment)
          }
          options={environmentOptions}
          placeholder={t('environmentLabel')}
          value={environment}
        />
        <label className="grid gap-1 text-sm">
          <span className="font-medium">{t('applicationIdLabel')}</span>
          <Input
            onChange={(event) => setApplicationId(event.target.value)}
            placeholder={
              appCredential?.applicationId ?? t('applicationIdPlaceholder')
            }
            value={applicationId}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">{t('applicationSecretLabel')}</span>
          <Input
            onChange={(event) => setApplicationSecret(event.target.value)}
            placeholder={t('applicationSecretPlaceholder')}
            type="password"
            value={applicationSecret}
          />
        </label>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <label className="grid gap-1 text-sm">
          <span className="font-medium">{t('oauthRedirectLabel')}</span>
          <Input
            onChange={(event) => setOauthRedirectUrl(event.target.value)}
            placeholder={
              appCredential?.oauthRedirectUrl ?? t('oauthRedirectPlaceholder')
            }
            value={oauthRedirectUrl}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">{t('webhookNotificationLabel')}</span>
          <Input
            onChange={(event) => setWebhookNotificationUrl(event.target.value)}
            placeholder={
              appCredential?.webhookNotificationUrl ??
              t('webhookNotificationPlaceholder')
            }
            value={webhookNotificationUrl}
          />
        </label>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button
          disabled={saveAppCredentialsPending}
          onClick={onSaveAppCredentials}
          type="button"
        >
          {saveAppCredentialsPending ? t('saving') : t('saveAppCredentials')}
        </Button>
        <p className="text-muted-foreground text-xs">
          {appCredential?.applicationSecretLast4
            ? t('appSecretEnding', {
                last4: appCredential.applicationSecretLast4,
              })
            : t('oauthRequiresAppCredentials')}
        </p>
      </div>
    </div>
  );
}

export function SquareConnectionCard({
  accessToken,
  environmentLabel,
  onSaveToken,
  saveTokenPending,
  setAccessToken,
  setWebhookSignatureKey,
  webhookSignatureKey,
}: {
  accessToken: string;
  environmentLabel: string;
  onSaveToken: () => void;
  saveTokenPending: boolean;
  setAccessToken: (value: string) => void;
  setWebhookSignatureKey: (value: string) => void;
  webhookSignatureKey: string;
}) {
  const t = useTranslations('inventory.operator.square');

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-1 inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-primary/10 text-primary">
            <KeyRound className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="font-semibold">{t('title')}</p>
            <p className="mt-1 text-muted-foreground text-sm">
              {t('description')}
            </p>
          </div>
        </div>
        <p className="rounded-md border border-border bg-muted/30 px-2 py-1 text-muted-foreground text-xs">
          {environmentLabel}
        </p>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="grid gap-1 text-sm">
          <span className="font-medium">{t('tokenLabel')}</span>
          <Input
            onChange={(event) => setAccessToken(event.target.value)}
            placeholder={t('tokenPlaceholder')}
            type="password"
            value={accessToken}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">{t('webhookSignatureLabel')}</span>
          <Input
            onChange={(event) => setWebhookSignatureKey(event.target.value)}
            placeholder={t('webhookSignaturePlaceholder')}
            type="password"
            value={webhookSignatureKey}
          />
        </label>
      </div>
      <Button
        className="mt-3"
        disabled={saveTokenPending}
        onClick={onSaveToken}
        type="button"
      >
        {saveTokenPending ? t('saving') : t('saveManual')}
      </Button>
    </div>
  );
}

export function SquareTerminalCard({
  deviceCodeName,
  deviceCodePending,
  deviceId,
  deviceOptions,
  lastPairingCode,
  locationId,
  locationOptions,
  onCreateDeviceCode,
  onSaveDefaults,
  sandboxDeviceId,
  sandboxDevicePlaceholder,
  saveDefaultsPending,
  selectedDeviceId,
  selectedDevicePlaceholder,
  selectedLocationId,
  selectedLocationPlaceholder,
  setDeviceCodeName,
  setDeviceId,
  setLocationId,
  setSandboxDeviceId,
}: {
  deviceCodeName: string;
  deviceCodePending: boolean;
  deviceId: string;
  deviceOptions: SquareSelectOption[];
  lastPairingCode: string | null;
  locationId: string;
  locationOptions: SquareSelectOption[];
  onCreateDeviceCode: () => void;
  onSaveDefaults: () => void;
  sandboxDeviceId: string;
  sandboxDevicePlaceholder: string;
  saveDefaultsPending: boolean;
  selectedDeviceId: string;
  selectedDevicePlaceholder: string;
  selectedLocationId: string;
  selectedLocationPlaceholder: string;
  setDeviceCodeName: (value: string) => void;
  setDeviceId: (value: string) => void;
  setLocationId: (value: string) => void;
  setSandboxDeviceId: (value: string) => void;
}) {
  const t = useTranslations('inventory.operator.square');

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <MonitorSmartphone className="mt-1 h-5 w-5 text-muted-foreground" />
        <div>
          <p className="font-semibold">{t('terminalTitle')}</p>
          <p className="mt-1 text-muted-foreground text-sm">
            {t('terminalDescription')}
          </p>
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <SelectValueField
          label={t('locationLabel')}
          onChange={setLocationId}
          options={locationOptions}
          placeholder={selectedLocationPlaceholder}
          value={locationId || selectedLocationId}
        />
        <SelectValueField
          label={t('deviceLabel')}
          onChange={setDeviceId}
          options={deviceOptions}
          placeholder={selectedDevicePlaceholder}
          value={deviceId || selectedDeviceId}
        />
        <label className="grid gap-1 text-sm">
          <span className="font-medium">{t('sandboxDeviceLabel')}</span>
          <Input
            onChange={(event) => setSandboxDeviceId(event.target.value)}
            placeholder={sandboxDevicePlaceholder}
            value={sandboxDeviceId}
          />
        </label>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          disabled={saveDefaultsPending}
          onClick={onSaveDefaults}
          type="button"
        >
          {saveDefaultsPending ? t('saving') : t('saveDefaults')}
        </Button>
        <Input
          className="h-10 max-w-xs"
          onChange={(event) => setDeviceCodeName(event.target.value)}
          placeholder={t('deviceCodeNamePlaceholder')}
          value={deviceCodeName}
        />
        <Button
          disabled={deviceCodePending}
          onClick={onCreateDeviceCode}
          type="button"
          variant="outline"
        >
          {t('createDeviceCode')}
        </Button>
      </div>
      {lastPairingCode ? (
        <p className="mt-3 rounded-md border border-border bg-muted/30 px-3 py-2 font-mono text-sm">
          {lastPairingCode}
        </p>
      ) : null}
    </div>
  );
}

export function SquareWebhookCard({
  readinessIssues,
  tokenLast4,
  webhookUrl,
}: {
  readinessIssues: string[];
  tokenLast4: string | null;
  webhookUrl: string;
}) {
  const t = useTranslations('inventory.operator.square');

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <Webhook className="h-4 w-4 text-muted-foreground" />
        <p className="font-semibold">{t('webhookTitle')}</p>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-xs">
          {webhookUrl || t('webhookUrlPending')}
        </code>
        <Button
          disabled={!webhookUrl}
          onClick={() => navigator.clipboard.writeText(webhookUrl)}
          size="sm"
          type="button"
          variant="outline"
        >
          <Copy className="h-4 w-4" />
          {t('copyWebhook')}
        </Button>
      </div>
      <p className="mt-3 text-muted-foreground text-xs">
        {t('readiness', {
          issues: readinessIssues.join(', ') || t('ready'),
        })}
      </p>
      <p className="mt-2 text-muted-foreground text-xs">
        {tokenLast4
          ? t('tokenEnding', { last4: tokenLast4 })
          : t('notConfigured')}
      </p>
    </div>
  );
}
