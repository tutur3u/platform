'use client';

import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
} from '@tuturuuu/icons';
import type {
  CreateWorkspaceUserGroupSessionPayload,
  WorkspaceUserGroupScheduleGroup,
  WorkspaceUserGroupScheduleTag,
} from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import dayjs from 'dayjs';
import { useLocale, useTranslations } from 'next-intl';
import '@/lib/dayjs-setup';
import { SessionEditorDialog } from './session-editor-dialog';
import { getWeekStart } from './session-time-utils';

interface SessionCalendarToolbarProps {
  activeGroupId?: string | null;
  canChooseGroup: boolean;
  canUpdateSchedule: boolean;
  createPending: boolean;
  groupFilter: string;
  groups: WorkspaceUserGroupScheduleGroup[];
  onCreate: (payload: CreateWorkspaceUserGroupSessionPayload) => Promise<void>;
  onGroupFilterChange: (value: string) => void;
  onRefresh: () => void;
  onTagFilterChange: (value: string) => void;
  onTimezoneChange: (value: string) => void;
  onWeekStartChange: (value: Date) => void;
  tagFilter: string;
  tags: WorkspaceUserGroupScheduleTag[];
  timezone: string;
  title?: string;
  weekStart: Date;
  wsId: string;
}

export function SessionCalendarToolbar({
  activeGroupId,
  canChooseGroup,
  canUpdateSchedule,
  createPending,
  groupFilter,
  groups,
  onCreate,
  onGroupFilterChange,
  onRefresh,
  onTagFilterChange,
  onTimezoneChange,
  onWeekStartChange,
  tagFilter,
  tags,
  timezone,
  title,
  weekStart,
  wsId,
}: SessionCalendarToolbarProps) {
  const t = useTranslations('ws-user-group-schedule');
  const locale = useLocale();

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 font-semibold text-xl">
            <CalendarDays className="h-5 w-5" />
            {title ?? t('calendar_title')}
          </h1>
          <p className="text-muted-foreground text-sm">
            {t('calendar_subtitle')}
          </p>
        </div>
        {canUpdateSchedule && (
          <SessionEditorDialog
            canChooseGroup={canChooseGroup}
            defaultGroupId={activeGroupId ?? undefined}
            groups={groups}
            isPending={createPending}
            onSubmit={(payload) =>
              onCreate(payload as CreateWorkspaceUserGroupSessionPayload)
            }
            wsId={wsId}
          />
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/20 p-2">
        <Button
          aria-label={t('previous_week')}
          size="icon"
          variant="outline"
          onClick={() =>
            onWeekStartChange(dayjs(weekStart).subtract(1, 'week').toDate())
          }
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onWeekStartChange(getWeekStart(new Date()))}
        >
          {t('today')}
        </Button>
        <Button
          aria-label={t('next_week')}
          size="icon"
          variant="outline"
          onClick={() =>
            onWeekStartChange(dayjs(weekStart).add(1, 'week').toDate())
          }
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <div className="px-2 font-medium text-sm">
          {dayjs(weekStart).locale(locale).format('MMM D')} -{' '}
          {dayjs(weekStart).add(6, 'day').locale(locale).format('MMM D, YYYY')}
        </div>
        {canChooseGroup && (
          <Select value={groupFilter} onValueChange={onGroupFilterChange}>
            <SelectTrigger className="h-9 w-[220px]">
              <SelectValue placeholder={t('group')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('all_groups')}</SelectItem>
              {groups.map((group) => (
                <SelectItem key={group.id} value={group.id}>
                  {group.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select value={tagFilter} onValueChange={onTagFilterChange}>
          <SelectTrigger className="h-9 w-[180px]">
            <SelectValue placeholder={t('tags')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('all_tags')}</SelectItem>
            {tags.map((tag) => (
              <SelectItem key={tag.id} value={tag.id}>
                {tag.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          aria-label={t('timezone')}
          className="h-9 w-[220px]"
          value={timezone}
          onChange={(event) => onTimezoneChange(event.target.value)}
        />
        <Button
          aria-label={t('refresh_sessions')}
          size="icon"
          variant="outline"
          onClick={onRefresh}
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>
    </>
  );
}
