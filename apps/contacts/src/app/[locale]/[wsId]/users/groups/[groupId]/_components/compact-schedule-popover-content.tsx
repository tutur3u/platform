'use client';

import { CalendarPlus, ExternalLink, MoveRight } from '@tuturuuu/icons';
import type {
  WorkspaceUserGroupMissingSessionOccurrence,
  WorkspaceUserGroupSession,
} from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { Separator } from '@tuturuuu/ui/separator';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  CompactScheduleMissingItem,
  CompactScheduleSessionItem,
  compactSessionTitle,
} from './compact-schedule-popover-items';
import type { CompactScheduleDayBucket } from './compact-schedule-utils';

export function CompactSchedulePopoverContent({
  bucket,
  canUpdate,
  dateLabel,
  fullScheduleHref,
  moveSource,
  onAddSession,
  onEditSession,
  onMoveHere,
  onMoveSession,
  onRepairMissing,
}: {
  bucket?: CompactScheduleDayBucket;
  canUpdate: boolean;
  dateLabel: string;
  fullScheduleHref: string;
  moveSource: WorkspaceUserGroupSession | null;
  onAddSession: () => void;
  onEditSession: (session: WorkspaceUserGroupSession) => void;
  onMoveHere: () => void;
  onMoveSession: (session: WorkspaceUserGroupSession) => void;
  onRepairMissing: (
    occurrence: WorkspaceUserGroupMissingSessionOccurrence
  ) => void;
}) {
  const t = useTranslations('ws-user-group-schedule');
  const sessions = bucket?.sessions ?? [];
  const missing = bucket?.missing ?? [];

  return (
    <div className="overflow-hidden rounded-md">
      <div className="flex items-center justify-between gap-2 border-b px-2.5 py-2">
        <div className="min-w-0">
          <div className="truncate font-semibold text-sm">{dateLabel}</div>
          <div className="text-[11px] text-muted-foreground">
            {t('day_timeblock_count', {
              count: sessions.length + missing.length,
            })}
          </div>
        </div>
        <Button
          asChild
          aria-label={t('open_full_schedule')}
          className="h-7 w-7 px-0"
          size="xs"
          title={t('open_full_schedule')}
          variant="ghost"
        >
          <Link href={fullScheduleHref}>
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>

      {moveSource && canUpdate ? (
        <div className="mx-2 mt-2 flex items-center gap-2 rounded-md border border-dynamic-blue/30 bg-dynamic-blue/5 px-2 py-1.5">
          <div className="min-w-0 flex-1 truncate text-xs">
            {t('move_mode_source', {
              title: compactSessionTitle(moveSource, t('untitled_session')),
            })}
          </div>
          <Button
            className="h-7 shrink-0 px-2 text-xs"
            size="xs"
            onClick={onMoveHere}
          >
            <MoveRight className="h-3.5 w-3.5" />
            {t('move_here')}
          </Button>
        </div>
      ) : null}

      <div className="max-h-64 space-y-1.5 overflow-y-auto p-2">
        {sessions.map((session) => (
          <CompactScheduleSessionItem
            key={session.id}
            canUpdate={canUpdate}
            onEditSession={onEditSession}
            onMoveSession={onMoveSession}
            session={session}
          />
        ))}

        {sessions.length > 0 && missing.length > 0 ? <Separator /> : null}

        {missing.map((occurrence) => (
          <CompactScheduleMissingItem
            key={`${occurrence.seriesId}-${occurrence.date}`}
            canUpdate={canUpdate}
            occurrence={occurrence}
            onRepairMissing={onRepairMissing}
          />
        ))}

        {sessions.length === 0 && missing.length === 0 ? (
          <div className="rounded-md border border-dashed px-3 py-2 text-center text-muted-foreground text-xs">
            {t('no_sessions_on_date')}
          </div>
        ) : null}
      </div>

      {canUpdate ? (
        <div className="border-t p-2">
          <Button
            className="h-8 w-full"
            size="xs"
            variant="secondary"
            onClick={onAddSession}
          >
            <CalendarPlus className="h-3.5 w-3.5" />
            {t('add_session_on_date')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
