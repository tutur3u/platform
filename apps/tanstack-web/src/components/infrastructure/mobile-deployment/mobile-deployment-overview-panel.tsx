'use client';

import { RefreshCw, Rocket, RotateCcw } from '@tuturuuu/icons';
import type { MobileDeploymentState } from '@tuturuuu/internal-api/infrastructure/mobile';
import { Alert, AlertDescription, AlertTitle } from '@tuturuuu/ui/alert';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { VersionSummary } from './mobile-deployment-resource-status';

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
