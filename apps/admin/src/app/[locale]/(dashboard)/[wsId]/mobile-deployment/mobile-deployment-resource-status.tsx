'use client';

import { CheckCircle2, XCircle } from '@tuturuuu/icons';
import type {
  MobileDeploymentResourceStatus,
  MobileDeploymentState,
} from '@tuturuuu/internal-api/infrastructure/mobile';
import { Badge } from '@tuturuuu/ui/badge';
import { useTranslations } from 'next-intl';

export function ResourceBadge({
  missingLabel,
  ok,
  readyLabel,
}: {
  missingLabel: string;
  ok: boolean;
  readyLabel: string;
}) {
  return ok ? (
    <Badge variant="default">
      <CheckCircle2 className="mr-1 h-3 w-3" />
      {readyLabel}
    </Badge>
  ) : (
    <Badge variant="secondary">
      <XCircle className="mr-1 h-3 w-3" />
      {missingLabel}
    </Badge>
  );
}

export function VersionSummary({
  label,
  missingLabel,
  noneLabel,
  readyLabel,
  version,
}: {
  label: string;
  missingLabel: string;
  noneLabel: string;
  readyLabel: string;
  version: MobileDeploymentState['activeVersion'];
}) {
  if (!version) {
    return (
      <div className="rounded-md border border-dashed p-3 text-muted-foreground text-sm">
        {label}: {noneLabel}
      </div>
    );
  }

  return (
    <div className="rounded-md border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-medium text-sm">
          {label}: v{version.version} ({version.status})
        </div>
        <ResourceBadge
          missingLabel={missingLabel}
          ok={version.ready}
          readyLabel={readyLabel}
        />
      </div>
      {version.readinessErrors.length > 0 && (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground text-xs">
          {version.readinessErrors.slice(0, 6).map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ResourceMetadata({
  status,
}: {
  status?: MobileDeploymentResourceStatus;
}) {
  const t = useTranslations('mobile-deployment-settings');

  if (!status?.configured) {
    return (
      <div className="text-muted-foreground text-xs">{t('notConfigured')}</div>
    );
  }

  const fingerprint = status.plaintextSha256?.slice(0, 12);
  const hasValue = status.value != null && status.value !== '';

  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground text-xs">
      {status.size != null && (
        <span>{t('sizeBytes', { count: status.size })}</span>
      )}
      {hasValue ? (
        <span className="break-all font-mono text-foreground/80">
          {t('storedValue', { value: status.value ?? '' })}
        </span>
      ) : (
        <>
          {status.lastFour && (
            <span>{t('lastFour', { value: status.lastFour })}</span>
          )}
          {fingerprint && (
            <span>{t('fingerprint', { value: fingerprint })}</span>
          )}
        </>
      )}
      {status.updatedAt && (
        <span>
          {t('updatedAt', {
            value: new Date(status.updatedAt).toLocaleString(),
          })}
        </span>
      )}
    </div>
  );
}
