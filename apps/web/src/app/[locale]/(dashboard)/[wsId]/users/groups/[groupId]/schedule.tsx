'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { UserGroup } from '@tuturuuu/types/primitives/UserGroup';
import { Button } from '@tuturuuu/ui/button';
import useSearchParams from '@tuturuuu/ui/hooks/useSearchParams';
import { cn } from '@tuturuuu/utils/format';
import { format, parse } from 'date-fns';
import { useLocale } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';

export default function GroupSchedule({
  wsId,
  groupId,
}: {
  wsId: string;
  groupId: string;
}) {
  const locale = useLocale();
  const searchParams = useSearchParams();

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

  const {
    isPending,
    isError,
    data: queryData,
  } = useQuery<{ data: UserGroup }>({
    queryKey: ['workspaces', wsId, 'users', 'groups', groupId, 'schedule'],
    queryFn: () => getData(wsId, groupId),
    placeholderData: keepPreviousData,
  });

  const data = {
    ...queryData?.data,
  };

  const handlePrev = async () =>
    setCurrentDate(
      new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1)
    );

  const handleNext = async () =>
    setCurrentDate(
      new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1)
    );

  // Check if prev button should be disabled based on starting_date
  const isPrevDisabled = useMemo(() => {
    if (!data?.starting_date) return false;

    const startingDate = new Date(data.starting_date);
    const prevMonth = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth() - 1,
      1
    );

    // Disable if prev month would be before the starting date's month
    return (
      prevMonth.getFullYear() < startingDate.getFullYear() ||
      (prevMonth.getFullYear() === startingDate.getFullYear() &&
        prevMonth.getMonth() < startingDate.getMonth())
    );
  }, [data?.starting_date, currentDate]);

  // Check if next button should be disabled based on ending_date
  const isNextDisabled = useMemo(() => {
    if (!data?.ending_date) return false;

    const endingDate = new Date(data.ending_date);
    const nextMonth = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth() + 1,
      1
    );

    // Disable if next month would be after the ending date's month
    return (
      nextMonth.getFullYear() > endingDate.getFullYear() ||
      (nextMonth.getFullYear() === endingDate.getFullYear() &&
        nextMonth.getMonth() > endingDate.getMonth())
    );
  }, [data?.ending_date, currentDate]);

  const thisYear = currentDate.getFullYear();
  const thisMonth = currentDate.toLocaleString(locale, { month: '2-digit' });

  // includes all days of the week, starting from monday to sunday
  const days = Array.from({ length: 7 }, (_, i) => {
    const newDay = new Date(currentDate);
    newDay.setDate(currentDate.getDate() - currentDate.getDay() + i + 1);
    return newDay.toLocaleString(locale, { weekday: 'narrow' });
  });

  // includes all days of the month, starting from monday (which could be from the previous month) to sunday (which could be from the next month)
  const daysInMonth = Array.from({ length: 42 }, (_, i) => {
    const newDay = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth(),
      1
    );
    const dayOfWeek = newDay.getDay();
    const adjustment = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // adjust for Monday start
    newDay.setDate(newDay.getDate() - adjustment + i);
    return newDay;
  });

  const isCurrentMonth = (date: Date) =>
    date.getMonth() === currentDate.getMonth() &&
    date.getFullYear() === currentDate.getFullYear();

  const isDateAvailable = (sessions: string[], currentDate: Date) =>
    sessions?.some((session) => {
      const sessionDate = new Date(session);
      return (
        sessionDate.getDate() === currentDate.getDate() &&
        sessionDate.getMonth() === currentDate.getMonth() &&
        sessionDate.getFullYear() === currentDate.getFullYear()
      );
    });

  return (
    <div className={cn('rounded-lg')}>
      <div>
        <div className="grid h-full gap-8">
          <div key={2024} className="flex h-full flex-col">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 font-bold text-xl md:text-2xl">
              <div className="flex items-center gap-1">
                {thisYear}
                <div className="mx-2 h-4 w-px rotate-30 bg-foreground/20" />
                <span className="font-semibold text-lg md:text-xl">
                  {thisMonth}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  size="xs"
                  variant="secondary"
                  onClick={handlePrev}
                  disabled={isPrevDisabled}
                >
                  <ChevronLeft className="h-6 w-6" />
                </Button>

                <Button
                  size="xs"
                  variant="secondary"
                  onClick={handleNext}
                  disabled={isNextDisabled}
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
                {daysInMonth.map((day, idx) => {
                  if (
                    isError ||
                    !isCurrentMonth(day) ||
                    isPending ||
                    !data?.sessions ||
                    !isDateAvailable(data.sessions, day)
                  )
                    return (
                      <div
                        key={`${groupId}-${currentDate.toDateString()}-day-${idx}`}
                        className="flex flex-none cursor-default justify-center rounded border border-transparent p-2 font-semibold text-foreground/20 transition duration-300 md:rounded-lg"
                      >
                        {day.getDate()}
                      </div>
                    );

                  return (
                    <div
                      key={`${groupId}-${currentDate.toDateString()}-day-${idx}`}
                      className={`flex flex-none cursor-default justify-center rounded border border-foreground/10 bg-foreground/10 p-2 font-semibold text-foreground transition duration-300 md:rounded-lg`}
                    >
                      {day.getDate()}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

async function getData(wsId: string, groupId: string) {
  const supabase = await createClient();

  const queryBuilder = supabase
    .from('workspace_user_groups')
    .select('sessions, starting_date, ending_date')
    .eq('id', groupId)
    .eq('ws_id', wsId);

  const { data, error } = await queryBuilder.single();

  if (error) throw error;
  return { data };
}
