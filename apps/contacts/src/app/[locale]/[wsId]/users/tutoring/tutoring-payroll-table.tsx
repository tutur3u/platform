'use client';
import type { TutoringPayrollReportRow } from '@tuturuuu/internal-api/tutoring';
import { Button } from '@tuturuuu/ui/button';
import { useLocale, useTranslations } from 'next-intl';
import { Fragment, useState } from 'react';
import { formatSessionTimeRange } from './tutoring-filters';

export function TutoringPayrollTable({
  rows,
}: {
  rows: TutoringPayrollReportRow[];
}) {
  const t = useTranslations('ws-tutoring');
  const locale = useLocale();
  const [open, setOpen] = useState<string | null>(null);
  const number = (value: number) =>
    value.toLocaleString(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  return (
    <div className="hidden overflow-x-auto rounded-lg border md:block">
      <table className="w-full text-sm tabular-nums">
        <caption className="sr-only">{t('payroll_tab')}</caption>
        <thead className="bg-muted text-left">
          <tr>
            {[
              'payroll_teachers',
              'payroll_slots',
              'payroll_visits',
              'payroll_minutes',
              'payroll_cong',
              'payroll_pending',
            ].map((key) => (
              <th scope="col" className="p-3" key={key}>
                {t(key)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const key = row.teacher_id ?? 'unassigned';
            return (
              <Fragment key={key}>
                <tr className="border-t">
                  <th scope="row" className="p-3 text-left">
                    <Button
                      variant="ghost"
                      aria-expanded={open === key}
                      onClick={() => setOpen(open === key ? null : key)}
                    >
                      {row.teacher_name}
                    </Button>
                  </th>
                  <td className="p-3">{row.completed_sessions}</td>
                  <td className="p-3">{row.student_visits}</td>
                  <td className="p-3">{row.total_minutes}</td>
                  <td className="p-3 font-semibold">
                    {number(row.total_cong)}
                  </td>
                  <td className="p-3">{row.pending_past}</td>
                </tr>
                {open === key && (
                  <tr>
                    <td colSpan={6} className="px-6">
                      <ul className="divide-y">
                        {row.slots.map((slot) => (
                          <li
                            key={slot.key}
                            className="flex justify-between gap-3 py-2"
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
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
