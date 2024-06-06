'use client';

import { WorkspaceUser } from '@/types/primitives/WorkspaceUser';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Fragment, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import useTranslation from 'next-translate/useTranslation';
import { Button } from '@/components/ui/button';
import useQuery from '@/hooks/useQuery';
import { format, parse } from 'date-fns';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

export default function UserMonthAttendance({
  wsId,
  user: initialUser,
  defaultIncludedGroups,
}: {
  wsId: string;
  user: WorkspaceUser & { href: string };
  defaultIncludedGroups?: string[];
}) {
  const { lang } = useTranslation();
  const query = useQuery();

  const queryMonth = query.get('month');

  const currentYYYYMM = Array.isArray(queryMonth)
    ? queryMonth[0] || format(new Date(), 'yyyy-MM')
    : queryMonth || format(new Date(), 'yyyy-MM');

  const currentMonth = useMemo(
    () => parse(currentYYYYMM, 'yyyy-MM', new Date()),
    [currentYYYYMM]
  );

  const queryIncludedGroups = useMemo(
    () => query.get('includedGroups'),
    [query]
  );

  const currentIncludedGroups = useMemo(
    () =>
      defaultIncludedGroups
        ? defaultIncludedGroups
        : typeof queryIncludedGroups === 'string'
          ? [queryIncludedGroups]
          : queryIncludedGroups ?? [],
    [defaultIncludedGroups, queryIncludedGroups]
  );

  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(currentMonth);
  const [currentUserData, setCurrentUserData] = useState(initialUser);
  const [currentUserGroups] = useState<string[]>(currentIncludedGroups);

  useEffect(() => {
    const fetchData = async (includedGroups?: string[]) => {
      setCurrentDate(currentMonth);
      setLoading(true);

      const { data } = await getData(
        wsId,
        initialUser.id,
        format(new Date(currentMonth), 'yyyy-MM'),
        includedGroups
      );

      setCurrentUserData({ ...initialUser, ...data });
      setLoading(false);
    };

    fetchData(currentUserGroups);
  }, [wsId, currentMonth, initialUser, currentUserGroups]);

  const handlePrev = async () => {
    setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth() - 1)));
    setLoading(true);

    const { data } = await getData(
      wsId,
      initialUser.id,
      format(new Date(currentDate), 'yyyy-MM'),
      currentIncludedGroups
    );

    setCurrentUserData({ ...currentUserData, ...data });
    setLoading(false);
  };

  const handleNext = async () => {
    setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth() + 1)));
    setLoading(true);

    const { data } = await getData(
      wsId,
      initialUser.id,
      format(new Date(currentDate), 'yyyy-MM'),
      currentIncludedGroups
    );

    setCurrentUserData({ ...currentUserData, ...data });
    setLoading(false);
  };

  const thisYear = currentDate.getFullYear();
  const thisMonth = currentDate.toLocaleString(lang, { month: '2-digit' });

  // includes all days of the week, starting from monday to sunday
  const days = Array.from({ length: 7 }, (_, i) => {
    let newDay = new Date(currentDate);
    newDay.setDate(currentDate.getDate() - currentDate.getDay() + i + 1);
    return newDay.toLocaleString(lang, { weekday: 'narrow' });
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

  const isDateAttended = (user: WorkspaceUser, currentDate: Date) =>
    user.attendance?.some((attendance) => {
      const attendanceDate = new Date(attendance.date);
      return (
        attendanceDate.getDate() === currentDate.getDate() &&
        attendanceDate.getMonth() === currentDate.getMonth() &&
        attendanceDate.getFullYear() === currentDate.getFullYear() &&
        attendance.status === 'PRESENT'
      );
    });

  const isDateAbsent = (user: WorkspaceUser, currentDate: Date) =>
    user.attendance?.some((attendance) => {
      const attendanceDate = new Date(attendance.date);
      return (
        attendanceDate.getDate() === currentDate.getDate() &&
        attendanceDate.getMonth() === currentDate.getMonth() &&
        attendanceDate.getFullYear() === currentDate.getFullYear() &&
        attendance.status === 'ABSENT'
      );
    });

  const differentGroups = currentUserData.attendance
    ?.reduce((acc: { id: string; name: string }[], attendance) => {
      return acc.concat(attendance.groups);
    }, [])
    .filter(
      (group, idx, arr) => arr.findIndex((g) => g.id === group.id) === idx
    );

  return (
    <div className="rounded-lg border p-4">
      <div className="mb-2 flex w-full items-center border-b pb-2">
        <div className="aspect-square h-12 w-12 flex-none rounded-lg bg-gradient-to-br from-green-300 via-blue-500 to-purple-600 dark:from-green-300/70 dark:via-blue-500/70 dark:to-purple-600/70" />
        <div className="ml-2 w-full">
          <div className="flex items-center justify-between gap-1">
            <Link
              href={currentUserData.href}
              className="line-clamp-1 font-semibold text-zinc-900 hover:underline dark:text-zinc-200"
            >
              {currentUserData?.full_name || '-'}
            </Link>
          </div>
          <div>
            {differentGroups?.map((group) => (
              <span
                key={group.id}
                className="bg-foreground/5 dark:bg-foreground/10 rounded border px-2 py-0.5 text-xs font-semibold"
              >
                {group.name}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div>
        <div className="grid h-full gap-8">
          <div key={2024} className="flex h-full flex-col">
            <div className="mb-4 flex items-center justify-between gap-4 text-xl font-bold md:text-2xl">
              <div className="flex items-center gap-1">
                {thisYear}
                <div className="bg-foreground/20 mx-2 h-4 w-[1px] rotate-[30deg]" />
                <span className="text-lg font-semibold md:text-xl">
                  {thisMonth}
                </span>
              </div>
              <div className="flex items-center gap-1">
                {currentUserData.attendance && (
                  <div
                    className={`bg-foreground/5 rounded border px-2 py-0.5 text-xs ${
                      currentUserData.attendance.length === 0 || loading
                        ? 'opacity-50'
                        : ''
                    }`}
                  >
                    <span className="text-green-500 dark:text-green-300">
                      {
                        currentUserData.attendance.filter(
                          (attendance) => attendance.status === 'PRESENT'
                        ).length
                      }
                    </span>{' '}
                    +{' '}
                    <span className="text-red-500 dark:text-red-300">
                      {
                        currentUserData.attendance.filter(
                          (attendance) => attendance.status === 'ABSENT'
                        ).length
                      }
                    </span>{' '}
                    ={' '}
                    <span className="text-blue-500 dark:text-blue-300">
                      {currentUserData.attendance.length}
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
                    className="bg-foreground/5 flex flex-none cursor-default justify-center rounded p-2 font-semibold transition duration-300 md:rounded-lg"
                  >
                    {day}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1 md:gap-2">
                {daysInMonth.map((day, idx) => (
                  <Fragment key={`day-${idx}`}>
                    <div
                      className={`flex flex-none cursor-default justify-center rounded border p-2 font-semibold transition duration-300 md:rounded-lg ${
                        !isCurrentMonth(day) || loading
                          ? 'text-foreground/20 border-transparent'
                          : isDateAttended(currentUserData, day)
                            ? 'border-green-500/30 bg-green-500/10 text-green-600 dark:border-green-300/20 dark:bg-green-300/20 dark:text-green-300'
                            : isDateAbsent(currentUserData, day)
                              ? 'border-red-500/30 bg-red-500/10 text-red-600 dark:border-red-300/20 dark:bg-red-300/20 dark:text-red-300'
                              : 'bg-foreground/5 text-foreground/40 dark:bg-foreground/10'
                      }`}
                    >
                      {day.getDate()}
                    </div>
                  </Fragment>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

async function getData(
  wsId: string,
  userId: string,
  month: string,
  includedGroups?: string[]
) {
  const supabase = createClientComponentClient();

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

  if (includedGroups && includedGroups.length > 0) {
    queryBuilder.in('attendance.group_id', includedGroups);
  }

  const { data, error } = await queryBuilder.single();

  if (error) throw error;
  return { data } as { data: WorkspaceUser };
}
