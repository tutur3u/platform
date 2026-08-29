'use client';

import { RotateCcw } from '@tuturuuu/icons';
import type { UserGroup } from '@tuturuuu/types/primitives/UserGroup';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Combobox, type ComboboxOption } from '@tuturuuu/ui/custom/combobox';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import {
  countActiveTutoringFilters,
  isTutoringSessionFiltered,
  TUTORING_DATE_RANGES,
  type TutoringDateRange,
  type TutoringSessionFilters,
} from './tutoring-filters';
import { WorkspacePersonPicker } from './tutoring-people-picker';

const STATUS_OPTIONS = [
  'all',
  'PENDING',
  'DONE',
  'NO_SHOW',
  'CANCELLED',
] as const;

const REASON_OPTIONS = [
  'all',
  'ABSENT_RECOVERY',
  'WEAK_SUPPORT',
  'CUSTOM',
] as const;

function SegmentedControl<T extends string>({
  ariaLabel,
  onChange,
  options,
  value,
}: {
  ariaLabel: string;
  onChange: (value: T) => void;
  options: { label: string; value: T }[];
  value: T;
}) {
  return (
    <fieldset
      aria-label={ariaLabel}
      className="flex min-w-0 flex-wrap gap-1 rounded-lg border bg-muted/40 p-1"
    >
      {options.map((option) => {
        const isActive = option.value === value;
        return (
          <button
            aria-pressed={isActive}
            className={cn(
              'rounded-md px-2.5 py-1 font-medium text-xs transition-colors',
              isActive
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
            key={option.value}
            onClick={() => onChange(option.value)}
            type="button"
          >
            {option.label}
          </button>
        );
      })}
    </fieldset>
  );
}

export function TutoringSessionFiltersBar({
  filters,
  groups,
  onChange,
  onReset,
  wsId,
}: {
  filters: TutoringSessionFilters;
  groups: UserGroup[];
  onChange: (next: Partial<TutoringSessionFilters>) => void;
  onReset: () => void;
  wsId: string;
}) {
  const t = useTranslations('ws-tutoring');
  const activeCount = countActiveTutoringFilters(filters);

  const groupOptions = useMemo<ComboboxOption[]>(
    () => [
      { label: t('all_groups'), value: 'all' },
      ...groups.map((group) => ({
        label: group.name || group.id,
        value: group.id,
      })),
    ],
    [groups, t]
  );

  const statusLabels: Record<(typeof STATUS_OPTIONS)[number], string> = {
    all: t('all_statuses'),
    CANCELLED: t('status_cancelled'),
    DONE: t('status_done'),
    NO_SHOW: t('status_no_show'),
    PENDING: t('status_pending'),
  };

  const reasonLabels: Record<(typeof REASON_OPTIONS)[number], string> = {
    all: t('all_reasons'),
    ABSENT_RECOVERY: t('absent_recovery'),
    CUSTOM: t('custom_reason'),
    WEAK_SUPPORT: t('weak_support'),
  };

  const dateRangeLabels: Record<TutoringDateRange, string> = {
    all: t('range_all'),
    month: t('range_month'),
    past: t('range_past'),
    today: t('range_today'),
    upcoming: t('range_upcoming'),
    week: t('range_week'),
  };

  return (
    <div className="space-y-3 rounded-lg border bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl
          ariaLabel={t('date_range')}
          onChange={(value: TutoringDateRange) =>
            onChange({ dateRange: value })
          }
          options={TUTORING_DATE_RANGES.map((range) => ({
            label: dateRangeLabels[range],
            value: range,
          }))}
          value={filters.dateRange}
        />
        <SegmentedControl
          ariaLabel={t('status')}
          onChange={(value: string) => onChange({ attendanceStatus: value })}
          options={STATUS_OPTIONS.map((status) => ({
            label: statusLabels[status],
            value: status as string,
          }))}
          value={filters.attendanceStatus}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Combobox
          className="w-full sm:w-52"
          emptyText={t('no_groups')}
          onChange={(value) => onChange({ groupId: value as string })}
          options={groupOptions}
          placeholder={t('all_groups')}
          searchPlaceholder={t('search_groups')}
          selected={filters.groupId}
        />
        <WorkspacePersonPicker
          className="w-full sm:w-52"
          emptyText={t('no_students')}
          extraOptions={[{ label: t('all_students'), value: 'all' }]}
          onChange={(value) => onChange({ studentUserId: value })}
          placeholder={t('all_students')}
          searchPlaceholder={t('search_students')}
          value={filters.studentUserId}
          wsId={wsId}
        />
        <WorkspacePersonPicker
          className="w-full sm:w-52"
          emptyText={t('no_teachers')}
          extraOptions={[{ label: t('all_teachers'), value: 'all' }]}
          onChange={(value) => onChange({ teacherUserId: value })}
          placeholder={t('all_teachers')}
          searchPlaceholder={t('search_teachers')}
          value={filters.teacherUserId}
          wsId={wsId}
        />
        <Combobox
          className="w-full sm:w-44"
          emptyText={t('no_reasons')}
          onChange={(value) => onChange({ reasonType: value as string })}
          options={REASON_OPTIONS.map((reason) => ({
            label: reasonLabels[reason],
            value: reason as string,
          }))}
          placeholder={t('all_reasons')}
          searchPlaceholder={t('reason')}
          selected={filters.reasonType}
        />

        {isTutoringSessionFiltered(filters) ? (
          <Button
            className="ml-auto"
            onClick={onReset}
            size="sm"
            variant="ghost"
          >
            <RotateCcw className="h-4 w-4" />
            {t('reset_filters')}
            {activeCount > 0 ? (
              <Badge className="ml-1" variant="secondary">
                {activeCount}
              </Badge>
            ) : null}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
