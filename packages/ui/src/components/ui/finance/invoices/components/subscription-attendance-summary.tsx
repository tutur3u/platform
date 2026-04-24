'use client';

import { ChevronLeft, ChevronRight, Loader2 } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { AttendanceCalendar } from '@tuturuuu/ui/finance/invoices/attendance-calendar';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { useTranslations } from 'next-intl';
import type React from 'react';
import { type BillableSession, formatMonthLabel } from '../utils';

export type AvailableMonthOption = {
  value: string;
  label: string;
  isPaid: boolean;
};

interface SubscriptionAttendanceSummaryProps {
  selectedGroupIds: string[];
  selectedMonth: string;
  isSelectedMonthPaid: boolean;
  locale: string;
  navigateMonth: (direction: 'prev' | 'next') => void;
  canNavigateMonth: (direction: 'prev' | 'next') => boolean;
  onMonthChange: (month: string) => void;
  availableMonths: AvailableMonthOption[];
  latestSubscriptionInvoices: {
    group_id?: string;
    valid_until?: string | null;
    created_at?: string | null;
  }[];
  isLoadingSubscriptionData: boolean;
  userAttendance: { status: string; date: string }[];
  displaySessions: BillableSession[];
  userAttendanceError: Error | null;
  attendanceStats: {
    present: number;
    late: number;
    absent: number;
    total: number;
  };
  totalSessions: number;
  attendanceRate: number;
}

export function SubscriptionAttendanceSummary({
  selectedGroupIds,
  selectedMonth,
  isSelectedMonthPaid,
  locale,
  navigateMonth,
  canNavigateMonth,
  onMonthChange,
  availableMonths,
  latestSubscriptionInvoices: _latestSubscriptionInvoices,
  isLoadingSubscriptionData,
  userAttendance,
  displaySessions,
  userAttendanceError,
  attendanceStats,
  totalSessions,
  attendanceRate,
}: SubscriptionAttendanceSummaryProps): React.ReactElement {
  const t = useTranslations();

  // Ensure Select always receives a value present in availableMonths to avoid Radix update loops
  const isValidMonth = availableMonths.some((m) => m.value === selectedMonth);
  const resolvedSelectedMonth = isValidMonth
    ? selectedMonth
    : (availableMonths[0]?.value ?? selectedMonth);
  const monthLabel = formatMonthLabel(resolvedSelectedMonth, locale);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <CardTitle>{t('ws-invoices.attendance_summary')}</CardTitle>
            {isSelectedMonthPaid && (
              <span className="rounded-full bg-dynamic-green/10 px-2 py-0.5 font-medium text-[10px] text-dynamic-green uppercase tracking-wide">
                {t('ws-invoices.paid')}
              </span>
            )}
          </div>
          <CardDescription className="flex flex-col gap-1">
            {selectedGroupIds.length === 1
              ? t('ws-invoices.attendance_for_month', {
                  month: monthLabel,
                })
              : t('ws-invoices.combined_attendance_for_month', {
                  count: selectedGroupIds.length,
                  month: monthLabel,
                  default: `Combined attendance from ${selectedGroupIds.length} groups for ${monthLabel}`,
                })}
            <span className="text-muted-foreground text-xs">
              {isSelectedMonthPaid
                ? t('ws-invoices.all_groups_paid_for_month')
                : t('ws-invoices.some_groups_unpaid_for_month')}
            </span>
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => navigateMonth('prev')}
            disabled={!canNavigateMonth('prev')}
            aria-label={t('ws-invoices.previous_month')}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Select value={resolvedSelectedMonth} onValueChange={onMonthChange}>
            <SelectTrigger>
              <SelectValue placeholder={t('ws-invoices.select_month')} />
            </SelectTrigger>
            <SelectContent>
              {availableMonths.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  <span className="flex items-center gap-2">
                    <span>{m.label}</span>
                    {m.isPaid && (
                      <span className="rounded bg-dynamic-green/10 px-1.5 py-0.5 font-medium text-[10px] text-dynamic-green">
                        {t('ws-invoices.paid')}
                      </span>
                    )}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => navigateMonth('next')}
            disabled={!canNavigateMonth('next')}
            aria-label={t('ws-invoices.next_month')}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoadingSubscriptionData && userAttendance.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <p className="text-muted-foreground text-sm">
                {t('ws-invoices.loading_attendance')}
              </p>
            </div>
          </div>
        ) : userAttendanceError ? (
          <div className="flex items-center justify-center py-8">
            <p className="text-destructive text-sm">
              {t('ws-invoices.error_loading_attendance')}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-lg border p-3">
                <p className="text-muted-foreground text-sm">
                  {t('ws-invoices.days_attended')}
                </p>
                <p className="font-bold text-2xl text-dynamic-green">
                  {attendanceStats.present + attendanceStats.late}
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-muted-foreground text-sm">
                  {t('ws-invoices.total_sessions')}
                </p>
                <p className="font-bold text-2xl">{totalSessions}</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border p-3">
                <p className="text-muted-foreground text-sm">
                  {t('ws-invoices.present')}
                </p>
                <p className="font-bold text-dynamic-green text-xl">
                  {attendanceStats.present}
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-muted-foreground text-sm">
                  {t('ws-invoices.late')}
                </p>
                <p className="font-bold text-dynamic-yellow text-xl">
                  {attendanceStats.late}
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-muted-foreground text-sm">
                  {t('ws-invoices.absent')}
                </p>
                <p className="font-bold text-dynamic-red text-xl">
                  {attendanceStats.absent}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>{t('ws-invoices.attendance_rate')}</span>
                <span className="font-medium">
                  {attendanceRate.toFixed(1)}%
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-muted">
                <div
                  className="h-2 rounded-full bg-dynamic-green transition-all"
                  style={{
                    width: `${Math.min(attendanceRate, 100)}%`,
                  }}
                />
              </div>
            </div>

            {((userAttendance && userAttendance.length > 0) ||
              totalSessions > 0) && (
              <div className="space-y-2">
                <Label>{t('ws-invoices.attendance_calendar')}</Label>
                <AttendanceCalendar
                  userAttendance={userAttendance}
                  selectedMonth={resolvedSelectedMonth}
                  sessions={displaySessions}
                  locale={locale}
                />
                <div className="flex items-center gap-4 text-muted-foreground text-xs">
                  <div className="flex items-center gap-1">
                    <div className="h-2 w-2 rounded-full bg-dynamic-green"></div>
                    <span>{t('ws-invoices.present')}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="h-2 w-2 rounded-full bg-dynamic-yellow"></div>
                    <span>{t('ws-invoices.late')}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="h-2 w-2 rounded-full bg-dynamic-red"></div>
                    <span>{t('ws-invoices.absent')}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="h-2 w-2 rounded-full bg-dynamic-muted"></div>
                    <span>{t('ws-invoices.no_session')}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
