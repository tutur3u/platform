'use client';

import { useQuery } from '@tanstack/react-query';
import { ClipboardList } from '@tuturuuu/icons';
import { getMeetAttendance } from '@tuturuuu/internal-api/meet-call';
import { Button } from '@tuturuuu/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useMeetingTimeZone } from './meeting-local-time';

export function AttendancePanel({ meetingId }: { meetingId: string }) {
  const t = useTranslations('meet.call');
  const format = useFormatter();
  const timeZone = useMeetingTimeZone();
  const [open, setOpen] = useState(false);
  const query = useQuery({
    queryKey: ['meet-attendance', meetingId],
    queryFn: () => getMeetAttendance(meetingId),
    enabled: open,
    refetchInterval: open ? 15_000 : false,
  });
  const rows = query.data?.rows ?? [];
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          aria-label={t('attendance')}
          className="h-9 max-w-full shrink px-2"
          size="sm"
          type="button"
          variant="ghost"
        >
          <ClipboardList className="size-4" aria-hidden="true" />
          <span className="truncate">{t('attendance')}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[min(22rem,calc(100vw-2rem))] space-y-3 text-sm"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-medium">{t('attendance')}</h2>
          <Button asChild size="sm" variant="outline">
            <a
              href={`/api/meet-call/${meetingId}/attendance?format=csv`}
              download
            >
              {t('attendance_download')}
            </a>
          </Button>
        </div>
        {query.isError ? (
          <p className="text-muted-foreground" role="alert">
            {t('attendance_unavailable')}
          </p>
        ) : query.isLoading ? (
          <p className="text-muted-foreground">{t('connecting')}</p>
        ) : rows.length === 0 ? (
          <p className="text-muted-foreground">{t('attendance_empty')}</p>
        ) : (
          <ul className="max-h-80 space-y-2 overflow-y-auto">
            {rows.map((row) => (
              <li
                className="grid grid-cols-1 gap-1 border-b border-border pb-2 sm:grid-cols-[minmax(0,1fr)_auto]"
                key={`${row.kind}:${row.userId ?? row.guestId}`}
              >
                <span className="truncate font-medium">
                  <span className="sr-only">{t('attendance_name')}: </span>
                  {row.name}
                </span>
                <span className="text-muted-foreground">
                  {t('attendance_role')}:{' '}
                  {row.kind === 'guest'
                    ? t('attendance_guest')
                    : t('attendance_member')}
                  {' · '}
                  {t('attendance_minutes')}: {row.totalMinutes}
                </span>
                <span className="text-muted-foreground sm:col-span-2">
                  {t('attendance_first_join')}{' '}
                  {timeZone
                    ? format.dateTime(new Date(row.firstJoin), {
                        timeZone,
                        hour: 'numeric',
                        minute: '2-digit',
                      })
                    : row.firstJoin}
                </span>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
