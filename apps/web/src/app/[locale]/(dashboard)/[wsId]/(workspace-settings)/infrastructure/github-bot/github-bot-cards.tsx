'use client';

import {
  Bot,
  KeyRound,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from '@tuturuuu/icons';
import type {
  GitHubBotConfigurationStatus,
  GitHubBotState,
} from '@tuturuuu/internal-api/infrastructure';
import { Alert, AlertDescription, AlertTitle } from '@tuturuuu/ui/alert';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Switch } from '@tuturuuu/ui/switch';
import { Textarea } from '@tuturuuu/ui/textarea';
import type { useTranslations } from 'next-intl';
import type { Dispatch, SetStateAction } from 'react';
import {
  Field,
  GitHubBotClientsList,
  WatcherEnvSnippet,
} from './github-bot-sections';

export type ConfigurationForm = {
  appId: string;
  enabled: boolean;
  installationId: string;
  privateKey: string;
  repositoryName: string;
  repositoryOwner: string;
};

type GitHubBotSettingsTranslator = ReturnType<typeof useTranslations>;

export function GitHubBotConfigurationCard({
  configuration,
  form,
  onFormChange,
  onRefresh,
  onSave,
  onTest,
  savePending,
  t,
  testPending,
}: {
  configuration: GitHubBotConfigurationStatus | null;
  form: ConfigurationForm;
  onFormChange: Dispatch<SetStateAction<ConfigurationForm>>;
  onRefresh: () => void;
  onSave: () => void;
  onTest: () => void;
  savePending: boolean;
  t: GitHubBotSettingsTranslator;
  testPending: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Bot className="h-4 w-4" />
          {t('configurationTitle')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-3 rounded-md border p-3">
          <div>
            <Label htmlFor="github-bot-enabled">{t('enabled')}</Label>
            <div className="text-muted-foreground text-xs">
              {t('enabledHint')}
            </div>
          </div>
          <Switch
            checked={form.enabled}
            id="github-bot-enabled"
            onCheckedChange={(checked) =>
              onFormChange((current) => ({ ...current, enabled: checked }))
            }
          />
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <Field id="github-bot-app-id" label={t('appId')}>
            <Input
              id="github-bot-app-id"
              inputMode="numeric"
              onChange={(event) =>
                onFormChange((current) => ({
                  ...current,
                  appId: event.target.value,
                }))
              }
              value={form.appId}
            />
          </Field>
          <Field id="github-bot-installation-id" label={t('installationId')}>
            <Input
              id="github-bot-installation-id"
              inputMode="numeric"
              onChange={(event) =>
                onFormChange((current) => ({
                  ...current,
                  installationId: event.target.value,
                }))
              }
              value={form.installationId}
            />
          </Field>
          <Field id="github-bot-owner" label={t('repositoryOwner')}>
            <Input
              id="github-bot-owner"
              onChange={(event) =>
                onFormChange((current) => ({
                  ...current,
                  repositoryOwner: event.target.value,
                }))
              }
              value={form.repositoryOwner}
            />
          </Field>
          <Field id="github-bot-repo" label={t('repositoryName')}>
            <Input
              id="github-bot-repo"
              onChange={(event) =>
                onFormChange((current) => ({
                  ...current,
                  repositoryName: event.target.value,
                }))
              }
              value={form.repositoryName}
            />
          </Field>
        </div>

        <Field id="github-bot-private-key" label={t('privateKey')}>
          <Textarea
            className="min-h-36 font-mono text-xs"
            id="github-bot-private-key"
            onChange={(event) =>
              onFormChange((current) => ({
                ...current,
                privateKey: event.target.value,
              }))
            }
            placeholder={
              configuration?.privateKeyConfigured
                ? t('privateKeyPlaceholderConfigured')
                : t('privateKeyPlaceholder')
            }
            value={form.privateKey}
          />
        </Field>

        {configuration && (
          <div className="grid gap-2 rounded-md border p-3 text-sm md:grid-cols-3">
            <div>
              <div className="text-muted-foreground text-xs">{t('appId')}</div>
              <div className="font-mono">{configuration.appId}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">
                {t('installationId')}
              </div>
              <div className="font-mono">{configuration.installationId}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">
                {t('privateKeyFingerprint')}
              </div>
              <div className="truncate font-mono">
                {configuration.privateKeyFingerprint.slice(0, 16)}
              </div>
            </div>
          </div>
        )}

        {configuration?.lastValidationError && (
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" />
            <AlertTitle>{t('validationFailed')}</AlertTitle>
            <AlertDescription>
              {configuration.lastValidationError}
            </AlertDescription>
          </Alert>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            disabled={
              savePending ||
              !form.appId ||
              !form.installationId ||
              !form.repositoryOwner ||
              !form.repositoryName
            }
            onClick={onSave}
          >
            <ShieldCheck className="mr-2 h-4 w-4" />
            {t('save')}
          </Button>
          <Button
            disabled={!configuration || testPending}
            onClick={onTest}
            variant="outline"
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            {t('test')}
          </Button>
          <Button onClick={onRefresh} variant="ghost">
            <RefreshCw className="mr-2 h-4 w-4" />
            {t('refresh')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function GitHubBotClientsCard({
  autoPickupPending,
  clientName,
  clients,
  configuration,
  envSnippet,
  issuePending,
  onAutoPickup,
  onClientNameChange,
  onIssue,
  onRevoke,
  revokePending,
  t,
}: {
  autoPickupPending: boolean;
  clientName: string;
  clients: GitHubBotState['clients'];
  configuration: GitHubBotConfigurationStatus | null;
  envSnippet: string | null;
  issuePending: boolean;
  onAutoPickup: () => void;
  onClientNameChange: Dispatch<SetStateAction<string>>;
  onIssue: () => void;
  onRevoke: (clientId: string) => void;
  revokePending: boolean;
  t: GitHubBotSettingsTranslator;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="h-4 w-4" />
          {t('clientsTitle')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Alert>
          <ShieldCheck className="h-4 w-4" />
          <AlertTitle>{t('autoPickupTitle')}</AlertTitle>
          <AlertDescription>{t('autoPickupDescription')}</AlertDescription>
        </Alert>

        <Button
          disabled={
            !configuration?.enabled || autoPickupPending || issuePending
          }
          onClick={onAutoPickup}
        >
          <ShieldCheck className="mr-2 h-4 w-4" />
          {t('enableAutoPickup')}
        </Button>

        {envSnippet && (
          <Alert>
            <KeyRound className="h-4 w-4" />
            <AlertTitle>{t('clientIssued')}</AlertTitle>
            <AlertDescription>
              <WatcherEnvSnippet
                snippet={envSnippet}
                title={t('clientsTitle')}
              />
            </AlertDescription>
          </Alert>
        )}

        <div className="flex flex-col gap-2 md:flex-row md:items-end">
          <Field id="github-bot-client-name" label={t('clientName')}>
            <Input
              id="github-bot-client-name"
              onChange={(event) => onClientNameChange(event.target.value)}
              value={clientName}
            />
          </Field>
          <Button
            disabled={!configuration || !clientName.trim() || issuePending}
            onClick={onIssue}
          >
            <KeyRound className="mr-2 h-4 w-4" />
            {t('issueClient')}
          </Button>
        </div>

        <GitHubBotClientsList
          clients={clients}
          labels={{
            expiresAt: (value) => t('expiresAt', { value }),
            noClients: t('noClients'),
            revoke: t('revoke'),
            revoked: t('revoked'),
          }}
          onRevoke={onRevoke}
          revokePending={revokePending}
        />
      </CardContent>
    </Card>
  );
}
