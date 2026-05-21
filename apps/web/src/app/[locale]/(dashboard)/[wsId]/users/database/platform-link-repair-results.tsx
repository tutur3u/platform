'use client';

import type {
  WorkspaceUserPlatformLinkRepairResponse,
  WorkspaceUserPlatformLinkRepairSkipReason,
} from '@tuturuuu/internal-api/users';
import { Badge } from '@tuturuuu/ui/badge';
import { useTranslations } from 'next-intl';

function getReasonKey(reason: WorkspaceUserPlatformLinkRepairSkipReason) {
  return `platform_link_repair_reason_${reason}` as const;
}

export function PlatformLinkRepairResults({
  result,
}: {
  result: WorkspaceUserPlatformLinkRepairResponse;
}) {
  const t = useTranslations('ws-users');
  const visibleSkipped = result.skipped.slice(0, 6);
  const hiddenSkippedCount = Math.max(result.skipped.length - 6, 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Badge variant="secondary">
          {t('platform_link_repair_linked_count', {
            count: result.summary.linked,
          })}
        </Badge>
        <Badge variant="outline">
          {t('platform_link_repair_skipped_count', {
            count: result.summary.skipped,
          })}
        </Badge>
      </div>

      {result.linked.length > 0 ? (
        <div className="space-y-1">
          <p className="font-medium text-sm">
            {t('platform_link_repair_linked_title')}
          </p>
          <div className="max-h-32 space-y-1 overflow-y-auto text-muted-foreground text-sm">
            {result.linked.map((item) => (
              <div key={`${item.platformUserId}-${item.workspaceUserId}`}>
                {item.workspaceUserName || item.workspaceUserId} · {item.email}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {visibleSkipped.length > 0 ? (
        <div className="space-y-1">
          <p className="font-medium text-sm">
            {t('platform_link_repair_skipped_title')}
          </p>
          <div className="max-h-40 space-y-2 overflow-y-auto text-sm">
            {visibleSkipped.map((item) => (
              <div
                className="rounded-md border border-border p-2"
                key={`${item.workspaceUserId}-${item.reason}`}
              >
                <div className="font-medium">
                  {item.workspaceUserName || item.workspaceUserId}
                </div>
                <div className="text-muted-foreground">
                  {item.email || t('platform_link_repair_no_email')} ·{' '}
                  {t(getReasonKey(item.reason))}
                </div>
              </div>
            ))}
            {hiddenSkippedCount > 0 ? (
              <div className="text-muted-foreground">
                {t('platform_link_repair_more_skipped', {
                  count: hiddenSkippedCount,
                })}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
