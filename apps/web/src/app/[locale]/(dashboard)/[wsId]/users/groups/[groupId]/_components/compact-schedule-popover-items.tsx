'use client';

import {
  CalendarPlus,
  Clock,
  File,
  MoveRight,
  Pencil,
  Repeat,
  Tags,
} from '@tuturuuu/icons';
import type {
  WorkspaceUserGroupMissingSessionOccurrence,
  WorkspaceUserGroupSession,
} from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { compactSessionFullTimeLabel } from './compact-schedule-utils';

type SessionBadge = {
  icon: ReactNode;
  label: string;
};

function isSessionBadge(value: SessionBadge | null): value is SessionBadge {
  return value !== null;
}

export function compactSessionTitle(
  session:
    | WorkspaceUserGroupSession
    | WorkspaceUserGroupMissingSessionOccurrence,
  fallback: string
) {
  return session.title || session.groupName || fallback;
}

function SessionBadges({ session }: { session: WorkspaceUserGroupSession }) {
  const t = useTranslations('ws-user-group-schedule');
  const rawBadges: (SessionBadge | null)[] = [
    session.seriesId
      ? {
          icon: <Repeat className="h-3 w-3" />,
          label: t('recurring_badge'),
        }
      : null,
    session.tags.length
      ? {
          icon: <Tags className="h-3 w-3" />,
          label: t('tag_count', { count: session.tags.length }),
        }
      : null,
    session.files.length
      ? {
          icon: <File className="h-3 w-3" />,
          label: t('files_attached_count', { count: session.files.length }),
        }
      : null,
  ];
  const badges = rawBadges.filter(isSessionBadge);

  if (badges.length === 0) return null;

  return (
    <div className="flex shrink-0 items-center gap-1">
      {badges.map((badge) => (
        <Badge
          key={badge.label}
          variant="outline"
          className="h-5 gap-1 px-1.5 text-[10px]"
          title={badge.label}
        >
          {badge.icon}
          {badge.label}
        </Badge>
      ))}
    </div>
  );
}

export function CompactScheduleSessionItem({
  canUpdate,
  onEditSession,
  onMoveSession,
  session,
}: {
  canUpdate: boolean;
  onEditSession: (session: WorkspaceUserGroupSession) => void;
  onMoveSession: (session: WorkspaceUserGroupSession) => void;
  session: WorkspaceUserGroupSession;
}) {
  const t = useTranslations('ws-user-group-schedule');

  return (
    <div className="flex items-center gap-2 rounded-md border bg-background px-2 py-1.5">
      <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <div className="min-w-0 flex-1 truncate font-medium text-xs">
            {compactSessionTitle(session, t('untitled_session'))}
          </div>
          <SessionBadges session={session} />
        </div>
        <div className="truncate text-[11px] text-muted-foreground">
          {compactSessionFullTimeLabel(session)}
        </div>
      </div>
      {canUpdate ? (
        <div className="flex shrink-0 gap-1">
          <Button
            aria-label={t('edit_session')}
            className="h-7 w-7 px-0"
            size="xs"
            title={t('edit_session')}
            variant="outline"
            onClick={() => onEditSession(session)}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            aria-label={t('move_session')}
            className="h-7 w-7 px-0"
            size="xs"
            title={t('move_session')}
            variant="ghost"
            onClick={() => onMoveSession(session)}
          >
            <MoveRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function CompactScheduleMissingItem({
  canUpdate,
  occurrence,
  onRepairMissing,
}: {
  canUpdate: boolean;
  occurrence: WorkspaceUserGroupMissingSessionOccurrence;
  onRepairMissing: (
    occurrence: WorkspaceUserGroupMissingSessionOccurrence
  ) => void;
}) {
  const t = useTranslations('ws-user-group-schedule');

  return (
    <div className="flex items-center gap-2 rounded-md border border-dynamic-red/30 bg-dynamic-red/5 px-2 py-1.5">
      <Repeat className="h-3.5 w-3.5 shrink-0 text-dynamic-red" />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <div className="min-w-0 flex-1 truncate font-medium text-xs">
            {compactSessionTitle(occurrence, t('missing_session'))}
          </div>
          <Badge
            variant="outline"
            className="h-5 shrink-0 border-dynamic-red/30 px-1.5 text-[10px] text-dynamic-red"
          >
            {t('missing_short')}
          </Badge>
        </div>
        <div className="truncate text-[11px] text-muted-foreground">
          {compactSessionFullTimeLabel(occurrence)}
        </div>
      </div>
      {canUpdate ? (
        <Button
          aria-label={t('add_missing_session')}
          className="h-7 w-7 shrink-0 px-0"
          size="xs"
          title={t('add_missing_session')}
          variant="outline"
          onClick={() => onRepairMissing(occurrence)}
        >
          <CalendarPlus className="h-3.5 w-3.5" />
        </Button>
      ) : null}
    </div>
  );
}
