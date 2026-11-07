'use client';

import { CalendarDays } from '@tuturuuu/icons';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import {
  recentReportMonths,
  reportMonthLabel,
} from '@tuturuuu/users-core/features/reports/report-month';
import { useTranslations } from 'next-intl';

const ALL = 'all';

/** "Tháng 10/2026" picker: the last 12 months from `anchor`, newest first. */
export function ReportMonthSelect({
  anchor,
  ariaLabel,
  className,
  disabled,
  onChange,
  placeholder,
  value,
  withAll = false,
}: {
  /** Newest month offered (usually the default month). */
  anchor: string;
  ariaLabel: string;
  className?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  placeholder?: string;
  /** `YYYY-MM`, `all`, or empty to show `placeholder`. */
  value: string;
  withAll?: boolean;
}) {
  const t = useTranslations('reports-hub');
  const months = recentReportMonths(anchor, 12);
  if (value && value !== ALL && !months.includes(value)) months.push(value);
  months.sort().reverse();
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger aria-label={ariaLabel} className={className}>
        <CalendarDays className="h-4 w-4 text-muted-foreground" />
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {withAll ? (
          <SelectItem value={ALL}>{t('all_months')}</SelectItem>
        ) : null}
        {months.map((month) => (
          <SelectItem key={month} value={month}>
            {t('month_option', { month: reportMonthLabel(month) })}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
