'use client';

import { GitBranch } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { format } from 'date-fns';
import { enUS, vi } from 'date-fns/locale';
import { useLocale, useTranslations } from 'next-intl';
import { isHttpsUrl } from './link-groups';
import type { TaskExternalRef } from './types';
import { useTaskExternalRef } from './use-task-links';

interface ExternalSourceBadgeProps {
  wsId: string;
  taskId?: string;
}

/** "GitHub #1234" with the original author and date, for imported tasks. */
export function ExternalSourceBadge({
  wsId,
  taskId,
}: ExternalSourceBadgeProps) {
  const { data: ref } = useTaskExternalRef(wsId, taskId);
  if (!ref) return null;
  return <ExternalSourceBadgeView externalRef={ref} />;
}

export function ExternalSourceBadgeView({
  externalRef,
}: {
  externalRef: TaskExternalRef;
}) {
  const t = useTranslations('task-collaboration');
  const locale = useLocale() === 'vi' ? vi : enUS;
  const label = externalRef.external_number
    ? `${t('github')} #${externalRef.external_number}`
    : t('github');
  const created = externalRef.external_created_at
    ? new Date(externalRef.external_created_at)
    : null;
  const hasCreated = created && !Number.isNaN(created.getTime());

  const badge = (
    <Badge className="gap-1 font-medium text-xs" variant="secondary">
      <GitBranch aria-hidden className="h-3 w-3" />
      {label}
    </Badge>
  );

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground text-xs">
      {isHttpsUrl(externalRef.external_url) ? (
        <a
          href={externalRef.external_url}
          rel="noopener noreferrer"
          target="_blank"
          title={externalRef.external_repo ?? undefined}
        >
          {badge}
        </a>
      ) : (
        badge
      )}
      {externalRef.external_author && (
        <span>{t('opened_by', { author: externalRef.external_author })}</span>
      )}
      {hasCreated && (
        <time dateTime={externalRef.external_created_at ?? undefined}>
          {format(created, 'PP', { locale })}
        </time>
      )}
    </div>
  );
}
