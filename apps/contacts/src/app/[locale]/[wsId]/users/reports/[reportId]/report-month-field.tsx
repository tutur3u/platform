'use client';

import { Save } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  defaultReportMonth,
  isReportSent,
  reportMonthLabel,
  resolveReportMonth,
} from '@tuturuuu/users-core/features/reports/report-month';
import { getBrowserTimezone } from '@tuturuuu/utils/timezone';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ReportMonthSelect } from '../../../reports/report-month-select';
import type { UserReport } from './hooks/use-report-mutations';
import { useSetReportMonth } from './hooks/use-set-report-month';

type TitleForm = {
  getValues: (name: 'title') => string;
  setValue: (
    name: 'title',
    value: string,
    options?: { shouldDirty?: boolean }
  ) => void;
};

/**
 * Report month for a new monthly report: defaults to the previous month during
 * the first 10 days, else the current month. The workspace default title
 * ("<title> MM/YYYY") follows the month until the teacher edits it.
 */
export function useNewReportMonth(isNew: boolean, title?: string | null) {
  const [month, setMonth] = useState(() =>
    defaultReportMonth(Date.now(), getBrowserTimezone())
  );
  const baseTitle = title?.trim();
  const titleFor = (value: string) =>
    baseTitle ? `${baseTitle} ${reportMonthLabel(value)}` : '';
  // Configs may load after the first render; the initial month stays put.
  const [initialMonth] = useState(month);
  return {
    month,
    defaultTitle: isNew ? titleFor(initialMonth) : '',
    change: (next: string, form: TitleForm) => {
      const title = form.getValues('title');
      if (baseTitle && (!title || title === titleFor(month)))
        form.setValue('title', titleFor(next), { shouldDirty: true });
      setMonth(next);
    },
  };
}

/** New report: pick the month. Existing monthly report: change it (staff). */
export function ReportMonthField({
  canApprove,
  canUpdate,
  form,
  isNew,
  newMonth,
  report,
  wsId,
}: {
  canApprove: boolean;
  canUpdate: boolean;
  form: TitleForm;
  isNew: boolean;
  newMonth: ReturnType<typeof useNewReportMonth>;
  report: UserReport;
  wsId: string;
}) {
  const t = useTranslations('ws-reports');
  const zone = getBrowserTimezone();
  const anchor = defaultReportMonth(Date.now(), zone);
  if (isNew)
    return (
      <label className="mb-3 grid gap-1.5 text-sm">
        <span className="font-medium">{t('report_month')}</span>
        <ReportMonthSelect
          anchor={anchor}
          ariaLabel={t('report_month')}
          value={newMonth.month}
          onChange={(month) => newMonth.change(month, form)}
        />
      </label>
    );
  const current = report.id ? resolveReportMonth(report, zone) : null;
  if (!current || report.cadence !== 'monthly') return null;
  return (
    <ReportMonthEditor
      key={`${report.id}:${current.month}:${current.estimated}`}
      anchor={anchor}
      // A sent report moves to another month only with approve_reports.
      canUpdate={canUpdate && (canApprove || !isReportSent(report))}
      current={current}
      reportId={report.id!}
      wsId={wsId}
    />
  );
}

function ReportMonthEditor({
  anchor,
  canUpdate,
  current,
  reportId,
  wsId,
}: {
  anchor: string;
  canUpdate: boolean;
  current: { month: string; estimated: boolean };
  reportId: string;
  wsId: string;
}) {
  const t = useTranslations('ws-reports');
  const router = useRouter();
  const [month, setMonth] = useState(current.month);
  const mutation = useSetReportMonth(wsId, () => router.refresh());
  const unchanged = month === current.month && !current.estimated;
  return (
    <div className="mb-3 grid gap-1.5 text-sm">
      <span className="font-medium">{t('report_month')}</span>
      <div className="flex gap-2">
        <ReportMonthSelect
          anchor={anchor}
          ariaLabel={t('report_month')}
          className="min-w-0 flex-1"
          disabled={!canUpdate || mutation.isPending}
          value={month}
          onChange={setMonth}
        />
        {canUpdate ? (
          <Button
            type="button"
            variant="outline"
            disabled={unchanged || mutation.isPending}
            onClick={() => mutation.mutate({ reportId, month })}
          >
            <Save className="h-4 w-4" />
            {t('save_report_month')}
          </Button>
        ) : null}
      </div>
      {current.estimated ? (
        <p className="text-muted-foreground text-xs">
          {t('report_month_estimated')}
        </p>
      ) : null}
    </div>
  );
}
