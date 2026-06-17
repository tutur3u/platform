'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  CalendarDays,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import useSearchParams from '@tuturuuu/ui/hooks/useSearchParams';
import { format, parse } from 'date-fns';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { GroupSectionCard } from './_components/group-section-card';

interface GroupScheduleData {
  sessions: string[] | null;
  starting_date: string | null;
  ending_date: string | null;
}

export default function GroupSchedule({
  wsId,
  groupId,
  canUpdateUserGroups = false,
  initialSchedule,
}: {
  wsId: string;
  groupId: string;
  canUpdateUserGroups?: boolean;
  initialSchedule?: GroupScheduleData | null;
}) {
  const locale = useLocale();
  const t = useTranslations();
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

  const { isError, data: queryData } = useQuery<{
    data: GroupScheduleData;
  }>({
    queryKey: ['workspaces', wsId, 'users', 'groups', groupId, 'schedule'],
    queryFn: () => getData(wsId, groupId),
    placeholderData: keepPreviousData,
    initialData: initialSchedule ? { data: initialSchedule } : undefined,
    staleTime: 5 * 60 * 1000,
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

    return (
      nextMonth.getFullYear() > endingDate.getFullYear() ||
      (nextMonth.getFullYear() === endingDate.getFullYear() &&
        nextMonth.getMonth() > endingDate.getMonth())
    );
  }, [data?.ending_date, currentDate]);

  const thisYear = currentDate.getFullYear();
  const thisMonth = currentDate.toLocaleString(locale, { month: '2-digit' });

  // all days of the week, starting from monday to sunday
  const days = Array.from({ length: 7 }, (_, i) => {
    const newDay = new Date(currentDate);
    newDay.setDate(currentDate.getDate() - currentDate.getDay() + i + 1);
    return newDay.toLocaleString(locale, { weekday: 'narrow' });
  });

  // all days of the month (with leading/trailing days), monday-first
  const daysInMonth = Array.from({ length: 42 }, (_, i) => {
    const newDay = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth(),
      1
    );
    const dayOfWeek = newDay.getDay();
    const adjustment = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // monday start
    newDay.setDate(newDay.getDate() - adjustment + i);
    return newDay;
  });

  const isCurrentMonth = (date: Date) =>
    date.getMonth() === currentDate.getMonth() &&
    date.getFullYear() === currentDate.getFullYear();

  const isDateAvailable = (sessions: string[], date: Date) =>
    sessions?.some((session) => {
      const sessionDate = new Date(session);
      return (
        sessionDate.getDate() === date.getDate() &&
        sessionDate.getMonth() === date.getMonth() &&
        sessionDate.getFullYear() === date.getFullYear()
      );
    });

  return (
    <GroupSectionCard
      accent="blue"
      icon={<CalendarDays className="h-5 w-5" />}
      title={t('ws-user-group-details.schedule')}
      description={`${thisYear} / ${thisMonth}`}
      action={
        canUpdateUserGroups ? (
          <Button asChild variant="default" size="sm">
            <Link href={`/${wsId}/users/groups/${groupId}/schedule`}>
              <CalendarPlus className="h-4 w-4" />
              {t('ws-user-group-details.modify_schedule')}
            </Link>
          </Button>
        ) : undefined
      }
    >
      <div className="mb-3 flex items-center justify-end gap-1">
        <Button
          size="xs"
          variant="secondary"
          onClick={handlePrev}
          disabled={isPrevDisabled}
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <Button
          size="xs"
          variant="secondary"
          onClick={handleNext}
          disabled={isNextDisabled}
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      <div className="relative grid gap-1.5 text-xs md:text-sm">
        <div className="grid grid-cols-7 gap-1.5">
          {days.map((day, idx) => (
            <div
              key={`day-${idx}`}
              className="flex flex-none cursor-default justify-center rounded-md bg-foreground/5 p-2 font-semibold text-muted-foreground"
            >
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1.5">
          {daysInMonth.map((day, idx) => {
            const available =
              !isError &&
              isCurrentMonth(day) &&
              !!data?.sessions &&
              isDateAvailable(data.sessions, day);

            return (
              <div
                key={`${groupId}-${currentDate.toDateString()}-day-${idx}`}
                className={
                  available
                    ? 'flex aspect-square flex-none items-center justify-center rounded-md border border-dynamic-blue/30 bg-dynamic-blue/10 p-2 font-semibold text-dynamic-blue'
                    : 'flex aspect-square flex-none items-center justify-center rounded-md border border-transparent p-2 font-medium text-foreground/25'
                }
              >
                {day.getDate()}
              </div>
            );
          })}
        </div>
      </div>
    </GroupSectionCard>
  );
}

async function getData(wsId: string, groupId: string) {
  const response = await fetch(
    `/api/v1/workspaces/${wsId}/user-groups/${groupId}`,
    { cache: 'no-store' }
  );

  if (!response.ok) {
    throw new Error('Failed to fetch group schedule');
  }

  return (await response.json()) as {
    data: GroupScheduleData;
  };
}
