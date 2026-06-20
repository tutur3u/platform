'use client';

import { Edit, Files, Filter, Repeat, Tags } from '@tuturuuu/icons';
import type { WorkspaceUserGroupSession } from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { cn } from '@tuturuuu/utils/format';
import dayjs from 'dayjs';
import { useLocale, useTranslations } from 'next-intl';
import '@/lib/dayjs-setup';
import { DEFAULT_SCHEDULE_TIMEZONE } from './session-time-utils';
import type { GroupedSessionTimeblock } from './user-group-calendar-density';

interface GroupedSessionTimeblockDialogProps {
  canChooseGroup: boolean;
  onEditSession: (session: WorkspaceUserGroupSession) => void;
  onFilterGroup: (groupId: string) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  timeblock: GroupedSessionTimeblock | null;
}

function zonedDate(value: string, timezone: string) {
  if (!timezone || timezone === 'auto') return dayjs(value);
  return dayjs(value).tz(timezone);
}

function formatTimeblockRange(
  timeblock: GroupedSessionTimeblock,
  locale: string
) {
  const timezone = timeblock.timezone || DEFAULT_SCHEDULE_TIMEZONE;
  const start = zonedDate(timeblock.startAt, timezone).locale(locale);
  const end = zonedDate(timeblock.endAt, timezone).locale(locale);
  const endFormat = start.isSame(end, 'day') ? 'HH:mm' : 'ddd, MMM D, HH:mm';

  return `${start.format('ddd, MMM D, HH:mm')} - ${end.format(endFormat)} ${timezone}`;
}

function sessionName(
  session: WorkspaceUserGroupSession,
  untitledSession: string
) {
  return session.groupName || session.title || untitledSession;
}

export function GroupedSessionTimeblockDialog({
  canChooseGroup,
  onEditSession,
  onFilterGroup,
  onOpenChange,
  open,
  timeblock,
}: GroupedSessionTimeblockDialogProps) {
  const t = useTranslations('ws-user-group-schedule');
  const locale = useLocale();

  if (!timeblock) {
    return <Dialog open={open} onOpenChange={onOpenChange} />;
  }

  const range = formatTimeblockRange(timeblock, locale);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] max-w-3xl overflow-hidden">
        <DialogHeader>
          <DialogTitle>
            {t('grouped_timeblock_dialog_title', {
              count: timeblock.sessions.length,
            })}
          </DialogTitle>
          <DialogDescription>{range}</DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60dvh] pr-3">
          <div className="space-y-2">
            {timeblock.sessions.map((session) => {
              const visibleTags = session.tags.slice(0, 3);
              const hiddenTagCount = session.tags.length - visibleTags.length;

              return (
                <div
                  className="rounded-md border bg-muted/20 p-3"
                  key={session.id}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 space-y-2">
                      <div>
                        <div className="truncate font-medium text-sm">
                          {sessionName(session, t('untitled_session'))}
                        </div>
                        {session.title &&
                          session.title !== session.groupName && (
                            <div className="truncate text-muted-foreground text-xs">
                              {session.title}
                            </div>
                          )}
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 text-muted-foreground text-xs">
                        {session.seriesId && (
                          <Badge
                            className="gap-1 rounded-sm px-1.5 py-0 text-xs"
                            variant="secondary"
                          >
                            <Repeat className="h-3 w-3" />
                            {t('recurring_badge')}
                          </Badge>
                        )}
                        {session.files.length > 0 && (
                          <Badge
                            className="gap-1 rounded-sm px-1.5 py-0 text-xs"
                            variant="secondary"
                          >
                            <Files className="h-3 w-3" />
                            {t('files_attached_count', {
                              count: session.files.length,
                            })}
                          </Badge>
                        )}
                        {visibleTags.map((tag) => (
                          <Badge
                            className="gap-1 rounded-sm px-1.5 py-0 text-xs"
                            key={tag.id}
                            variant="outline"
                          >
                            <Tags className="h-3 w-3" />
                            {tag.name}
                          </Badge>
                        ))}
                        {hiddenTagCount > 0 && (
                          <span>
                            {t('tag_count', { count: hiddenTagCount })}
                          </span>
                        )}
                      </div>
                    </div>

                    <div
                      className={cn(
                        'flex shrink-0 items-center gap-2',
                        canChooseGroup && 'sm:justify-end'
                      )}
                    >
                      {canChooseGroup && (
                        <Button
                          size="sm"
                          type="button"
                          variant="outline"
                          onClick={() => onFilterGroup(session.groupId)}
                        >
                          <Filter className="h-4 w-4" />
                          {t('filter_group')}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        type="button"
                        variant="outline"
                        onClick={() => onEditSession(session)}
                      >
                        <Edit className="h-4 w-4" />
                        {t('edit_session')}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
