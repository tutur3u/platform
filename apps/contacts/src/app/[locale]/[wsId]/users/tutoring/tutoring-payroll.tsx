'use client';
import { useQuery } from '@tanstack/react-query';
import { getTutoringPayroll } from '@tuturuuu/internal-api/tutoring';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { toast } from '@tuturuuu/ui/sonner';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { runTutoringExport } from './tutoring-export';
import {
  addDaysToIsoDate,
  endOfMonthIsoDate,
  formatSessionTimeRange,
  startOfMonthIsoDate,
} from './tutoring-filters';
import { TutoringPayrollTable } from './tutoring-payroll-table';

export function TutoringPayroll({
  wsId,
  today,
}: {
  wsId: string;
  today: string;
}) {
  const t = useTranslations('ws-tutoring');
  const locale = useLocale();
  const [fromDate, setFrom] = useState(startOfMonthIsoDate(today));
  const [toDate, setTo] = useState(endOfMonthIsoDate(today));
  const [exporting, setExporting] = useState(false);
  const valid = Boolean(
    fromDate &&
      toDate &&
      fromDate <= toDate &&
      (Date.parse(toDate) - Date.parse(fromDate)) / 86_400_000 + 1 <= 366
  );
  const query = useQuery({
    queryKey: ['tutoring-payroll', wsId, fromDate, toDate, today],
    enabled: valid,
    queryFn: () => getTutoringPayroll(wsId, { fromDate, toDate }),
    staleTime: 60_000,
  });
  const rows = query.data?.data ?? [];
  const number = (value: number) =>
    value.toLocaleString(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  const totals = rows.reduce(
    (sum, row) => ({
      cong: sum.cong + row.total_minutes / 45,
      slots: sum.slots + row.completed_sessions,
      pending: sum.pending + row.pending_past,
    }),
    { cong: 0, slots: 0, pending: 0 }
  );
  const exportRows = async (format: 'payroll-csv' | 'payroll-xlsx') => {
    setExporting(true);
    try {
      await runTutoringExport({ wsId, format, query: { fromDate, toDate } });
    } catch {
      toast.error(t('export_failed'));
    } finally {
      setExporting(false);
    }
  };
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1">
          {t('payroll_from')}
          <Input
            type="date"
            value={fromDate}
            max={toDate}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label className="space-y-1">
          {t('payroll_to')}
          <Input
            type="date"
            value={toDate}
            min={fromDate}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        {(['month', 'lastMonth', 'week'] as const).map((preset) => (
          <Button
            key={preset}
            variant="outline"
            onClick={() => {
              const day =
                preset === 'lastMonth'
                  ? addDaysToIsoDate(startOfMonthIsoDate(today), -1)
                  : today;
              setFrom(preset === 'week' ? today : startOfMonthIsoDate(day));
              setTo(
                preset === 'week'
                  ? addDaysToIsoDate(today, 6)
                  : endOfMonthIsoDate(day)
              );
            }}
          >
            {t(
              preset === 'lastMonth'
                ? 'range_lastMonth'
                : preset === 'month'
                  ? 'range_month'
                  : 'range_week'
            )}
          </Button>
        ))}
        <Button
          disabled={!valid || exporting || !query.isSuccess}
          onClick={() => void exportRows('payroll-xlsx')}
        >
          {t('payroll_excel')}
        </Button>
        <Button
          variant="outline"
          disabled={!valid || exporting || !query.isSuccess}
          onClick={() => void exportRows('payroll-csv')}
        >
          CSV
        </Button>
      </div>
      {!valid ? (
        <p role="alert">{t('payroll_invalid_range')}</p>
      ) : query.isPending ? (
        <p role="status">{t('payroll_loading')}</p>
      ) : query.isError ? (
        <div role="alert">
          {t('sessions_load_failed')}{' '}
          <Button onClick={() => void query.refetch()}>{t('retry')}</Button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              [t('payroll_cong'), number(totals.cong)],
              [t('payroll_slots'), totals.slots],
              [
                t('payroll_teachers'),
                rows.filter((r) => r.completed_sessions > 0).length,
              ],
              [t('payroll_pending'), totals.pending],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border bg-card p-4">
                <p className="text-muted-foreground text-sm">{label}</p>
                <p className="font-semibold text-2xl tabular-nums">{value}</p>
              </div>
            ))}
          </div>
          {rows.length === 0 && <p>{t('payroll_empty')}</p>}
          <TutoringPayrollTable rows={rows} />
          <div className="space-y-3 md:hidden">
            {rows.map((row) => (
              <details
                key={row.teacher_id ?? 'unassigned'}
                className="rounded-lg border bg-card p-4"
              >
                <summary className="cursor-pointer">
                  <span className="font-semibold">{row.teacher_name}</span>
                  <span className="float-right font-semibold tabular-nums">
                    {number(row.total_cong)} {t('payroll_cong')}
                  </span>
                  <p className="mt-2 text-muted-foreground text-sm">
                    {row.completed_sessions} {t('payroll_slots')} ·{' '}
                    {row.student_visits} {t('payroll_visits')} ·{' '}
                    {row.total_minutes} {t('payroll_minutes')} ·{' '}
                    {row.pending_past} {t('payroll_pending')}
                  </p>
                </summary>
                <ul className="mt-3 divide-y">
                  {row.slots.map((slot) => (
                    <li
                      key={slot.key}
                      className="flex flex-wrap justify-between gap-2 py-2 text-sm"
                    >
                      <span>
                        {slot.date} ·{' '}
                        {formatSessionTimeRange(
                          slot.time,
                          slot.duration_minutes
                        )}
                      </span>
                      <span>
                        {slot.learner_count} {t('payroll_visits')} ·{' '}
                        {t(`status_${slot.status.toLowerCase()}`)} ·{' '}
                        {number(slot.total_cong)}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
        </>
      )}
      <p className="text-muted-foreground text-sm">{t('payroll_rule')}</p>
    </section>
  );
}
