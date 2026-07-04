'use client';

import {
  KeyRound,
  RefreshCw,
  Rocket,
  RotateCcw,
  Upload,
} from '@tuturuuu/icons';
import type {
  MobileDeploymentFileKind,
  MobileDeploymentState,
} from '@tuturuuu/internal-api/infrastructure/mobile';
import { Alert, AlertDescription, AlertTitle } from '@tuturuuu/ui/alert';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { MOBILE_DEPLOYMENT_FILE_KINDS } from './mobile-deployment-config';
import { MobileDeploymentFieldHelp } from './mobile-deployment-field-help';
import {
  ResourceBadge,
  ResourceMetadata,
  VersionSummary,
} from './mobile-deployment-resource-status';

export function MobileDeploymentOverviewPanel({
  activeVersion,
  activateDisabled,
  draftVersion,
  isFetching,
  onActivate,
  onRollback,
  onVerify,
  rollbackDisabled,
}: {
  activeVersion: MobileDeploymentState['activeVersion'];
  activateDisabled: boolean;
  draftVersion: MobileDeploymentState['draftVersion'];
  isFetching: boolean;
  onActivate: () => void;
  onRollback: () => void;
  onVerify: () => void;
  rollbackDisabled: boolean;
}) {
  const t = useTranslations('mobile-deployment-settings');
  const readinessIssues = useMemo(
    () =>
      [
        ...(draftVersion?.readinessErrors ?? []).map(
          (error) => `${t('draftVersion')}: ${error}`
        ),
        ...(activeVersion?.readinessErrors ?? []).map(
          (error) => `${t('activeVersion')}: ${error}`
        ),
      ].slice(0, 12),
    [activeVersion, draftVersion, t]
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <VersionSummary
          label={t('activeVersion')}
          missingLabel={t('missing')}
          noneLabel={t('none')}
          readyLabel={t('ready')}
          version={activeVersion}
        />
        <VersionSummary
          label={t('draftVersion')}
          missingLabel={t('missing')}
          noneLabel={t('none')}
          readyLabel={t('ready')}
          version={draftVersion}
        />
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        <Button disabled={isFetching} onClick={onVerify} variant="outline">
          <RefreshCw className="mr-2 h-4 w-4" />
          {t('verify')}
        </Button>
        <Button disabled={activateDisabled} onClick={onActivate}>
          <Rocket className="mr-2 h-4 w-4" />
          {t('activate')}
        </Button>
        <Button
          disabled={rollbackDisabled}
          onClick={onRollback}
          variant="outline"
        >
          <RotateCcw className="mr-2 h-4 w-4" />
          {t('rollback')}
        </Button>
      </div>

      {readinessIssues.length > 0 && (
        <Alert>
          <AlertTitle>{t('readinessIssues')}</AlertTitle>
          <AlertDescription>
            <div className="mb-2">{t('readinessIssuesDescription')}</div>
            <ul className="list-disc space-y-1 pl-5">
              {readinessIssues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

export function MobileDeploymentFilesPanel({
  fileArtifacts,
  onUpload,
  uploadPending,
}: {
  fileArtifacts: MobileDeploymentState['fileArtifacts'];
  onUpload: (kind: MobileDeploymentFileKind, file: File) => void;
  uploadPending: boolean;
}) {
  const t = useTranslations('mobile-deployment-settings');
  const fileStatusByName = useMemo(
    () => new Map(fileArtifacts.map((entry) => [entry.name, entry])),
    [fileArtifacts]
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('filesTitle')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {MOBILE_DEPLOYMENT_FILE_KINDS.map((kind) => {
          const status = fileStatusByName.get(kind);
          const configured = Boolean(status?.configured);

          return (
            <div
              className="grid gap-3 rounded-md border p-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
              key={kind}
            >
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 truncate font-mono text-sm">
                    {kind}
                  </span>
                  <MobileDeploymentFieldHelp field={kind} />
                  <ResourceBadge
                    missingLabel={t('missing')}
                    ok={configured}
                    readyLabel={t('ready')}
                  />
                </div>
                <ResourceMetadata status={status} />
              </div>
              <Label className="inline-flex cursor-pointer items-center justify-center rounded-md border px-3 py-2 text-sm">
                <Upload className="mr-2 h-4 w-4" />
                {t('upload')}
                <input
                  className="sr-only"
                  disabled={uploadPending}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      onUpload(kind, file);
                    }
                    event.currentTarget.value = '';
                  }}
                  type="file"
                />
              </Label>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

export function MobileDeploymentTokensPanel({
  issuedToken,
  issuePending,
  onIssueToken,
  onRevokeToken,
  onTokenNameChange,
  revokePending,
  tokenName,
  tokens,
}: {
  issuedToken: string | null;
  issuePending: boolean;
  onIssueToken: () => void;
  onRevokeToken: (tokenId: string) => void;
  onTokenNameChange: (value: string) => void;
  revokePending: boolean;
  tokenName: string;
  tokens: MobileDeploymentState['tokens'];
}) {
  const t = useTranslations('mobile-deployment-settings');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('tokensTitle')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {issuedToken && (
          <Alert>
            <KeyRound className="h-4 w-4" />
            <AlertTitle>{t('tokenIssued')}</AlertTitle>
            <AlertDescription className="break-all font-mono text-xs">
              {issuedToken}
            </AlertDescription>
          </Alert>
        )}
        <div className="flex flex-col gap-2 md:flex-row md:items-end">
          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="mobile-deployment-token-name">{t('name')}</Label>
              <MobileDeploymentFieldHelp field="CI_TOKEN_NAME" />
            </div>
            <Input
              id="mobile-deployment-token-name"
              onChange={(event) => onTokenNameChange(event.target.value)}
              value={tokenName}
            />
          </div>
          <Button
            disabled={!tokenName.trim() || issuePending}
            onClick={onIssueToken}
          >
            <KeyRound className="mr-2 h-4 w-4" />
            {t('issueToken')}
          </Button>
        </div>

        <div className="grid gap-2">
          {tokens.map((token) => (
            <div
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-sm"
              key={token.id}
            >
              <div>
                <div className="font-medium">{token.name}</div>
                <div className="text-muted-foreground text-xs">
                  {token.prefix}...{token.lastFour}
                </div>
              </div>
              <Button
                disabled={Boolean(token.revokedAt) || revokePending}
                onClick={() => onRevokeToken(token.id)}
                size="sm"
                variant="outline"
              >
                {t('revoke')}
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function MobileDeploymentAuditPanel({
  auditEvents,
}: {
  auditEvents: MobileDeploymentState['auditEvents'];
}) {
  const t = useTranslations('mobile-deployment-settings');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('auditTitle')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-2">
          {auditEvents.slice(0, 12).map((event) => (
            <div
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-sm"
              key={event.id}
            >
              <span>{event.eventType}</span>
              <span className="text-muted-foreground text-xs">
                {new Date(event.createdAt).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
