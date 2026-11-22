import { Badge } from '@tuturuuu/ui/badge';
import type { MobileIssueAlert } from '../fleet/contract';
import { formatTime, useI18n } from '../i18n';

export function MobileIssueRow({ alert }: { alert: MobileIssueAlert }) {
  const { locale, t } = useI18n();
  const platform = alert.platform === 'ios' ? 'iOS' : 'Android';
  return (
    <li className="space-y-1 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-medium text-sm">
          {t(`inbox.mobileIssues.${alert.kind}`)}
        </p>
        {alert.priority === 'decision' && (
          <Badge variant="destructive">{t('inbox.mobileIssues.urgent')}</Badge>
        )}
      </div>
      {alert.kind !== 'test' && (
        <p className="text-muted-foreground text-xs">
          {t('inbox.mobileIssues.detail', {
            platform,
            build: alert.build,
            count: alert.count,
          })}
          {' · '}
          {formatTime(locale, alert.startedAt)}
        </p>
      )}
      <p className="break-all font-mono text-muted-foreground text-xs">
        {alert.issueId}
      </p>
    </li>
  );
}
