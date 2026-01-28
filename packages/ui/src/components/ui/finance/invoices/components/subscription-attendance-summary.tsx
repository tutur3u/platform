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

interface SubscriptionAttendanceSummaryProps {
  selectedGroupIds: string[];
  selectedMonth: string;
  isSelectedMonthPaid: boolean;
  locale: string;
  navigateMonth: (direction: 'prev' | 'next') => void;
  canNavigateMonth: (direction: 'prev' | 'next') => boolean;
  onMonthChange: (month: string) => void;
  userGroups: any[];
  latestValidUntil: Date | null;
  isLoadingSubscriptionData: boolean;
  userAttendance: { status: string; date: string }[];
  userAttendanceError: any;
  attendanceStats: {
    present: number;
    late: number;
    absent: number;
    total: number;
  };
  totalSessions: number;
  attendanceRate: number;
  effectiveAttendanceDays: number;
}

export function SubscriptionAttendanceSummary({
  selectedGroupIds,
  selectedMonth,
  isSelectedMonthPaid,
  locale,
  navigateMonth,
  canNavigateMonth,
  onMonthChange,
  userGroups,
  latestValidUntil,
  isLoadingSubscriptionData,
  userAttendance,
  userAttendanceError,
  attendanceStats,
  totalSessions,
  attendanceRate,
}: SubscriptionAttendanceSummaryProps) {
  const t = useTranslations();
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <CardTitle>{t('ws-invoices.attendance_summary')}</CardTitle>
            {isSelectedMonthPaid && (
              <span className="rounded-full bg-green-100 px-2 py-0.5 font-medium text-[10px] text-green-700 uppercase tracking-wide">
                {t('ws-invoices.paid')}
              </span>
            )}
          </div>
          <CardDescription>
            {selectedGroupIds.length === 1
              ? t('ws-invoices.attendance_for_month', {
                  month: new Date(`${selectedMonth}-01`).toLocaleDateString(
                    locale,
                    {
                      year: 'numeric',
                      month: 'long',
                    }
                  ),
                })
              : t('ws-invoices.combined_attendance_for_month', {
                  count: selectedGroupIds.length,
                  month: new Date(`${selectedMonth}-01`).toLocaleDateString(
                    locale,
                    {
                      year: 'numeric',
                      month: 'long',
                    }
                  ),
                  default: `Combined attendance from ${selectedGroupIds.length} groups for ${new Date(
                    `${selectedMonth}-01`
                  ).toLocaleDateString(locale, {
                    year: 'numeric',
                    month: 'long',
                  })}`,
                })}
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
          <Select value={selectedMonth} onValueChange={onMonthChange}>
            <SelectTrigger>
              <SelectValue placeholder={t('ws-invoices.select_month')} />
            </SelectTrigger>
            <SelectContent>
              {(() => {
                const selectedGroupsData = userGroups.filter((g) =>
                  selectedGroupIds.includes(g.workspace_user_groups?.id || '')
                );

                if (selectedGroupsData.length === 0) return null;

                let earliestStart: Date | null = null;
                let latestEnd: Date | null = null;

                for (const groupItem of selectedGroupsData) {
                  const group = groupItem.workspace_user_groups;
                  if (!group) continue;

                  const startDate = group.starting_date
                    ? new Date(group.starting_date)
                    : null;
                  const endDate = group.ending_date
                    ? new Date(group.ending_date)
                    : null;

                  if (
                    startDate &&
                    (!earliestStart || startDate < earliestStart)
                  ) {
                    earliestStart = startDate;
                  }
                  if (endDate && (!latestEnd || endDate > latestEnd)) {
                    latestEnd = endDate;
                  }
                }

                if (!earliestStart || !latestEnd) return null;

                const months = [];
                const currentDate = new Date(earliestStart);
                currentDate.setDate(1);

                while (currentDate <= latestEnd) {
                  const value = currentDate.toISOString().slice(0, 7);
                  const label = currentDate.toLocaleDateString(locale, {
                    year: 'numeric',
                    month: 'long',
                  });
                  const isPaidItem = (() => {
                    if (!latestValidUntil) return false;
                    const itemMonthStart = new Date(currentDate);
                    itemMonthStart.setDate(1);
                    const paidMonthStart = new Date(latestValidUntil);
                    paidMonthStart.setDate(1);
                    return itemMonthStart < paidMonthStart;
                  })();

                  months.push(
                    <SelectItem key={value} value={value}>
                      <span className="flex items-center gap-2">
                        <span>{label}</span>
                        {isPaidItem && (
                          <span className="rounded bg-green-100 px-1.5 py-0.5 font-medium text-[10px] text-green-700">
                            {t('ws-invoices.paid')}
                          </span>
                        )}
                      </span>
                    </SelectItem>
                  );

                  currentDate.setMonth(currentDate.getMonth() + 1);
                }

                return months;
              })()}
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
                <p className="font-bold text-2xl text-green-600">
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
                <p className="font-bold text-green-600 text-xl">
                  {attendanceStats.present}
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-muted-foreground text-sm">
                  {t('ws-invoices.late')}
                </p>
                <p className="font-bold text-xl text-yellow-600">
                  {attendanceStats.late}
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-muted-foreground text-sm">
                  {t('ws-invoices.absent')}
                </p>
                <p className="font-bold text-red-600 text-xl">
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
                  className="h-2 rounded-full bg-green-500 transition-all"
                  style={{
                    width: `${Math.min(attendanceRate, 100)}%`,
                  }}
                />
              </div>
            </div>

            {selectedGroupIds.length === 1 &&
              userAttendance &&
              userAttendance.length > 0 && (
                <div className="space-y-2">
                  <Label>{t('ws-invoices.attendance_calendar')}</Label>
                  <AttendanceCalendar
                    userAttendance={userAttendance}
                    selectedMonth={selectedMonth}
                    selectedGroup={userGroups.find(
                      (g) => g.workspace_user_groups?.id === selectedGroupIds[0]
                    )}
                    locale={locale}
                  />
                  <div className="flex items-center gap-4 text-muted-foreground text-xs">
                    <div className="flex items-center gap-1">
                      <div className="h-2 w-2 rounded-full bg-green-500"></div>
                      <span>{t('ws-invoices.present')}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="h-2 w-2 rounded-full bg-yellow-500"></div>
                      <span>{t('ws-invoices.late')}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="h-2 w-2 rounded-full bg-red-500"></div>
                      <span>{t('ws-invoices.absent')}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="h-2 w-2 rounded-full bg-gray-300"></div>
                      <span>{t('ws-invoices.no_session')}</span>
                    </div>
                  </div>
                </div>
              )}
            {selectedGroupIds.length > 1 && (
              <div className="text-muted-foreground text-sm italic">
                {t('ws-invoices.calendar_hidden_multiple_groups', {
                  default: 'Calendar view hidden for multiple group selection',
                })}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
