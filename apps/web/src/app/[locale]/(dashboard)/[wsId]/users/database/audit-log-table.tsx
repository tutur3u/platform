import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { getTranslations } from 'next-intl/server';
import {
  getAuditLogInsights,
  getAuditLogPage,
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
  status?: string;
  page?: number;
  pageSize?: number;
  canExport?: boolean;
}

export async function AuditLogTable({
  wsId,
  locale,
  period,
  month,
  year,
  status,
  page = 1,
  pageSize = 10,
  canExport = false,
}: Props) {
  const t = await getTranslations('audit-log-insights');
  const [pageData, insights] = await Promise.all([
    getAuditLogPage({
      wsId,
      period,
      month,
      year,
      status,
      page,
      pageSize,
    }),
    getAuditLogInsights({
      wsId,
      locale,
      period,
      month,
      year,
    }),
  ]);

  const resolvedPeriod = resolveAuditLogPeriod(period);
  const timeOptions = getRecentAuditLogTimeOptions(locale, resolvedPeriod);

  return (
    <div className="space-y-6">
      <AuditLogInsights
        wsId={wsId}
        locale={locale}
        selectedPeriod={insights.period}
        selectedValue={insights.timeValue}
        timeOptions={timeOptions}
        summary={insights.summary}
        chartStats={insights.chartStats}
        status={pageData.status}
        canExport={canExport}
      />

      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle>{t('table_title')}</CardTitle>
          <CardDescription>{t('table_description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <AuditLogDataTable
            data={pageData.data}
            count={pageData.count}
            page={pageData.page}
            pageSize={pageData.pageSize}
            status={pageData.status}
          />
        </CardContent>
      </Card>
    </div>
  );
}
