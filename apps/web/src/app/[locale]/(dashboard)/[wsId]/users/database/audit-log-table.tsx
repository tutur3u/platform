import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { getTranslations } from 'next-intl/server';
import {
  getAuditLogView,
  getRecentAuditLogTimeOptions,
} from './audit-log-data';
import { AuditLogDataTable } from './audit-log-data-table';
import { AuditLogInsights } from './audit-log-insights';
import { resolveAuditLogPeriod } from './audit-log-time';

interface Props {
  wsId: string;
  locale: string;
  period?: string;
  month?: string;
  year?: string;
  eventKind?: string;
  source?: string;
  affectedUserQuery?: string;
  actorQuery?: string;
  page?: number;
  pageSize?: number;
  canExport?: boolean;
  canRepairStatusHistory?: boolean;
}

export async function AuditLogTable({
  wsId,
  locale,
  period,
  month,
  year,
  eventKind,
  source,
  affectedUserQuery,
  actorQuery,
  page = 1,
  pageSize = 10,
  canExport = false,
  canRepairStatusHistory = false,
}: Props) {
  const t = await getTranslations('audit-log-insights');
  const view = await getAuditLogView({
    wsId,
    locale,
    period,
    month,
    year,
    eventKind,
    source,
    affectedUserQuery,
    actorQuery,
    page,
    pageSize,
  });

  const resolvedPeriod = resolveAuditLogPeriod(period);
  const timeOptions = getRecentAuditLogTimeOptions(locale, resolvedPeriod);

  return (
    <div className="space-y-6">
      <AuditLogInsights
        wsId={wsId}
        locale={locale}
        selectedPeriod={view.period}
        selectedValue={view.selectedValue}
        timeOptions={timeOptions}
        summary={view.summary}
        chartStats={view.chartStats}
        eventKind={view.eventKind}
        source={view.source}
        affectedUserQuery={view.affectedUserQuery}
        actorQuery={view.actorQuery}
        canExport={canExport}
        canRepairStatusHistory={canRepairStatusHistory}
      />

      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle>{t('table_title')}</CardTitle>
          <CardDescription>{t('table_description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <AuditLogDataTable
            data={view.data}
            count={view.count}
            page={view.page}
            pageSize={view.pageSize}
            eventKind={view.eventKind}
            source={view.source}
            affectedUserQuery={view.affectedUserQuery}
            actorQuery={view.actorQuery}
          />
        </CardContent>
      </Card>
    </div>
  );
}
