'use client';

import { AttendanceDialog } from './attendance-dialogue';
import useSearchParams from '@/hooks/useSearchParams';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { createClient } from '@tuturuuu/supabase/next/client';
import {
  WorkspaceUser,
  WorkspaceUserAttendance,
} from '@tuturuuu/types/primitives/WorkspaceUser';
import { Button } from '@tuturuuu/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils';
import { format, isAfter, parse, startOfDay } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useLocale } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Fragment, useEffect, useMemo, useState } from 'react';

export default function UserMonthAttendance({
  wsId,
  user: initialUser,
  noOutline,
}: {
  wsId: string;
  user: WorkspaceUser & { href: string };
  defaultIncludedGroups?: string[];
  noOutline?: boolean;
}) {
  const locale = useLocale();
  const searchParams = useSearchParams();
  const router = useRouter();

  const queryMonth = searchParams.get('month');

  const currentYYYYMM = Array.isArray(queryMonth)
    ? queryMonth[0] || format(new Date(), 'yyyy-MM')
    : queryMonth || format(new Date(), 'yyyy-MM');

  const currentMonth = useMemo(
    () => parse(currentYYYYMM, 'yyyy-MM', new Date()),
    [currentYYYYMM]
  );

  const [currentDate, setCurrentDate] = useState(currentMonth);

  useEffect(() => {
    setCurrentDate(currentMonth);
  }, [currentMonth]);

  const month = format(new Date(currentDate), 'yyyy-MM');

  const {
    isPending,
    isError,
    data: queryData,
    refetch,
  } = useQuery({
    queryKey: [
      'workspaces',
      wsId,
      'users',
      initialUser.id,
      'attendance',
      {
        month,
      },
    ],
    queryFn: () => getData(wsId, initialUser.id, month),
    placeholderData: keepPreviousData,
  });

  const data = {
    ...initialUser,
    ...queryData?.data,
  };

  const handlePrev = async () =>
    setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth() - 1)));

  const handleNext = async () =>
    setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth() + 1)));

  const thisYear = currentDate.getFullYear();
  const thisMonth = currentDate.toLocaleString(locale, { month: '2-digit' });

  // includes all days of the week, starting from monday to sunday
  const days = Array.from({ length: 7 }, (_, i) => {
    let newDay = new Date(currentDate);
    newDay.setDate(currentDate.getDate() - currentDate.getDay() + i + 1);
    return newDay.toLocaleString(locale, { weekday: 'narrow' });
  });

  // includes all days of the month, starting from monday (which could be from the previous month) to sunday (which could be from the next month)
  const daysInMonth = Array.from({ length: 42 }, (_, i) => {
    let newDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    let dayOfWeek = newDay.getDay();
    let adjustment = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // adjust for Monday start
    newDay.setDate(newDay.getDate() - adjustment + i);
    return newDay;
  });

  const isCurrentMonth = (date: Date) =>
    date.getMonth() === currentDate.getMonth() &&
    date.getFullYear() === currentDate.getFullYear();

  const isDateAttended = (user: Partial<WorkspaceUser>, currentDate: Date) =>
    user.attendance?.some((attendance) => {
      const attendanceDate = new Date(attendance.date);
      return (
        attendanceDate.getDate() === currentDate.getDate() &&
        attendanceDate.getMonth() === currentDate.getMonth() &&
        attendanceDate.getFullYear() === currentDate.getFullYear() &&
        attendance.status === 'PRESENT'
      );
    });

  const isDateAbsent = (user: Partial<WorkspaceUser>, currentDate: Date) =>
    user.attendance?.some((attendance) => {
      const attendanceDate = new Date(attendance.date);
      return (
        attendanceDate.getDate() === currentDate.getDate() &&
        attendanceDate.getMonth() === currentDate.getMonth() &&
        attendanceDate.getFullYear() === currentDate.getFullYear() &&
        attendance.status === 'ABSENT'
      );
    });

  function getAttendanceGroupNames(
    date: Date,
    attendanceData: WorkspaceUserAttendance[]
  ): string[] {
    if (!attendanceData) return [];

    const filteredAttendance = attendanceData.filter((attendance) => {
      const attendanceDate = new Date(attendance.date);
      return (
        attendanceDate.getDate() === date.getDate() &&
        attendanceDate.getMonth() === date.getMonth() &&
        attendanceDate.getFullYear() === date.getFullYear()
      );
    });

    const uniqueGroups = filteredAttendance.reduce(
      (acc, curr) => {
        Array.isArray(curr.groups)
          ? curr.groups.forEach((group) => {
              if (!acc.some((g) => g.id === group.id)) {
                acc.push(group);
              }
            })
          : curr.groups && acc.push(curr.groups);

        return acc;
      },
      [] as { id: string; name: string }[]
    );

    return uniqueGroups.map((group) => group.name);
  }

  const differentGroups = data?.attendance
    ?.reduce((acc: { id: string; name: string }[], attendance) => {
      if (!attendance.groups) return acc;
      return acc.concat(attendance.groups);
    }, [])
    .filter(
      (group, idx, arr) => arr.findIndex((g) => g.id === group.id) === idx
    );

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [currentStatus, setCurrentStatus] = useState<
    'PRESENT' | 'ABSENT' | null
  >(null);

  const today = startOfDay(new Date());

  const handleDateClick = (date: Date) => {
    if (!isAfter(date, today)) {
      setSelectedDate(date);

      // Find the attendance record for the selected date
      const attendanceRecord = data.attendance?.find((attendance) => {
        const attendanceDate = new Date(attendance.date);
        return (
          attendanceDate.getDate() === date.getDate() &&
          attendanceDate.getMonth() === date.getMonth() &&
          attendanceDate.getFullYear() === date.getFullYear()
        );
      });

      // Set the current status and group ID if an attendance record exists
      if (attendanceRecord) {
        setCurrentStatus(attendanceRecord.status as 'PRESENT' | 'ABSENT');
      } else {
        setCurrentStatus(null);
      }

      setIsDialogOpen(true);
    }
  };

  const handleDialogClose = () => {
    setIsDialogOpen(false);
    setSelectedDate(null);
    setCurrentStatus(null);
  };

  const handleAttendanceUpdated = () => {
    refetch();
    router.refresh();
  };

  return (
    <div className={cn('rounded-lg', noOutline || 'border p-4')}>
      <div className="mb-2 flex w-full items-center border-b pb-2">
        <div className="aspect-square h-12 w-12 flex-none rounded-lg bg-gradient-to-br from-green-300 via-blue-500 to-purple-600 dark:from-green-300/70 dark:via-blue-500/70 dark:to-purple-600/70" />
        <div className="flex w-full items-start justify-between gap-2">
          <div className="ml-2 flex h-12 w-[calc(100%-3.5rem)] flex-col justify-between">
            <div className="flex items-center justify-between gap-1">
              <Link
                href={data.href}
                className="line-clamp-1 font-semibold text-zinc-900 hover:underline dark:text-zinc-200"
              >
                {data?.display_name || data?.full_name || data?.email || '-'}
              </Link>
            </div>
            <div className="scrollbar-none flex items-center gap-1 overflow-auto">
              {differentGroups?.map((group, idx) => (
                <div
                  key={group.id + idx}
                  className="flex-none rounded border bg-foreground/5 px-2 py-0.5 text-xs font-semibold whitespace-nowrap dark:bg-foreground/10"
                >
                  {group.name}
                </div>
              ))}
            </div>
          </div>
          {/* <Button>
            <CalendarCheck2 className="h-6 w-6" />
          </Button> */}
        </div>
      </div>

      <div>
        <div className="grid h-full gap-8">
          <div key={2024} className="flex h-full flex-col">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xl font-bold md:text-2xl">
              <div className="flex items-center gap-1">
                {thisYear}
                <div className="mx-2 h-4 w-[1px] rotate-[30deg] bg-foreground/20" />
                <span className="text-lg font-semibold md:text-xl">
                  {thisMonth}
                </span>
              </div>
              <div className="flex items-center gap-1">
                {data.attendance && (
                  <div
                    className={`rounded border bg-foreground/5 px-2 py-0.5 text-xs ${
                      data.attendance.length === 0 || isPending || isError
                        ? 'opacity-50'
                        : ''
                    }`}
                  >
                    <span className="text-green-500 dark:text-green-300">
                      {
                        data.attendance.filter(
                          (attendance) => attendance.status === 'PRESENT'
                        ).length
                      }
                    </span>{' '}
                    +{' '}
                    <span className="text-red-500 dark:text-red-300">
                      {
                        data.attendance.filter(
                          (attendance) => attendance.status === 'ABSENT'
                        ).length
                      }
                    </span>{' '}
                    ={' '}
                    <span className="text-blue-500 dark:text-blue-300">
                      {data.attendance.length}
                    </span>
                  </div>
                )}

                <Button size="xs" variant="secondary" onClick={handlePrev}>
                  <ChevronLeft className="h-6 w-6" />
                </Button>

                <Button
                  size="xs"
                  variant="secondary"
                  onClick={handleNext}
                  disabled={
                    currentDate.getMonth() === new Date().getMonth() &&
                    currentDate.getFullYear() === new Date().getFullYear()
                  }
                >
                  <ChevronRight className="h-6 w-6" />
                </Button>
              </div>
            </div>

            <div className="relative grid gap-1 text-xs md:gap-2 md:text-base">
              <div className="grid grid-cols-7 gap-1 md:gap-2">
                {days.map((day, idx) => (
                  <div
                    key={`day-${idx}`}
                    className="flex flex-none cursor-default justify-center rounded bg-foreground/5 p-2 font-semibold transition duration-300 md:rounded-lg"
                  >
                    {day}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1 md:gap-2">
                <TooltipProvider delayDuration={0}>
                  {daysInMonth.map((day, idx) => {
                    if (isError || !isCurrentMonth(day))
                      return (
                        <div
                          key={`${initialUser.id}-${currentDate.toDateString()}-day-${idx}`}
                          className="flex flex-none cursor-default justify-center rounded border border-transparent p-2 font-semibold text-foreground/20 transition duration-300 md:rounded-lg"
                        >
                          {day.getDate()}
                        </div>
                      );

                    if (!isDateAttended(data, day) && !isDateAbsent(data, day))
                      return (
                        <button
                          onClick={() => handleDateClick(day)}
                          key={`${initialUser.id}-${currentDate.toDateString()}-day-${idx}`}
                          className={cn(
                            'flex flex-none cursor-default justify-center rounded border bg-foreground/5 p-2 font-semibold text-foreground/40 transition duration-300 hover:cursor-pointer md:rounded-lg dark:bg-foreground/10',
                            isAfter(day, today) &&
                              'cursor-not-allowed opacity-50 hover:cursor-not-allowed'
                          )}
                        >
                          {day.getDate()}
                        </button>
                      );

                    return (
                      <Fragment
                        key={`${initialUser.id}-${currentDate.toDateString()}-day-${idx}`}
                      >
                        <Tooltip>
                          <TooltipTrigger
                            disabled={isError || !isCurrentMonth(day)}
                            asChild
                          >
                            <button
                              onClick={() => handleDateClick(day)}
                              className={`flex flex-none cursor-pointer justify-center rounded border p-2 font-semibold transition duration-300 md:rounded-lg ${
                                isDateAttended(data, day)
                                  ? 'border-green-500/30 bg-green-500/10 text-green-600 dark:border-green-300/20 dark:bg-green-300/20 dark:text-green-300'
                                  : isDateAbsent(data, day)
                                    ? 'border-red-500/30 bg-red-500/10 text-red-600 dark:border-red-300/20 dark:bg-red-300/20 dark:text-red-300'
                                    : 'bg-foreground/5 text-foreground/40 dark:bg-foreground/10'
                              }`}
                            >
                              {day.getDate()}
                            </button>
                          </TooltipTrigger>

                          <TooltipContent>
                            {/* Display group name for current day */}
                            {getAttendanceGroupNames(
                              day,
                              data.attendance || []
                            ).map((groupName, idx) => (
                              <div
                                key={groupName + idx}
                                className="flex items-center gap-1"
                              >
                                <span className="text-xs font-semibold">
                                  {groupName}
                                </span>
                              </div>
                            ))}
                          </TooltipContent>
                        </Tooltip>
                      </Fragment>
                    );
                  })}
                </TooltipProvider>
              </div>

              {selectedDate && (
                <AttendanceDialog
                  wsId={wsId}
                  isOpen={isDialogOpen}
                  currentStatus={currentStatus}
                  date={selectedDate}
                  user={data}
                  onAttendanceUpdated={handleAttendanceUpdated}
                  onClose={handleDialogClose}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

async function getData(wsId: string, userId: string, month: string) {
  const supabase = await createClient();

  const startDate = new Date(month);
  const endDate = new Date(
    new Date(startDate).setMonth(startDate.getMonth() + 1)
  );

  const queryBuilder = supabase
    .from('workspace_users')
    .select(
      'attendance:user_group_attendance(date, status, groups:workspace_user_groups(id, name))'
    )
    .eq('ws_id', wsId)
    .gte('attendance.date', startDate.toISOString())
    .lt('attendance.date', endDate.toISOString())
    .order('full_name', { ascending: true, nullsFirst: false })
    .eq('id', userId);

  const { data, error } = await queryBuilder.single();

  if (error) throw error;
  return { data } as unknown as { data: WorkspaceUser };
}
