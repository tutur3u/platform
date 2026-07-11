'use client';

import { Minus, Plus } from '@tuturuuu/icons';
import type { WorkspaceUserGroupSession } from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@tuturuuu/ui/hover-card';
import dayjs from 'dayjs';
import { useLocale, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import '@tuturuuu/users-core/lib/dayjs-setup';
import { formatSessionTime } from './session-time-utils';

type Slot = {
  hour: number;
  minute: number;
  value: string;
};

interface SessionCalendarGridProps {
  canUpdateSchedule: boolean;
  days: Date[];
  onDrop: (date: string, time: string, sessionId: string) => void;
  onEdit: (session: WorkspaceUserGroupSession) => void;
  onResize: (session: WorkspaceUserGroupSession, minutes: number) => void;
  sessionsBySlot: Map<string, WorkspaceUserGroupSession[]>;
  slots: Slot[];
  timezone: string;
}

function getSessionTitle(session: WorkspaceUserGroupSession, fallback: string) {
  return session.title || session.groupName || fallback;
}

function SessionCard({
  canUpdate,
  onEdit,
  onResize,
  session,
}: {
  canUpdate: boolean;
  onEdit: (session: WorkspaceUserGroupSession) => void;
  onResize: (session: WorkspaceUserGroupSession, minutes: number) => void;
  session: WorkspaceUserGroupSession;
}) {
  const t = useTranslations('ws-user-group-schedule');
  const title = getSessionTitle(session, t('untitled_session'));

  return (
    <div
      className="group rounded-md border border-l-4 border-l-primary bg-background p-2 text-left shadow-sm transition hover:border-primary"
      data-testid={`session-card-${session.id}`}
      draggable={canUpdate}
      onClick={() => {
        if (canUpdate) onEdit(session);
      }}
      onDragStart={(event) => {
        event.dataTransfer.setData('text/plain', session.id);
        event.dataTransfer.effectAllowed = 'move';
      }}
      onKeyDown={(event) => {
        if (canUpdate && (event.key === 'Enter' || event.key === ' ')) {
          onEdit(session);
        }
      }}
      role={canUpdate ? 'button' : undefined}
      tabIndex={canUpdate ? 0 : undefined}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium text-xs">{title}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {formatSessionTime(session)}
          </p>
        </div>
        {session.seriesId && (
          <Badge variant="secondary" className="shrink-0 text-[10px]">
            {t('recurring_badge')}
          </Badge>
        )}
      </div>
      {session.tags.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {session.tags.slice(0, 2).map((tag) => (
            <Badge key={tag.id} variant="outline" className="text-[10px]">
              {tag.name}
            </Badge>
          ))}
        </div>
      )}
      {canUpdate && (
        <div className="mt-2 flex justify-end gap-1 opacity-100 md:opacity-0 md:transition md:group-hover:opacity-100 md:group-focus-within:opacity-100">
          <Button
            aria-label={t('shorten_session')}
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            onClick={(event) => {
              event.stopPropagation();
              onResize(session, -15);
            }}
          >
            <Minus className="h-3 w-3" />
          </Button>
          <Button
            aria-label={t('extend_session')}
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            onClick={(event) => {
              event.stopPropagation();
              onResize(session, 15);
            }}
          >
            <Plus className="h-3 w-3" />
          </Button>
        </div>
      )}
    </div>
  );
}

function CollisionCluster({
  children,
  count,
}: {
  children: ReactNode;
  count: number;
}) {
  const t = useTranslations('ws-user-group-schedule');

  return (
    <HoverCard openDelay={120}>
      <HoverCardTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 w-full">
          {t('more_sessions', { count })}
        </Button>
      </HoverCardTrigger>
      <HoverCardContent className="w-80 space-y-2" side="right">
        {children}
      </HoverCardContent>
    </HoverCard>
  );
}

export function SessionCalendarGrid({
  canUpdateSchedule,
  days,
  onDrop,
  onEdit,
  onResize,
  sessionsBySlot,
  slots,
  timezone,
}: SessionCalendarGridProps) {
  const locale = useLocale();

  const renderCellSessions = (cellSessions: WorkspaceUserGroupSession[]) => {
    const collapsed = cellSessions.length >= 3;
    const visible = collapsed ? cellSessions.slice(0, 2) : cellSessions;

    return (
      <div className="space-y-1">
        {visible.map((session) => (
          <SessionCard
            key={session.id}
            canUpdate={canUpdateSchedule}
            onEdit={onEdit}
            onResize={onResize}
            session={session}
          />
        ))}
        {collapsed && (
          <CollisionCluster count={cellSessions.length - 2}>
            {cellSessions.map((session) => (
              <SessionCard
                key={session.id}
                canUpdate={canUpdateSchedule}
                onEdit={onEdit}
                onResize={onResize}
                session={session}
              />
            ))}
          </CollisionCluster>
        )}
      </div>
    );
  };

  return (
    <div className="overflow-x-auto rounded-md border">
      <div className="grid min-w-[980px] grid-cols-[72px_repeat(7,minmax(120px,1fr))]">
        <div className="border-b bg-muted/40 p-2 text-muted-foreground text-xs">
          {timezone}
        </div>
        {days.map((day) => (
          <div key={day.toISOString()} className="border-b bg-muted/40 p-2">
            <p className="font-medium text-sm">
              {dayjs(day).locale(locale).format('ddd')}
            </p>
            <p className="text-muted-foreground text-xs">
              {dayjs(day).format('MMM D')}
            </p>
          </div>
        ))}

        {slots.map((slot) => (
          <div key={slot.value} className="contents">
            <div className="border-r border-b bg-muted/20 p-2 text-muted-foreground text-xs">
              {slot.value}
            </div>
            {days.map((day) => {
              const date = dayjs(day).format('YYYY-MM-DD');
              const key = `${date}T${slot.value}`;
              const cellSessions = sessionsBySlot.get(key) ?? [];
              const hasConflict = cellSessions.length > 1;

              return (
                <div
                  key={`${date}-${slot.value}`}
                  className={`min-h-[76px] border-r border-b p-1 ${
                    hasConflict ? 'bg-destructive/5' : 'bg-background'
                  }`}
                  data-testid={`session-slot-${date}-${slot.value}`}
                  onDragOver={(event) => {
                    if (canUpdateSchedule) event.preventDefault();
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    onDrop(
                      date,
                      slot.value,
                      event.dataTransfer.getData('text/plain')
                    );
                  }}
                >
                  {renderCellSessions(cellSessions)}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
