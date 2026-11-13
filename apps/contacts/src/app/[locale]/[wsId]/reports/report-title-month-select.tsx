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
  NO_TITLE_MONTH,
  parseReportTitleMonthKey,
} from '@tuturuuu/users-core/features/reports/report-title-month';
import { useTranslations } from 'next-intl';

const ALL = 'all';

export interface ReportTitleMonthOption {
  key: string;
  count: number;
}

/** "Tháng 9", "Tháng 09/2026" or "Không có tháng trong tiêu đề". */
export function reportTitleMonthLabel(
  key: string,
  labels: { month: (value: string) => string; none: string }
) {
  const parts = parseReportTitleMonthKey(key);
  if (key === NO_TITLE_MONTH || !parts) return labels.none;
  return labels.month(
    parts.year
      ? `${String(parts.month).padStart(2, '0')}/${parts.year}`
      : String(parts.month)
  );
}

/**
 * Months found in the report titles, each with how many reports carry it.
 * `options` is undefined while the counts are not known (loading) and the
 * counts are hidden when they are not exact (`partial`).
 */
export function ReportTitleMonthSelect({
  ariaLabel,
  className,
  disabled,
  onChange,
  options,
  partial = false,
  value,
}: {
  ariaLabel: string;
  className?: string;
  disabled?: boolean;
  /** `YYYY-MM`, `MM`, `none`, or empty for every month. */
  onChange: (value: string) => void;
  options?: ReportTitleMonthOption[];
  partial?: boolean;
  value: string;
}) {
  const t = useTranslations('reports-hub');
  const labels = {
    month: (month: string) => t('month_option', { month }),
    none: t('no_title_month'),
  };
  const showCounts = Boolean(options) && !partial;
  const list = [...(options ?? [])];
  if (value && !list.some((option) => option.key === value))
    list.push({ key: value, count: 0 });
  const total = list.reduce((sum, option) => sum + option.count, 0);
  const withCount = (label: string, count: number) =>
    showCounts ? `${label} (${count.toLocaleString()})` : label;
  return (
    <Select
      value={value || ALL}
      onValueChange={(next) => onChange(next === ALL ? '' : next)}
      disabled={disabled}
    >
      <SelectTrigger aria-label={ariaLabel} className={className}>
        <CalendarDays className="h-4 w-4 text-muted-foreground" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{withCount(t('all_months'), total)}</SelectItem>
        {list.map((option) => (
          <SelectItem key={option.key} value={option.key}>
            {withCount(reportTitleMonthLabel(option.key, labels), option.count)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
