'use client';

import {
  CalendarIcon,
  CalendarX2,
  Clock,
  Info,
  RefreshCw,
} from '@tuturuuu/icons';
import type { WorkspaceUserGroupSession } from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent } from '@tuturuuu/ui/card';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

interface AttendanceSummary {
  absent: number;
  late: number;
  notAttended: number;
  present: number;
  total: number;
}

interface Props {
  activeSessionId: string | null;
  groupId: string;
  isSessionsError: boolean;
  locale: string;
  onRetrySessions: () => void;
  onSelectSession: (sessionId: string) => void;
  selectedSession: WorkspaceUserGroupSession | null;
  sessions: WorkspaceUserGroupSession[];
  summary: AttendanceSummary;
  wsId: string;
}

function formatSessionTimeRange(
  session: WorkspaceUserGroupSession,
  locale: string
) {
  const start = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: session.startTimezone || 'Asia/Ho_Chi_Minh',
  });
  const end = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    timeZone:
      session.endTimezone || session.startTimezone || 'Asia/Ho_Chi_Minh',
  });
  return `${start.format(new Date(session.startsAt))} - ${end.format(new Date(session.endsAt))}`;
}

export function GroupAttendanceOverview({
  activeSessionId,
  groupId,
  isSessionsError,
  locale,
  onRetrySessions,
  onSelectSession,
  selectedSession,
  sessions,
  summary,
  wsId,
}: Props) {
  const tAtt = useTranslations('ws-user-group-attendance');
  const tDetails = useTranslations('ws-user-group-details');
  const summaryItems = [
    {
      container: 'border-foreground/10 bg-foreground/5',
      key: 'summary_total',
      label: 'text-foreground/60',
      value: summary.total,
      valueClass: '',
    },
    {
      container: 'border-dynamic-green/20 bg-dynamic-green/10',
      key: 'summary_present',
      label: 'text-dynamic-green',
      value: summary.present,
      valueClass: 'text-dynamic-green',
    },
    {
      container: 'border-dynamic-red/20 bg-dynamic-red/10',
      key: 'summary_absent',
      label: 'text-dynamic-red',
      value: summary.absent,
      valueClass: 'text-dynamic-red',
    },
    {
      container: 'border-dynamic-yellow/20 bg-dynamic-yellow/10',
      key: 'summary_late',
      label: 'text-dynamic-yellow',
      value: summary.late,
      valueClass: 'text-dynamic-yellow',
    },
    {
      container: 'border-foreground/15 bg-foreground/5',
      key: 'summary_not_marked',
      label: 'text-foreground/60',
      value: summary.notAttended,
      valueClass: 'text-foreground/70',
    },
  ] as const;

  return (
    <>
      <Card>
        <CardContent className="space-y-3 py-4">
          {isSessionsError ? (
            <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
              <p className="text-muted-foreground text-sm">
                {tAtt('sessions_load_error')}
              </p>
              <Button size="sm" variant="outline" onClick={onRetrySessions}>
                <RefreshCw className="h-4 w-4" />
                {tAtt('retry')}
              </Button>
            </div>
          ) : sessions.length > 0 ? (
            <>
              <div className="font-semibold text-sm">
                {tAtt('select_session')}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {sessions.map((session) => (
                  <Button
                    key={session.id}
                    type="button"
                    size="sm"
                    variant={
                      activeSessionId === session.id ? 'default' : 'outline'
                    }
                    className="h-auto min-w-0 justify-start gap-2 py-2 text-left"
                    onClick={() => onSelectSession(session.id)}
                  >
                    <Clock className="h-4 w-4" />
                    <span className="flex min-w-0 flex-col items-start">
                      <span className="max-w-full break-words">
                        {formatSessionTimeRange(session, locale)}
                        {session.startTimezone && (
                          <span className="text-muted-foreground">
                            {' '}
                            {session.startTimezone}
                          </span>
                        )}
                      </span>
                      <span className="max-w-full break-words text-xs opacity-80">
                        {session.title || session.groupName}
                        {session.tags.length > 0 &&
                          ` / ${session.tags.map((tag) => tag.name).join(', ')}`}
                      </span>
                      {session.status === 'cancelled' && (
                        <Badge variant="secondary">
                          {tAtt('cancelled_session')}
                        </Badge>
                      )}
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
              <Link href={`/${wsId}/users/groups/${groupId}/schedule`}>
                <Button size="sm" variant="secondary">
                  <CalendarIcon className="h-4 w-4" />
                  {tDetails('modify_schedule')}
                </Button>
              </Link>
            </div>
          )}
          {selectedSession?.status === 'cancelled' && (
            <div className="rounded-lg border border-foreground/15 bg-foreground/5 p-3 text-muted-foreground text-sm">
              {tAtt('cancelled_session_read_only')}
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardContent className="py-4">
          <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-3 lg:grid-cols-5 lg:gap-3">
            {summaryItems.map((item) => (
              <div
                key={item.key}
                className={`rounded-lg border-2 p-3 ${item.container}`}
              >
                <div className={`font-medium text-sm ${item.label}`}>
                  {tAtt(item.key)}
                </div>
                <div className={`font-bold text-2xl ${item.valueClass}`}>
                  {item.value}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      <Card className="border-2 border-dynamic-blue/20 bg-dynamic-blue/5">
        <CardContent className="flex gap-3 py-4">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-dynamic-blue" />
          <div className="space-y-1">
            <div className="font-semibold text-dynamic-blue text-sm">
              {tAtt('help_title')}
            </div>
            <div className="text-foreground/70 text-sm leading-relaxed">
              {tAtt('help_description')}
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
