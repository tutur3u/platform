'use client';

import { CalendarIcon, CalendarX2, Clock } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent } from '@tuturuuu/ui/card';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { formatSessionTimeRange } from './attendance-utils';
import type { AttendanceSession } from './types';

type AttendanceSessionCardProps = {
  activeSessionId?: string | null;
  currentDateSessions: AttendanceSession[];
  groupId: string;
  onSessionChange: (value: string) => void;
  wsId: string;
};

export function AttendanceSessionCard({
  activeSessionId,
  currentDateSessions,
  groupId,
  onSessionChange,
  wsId,
}: AttendanceSessionCardProps) {
  const locale = useLocale();
  const tAtt = useTranslations('ws-user-group-attendance');
  const tDetails = useTranslations('ws-user-group-details');

  return (
    <Card>
      <CardContent className="space-y-3 py-4">
        {currentDateSessions.length > 0 ? (
          <>
            <div className="font-semibold text-sm">
              {tAtt('select_session')}
            </div>
            <div className="flex flex-wrap gap-2">
              {currentDateSessions.map((session) => (
                <Button
                  className="h-auto justify-start gap-2 py-2"
                  key={session.id}
                  onClick={() => onSessionChange(session.id)}
                  size="sm"
                  type="button"
                  variant={
                    activeSessionId === session.id ? 'default' : 'outline'
                  }
                >
                  <Clock className="h-4 w-4" />
                  <span className="flex flex-col items-start">
                    <span>
                      {formatSessionTimeRange(session, locale)}
                      {session.startTimezone && (
                        <span className="text-muted-foreground">
                          {' '}
                          {session.startTimezone}
                        </span>
                      )}
                    </span>
                    <span className="text-xs opacity-80">
                      {session.title || session.groupName}
                      {session.tags.length > 0 &&
                        ` / ${session.tags.map((tag) => tag.name).join(', ')}`}
                    </span>
                  </span>
                </Button>
              ))}
            </div>
          </>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 text-muted-foreground text-sm">
              <CalendarX2 className="h-5 w-5" />
              <span>{tAtt('legacy_date_only_mode')}</span>
            </div>
            <Link href={`/${locale}/${wsId}/users/groups/${groupId}/schedule`}>
              <Button size="sm" variant="secondary">
                <CalendarIcon className="h-4 w-4" />
                {tDetails('modify_schedule')}
              </Button>
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
