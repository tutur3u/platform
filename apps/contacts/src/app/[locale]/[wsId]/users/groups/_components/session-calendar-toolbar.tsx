'use client';

import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Globe,
  Maximize2,
  Minimize2,
  RefreshCw,
  Tags,
  Users,
} from '@tuturuuu/icons';
import type {
  CreateWorkspaceUserGroupSessionPayload,
  WorkspaceUserGroupScheduleGroup,
  WorkspaceUserGroupScheduleTag,
} from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { cn } from '@tuturuuu/utils/format';
import dayjs from 'dayjs';
import { useLocale, useTranslations } from 'next-intl';
import '@tuturuuu/users-core/lib/dayjs-setup';
import { QuickWeeklyScheduleDialog } from './quick-weekly-schedule-dialog';
import { SessionEditorDialog } from './session-editor-dialog';
import { getWeekStart } from './session-time-utils';
import { SessionTimezoneCombobox } from './session-timezone-combobox';

interface SessionCalendarToolbarProps {
  activeGroupId?: string | null;
  canChooseGroup: boolean;
  canUpdateSchedule: boolean;
  createPending: boolean;
  densityStats?: {
    groupedTimeblockCount: number;
    sessionCount: number;
  };
  groupFilter: string;
  groups: WorkspaceUserGroupScheduleGroup[];
  onCreate: (payload: CreateWorkspaceUserGroupSessionPayload) => Promise<void>;
  onGroupFilterChange: (value: string) => void;
  onRefresh: () => void;
  onTagFilterChange: (value: string) => void;
  onToggleFullscreen: () => void;
  onTimezoneChange: (value: string) => void;
  onWeekStartChange: (value: Date) => void;
  tagFilter: string;
  tags: WorkspaceUserGroupScheduleTag[];
  timezone: string;
  fullscreen: boolean;
  title?: string;
  weekStart: Date;
  wsId: string;
}

export function SessionCalendarToolbar({
  activeGroupId,
  canChooseGroup,
  canUpdateSchedule,
  createPending,
  densityStats,
  groupFilter,
  groups,
  onCreate,
  onGroupFilterChange,
  onRefresh,
  onTagFilterChange,
  onToggleFullscreen,
  onTimezoneChange,
  onWeekStartChange,
  tagFilter,
  tags,
  timezone,
  fullscreen,
  title,
  weekStart,
  wsId,
}: SessionCalendarToolbarProps) {
  const t = useTranslations('ws-user-group-schedule');
  const locale = useLocale();
  const scheduleActions = canUpdateSchedule ? (
    <div className="flex flex-wrap items-center gap-2">
      <QuickWeeklyScheduleDialog
        canChooseGroup={canChooseGroup}
        defaultGroupId={activeGroupId ?? undefined}
        groups={groups}
        isPending={createPending}
        onSubmit={(payload) =>
          onCreate(payload as CreateWorkspaceUserGroupSessionPayload)
        }
      />
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
    </div>
  ) : null;

  const controls = (
    <div
      className={cn(
        'flex flex-wrap items-center gap-2 rounded-md border bg-muted/20 p-2',
        fullscreen && 'gap-1.5'
      )}
    >
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
        <CalendarDays className="h-4 w-4" />
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
      {densityStats && densityStats.groupedTimeblockCount > 0 && (
        <div className="flex min-h-9 items-center rounded-md border bg-background px-2 text-muted-foreground text-xs">
          {t('calendar_density_summary', {
            sessionCount: densityStats.sessionCount,
            timeblockCount: densityStats.groupedTimeblockCount,
          })}
        </div>
      )}
      {canChooseGroup && (
        <Select value={groupFilter} onValueChange={onGroupFilterChange}>
          <SelectTrigger className="h-9 w-[220px]">
            <Users className="h-4 w-4 text-muted-foreground" />
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
          <Tags className="h-4 w-4 text-muted-foreground" />
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
      <SessionTimezoneCombobox
        ariaLabel={t('timezone')}
        className="h-9 w-[260px]"
        emptyLabel={t('no_timezones_found')}
        leadingIcon={<Globe className="h-4 w-4" />}
        placeholder={t('select_timezone')}
        searchPlaceholder={t('search_timezone')}
        value={timezone}
        onValueChange={onTimezoneChange}
      />
      <Button
        aria-label={t('refresh_sessions')}
        size="icon"
        variant="outline"
        onClick={onRefresh}
      >
        <RefreshCw className="h-4 w-4" />
      </Button>
      <Button
        aria-label={
          fullscreen
            ? t('exit_calendar_fullscreen')
            : t('open_calendar_fullscreen')
        }
        aria-pressed={fullscreen}
        size="icon"
        title={
          fullscreen
            ? t('exit_calendar_fullscreen')
            : t('open_calendar_fullscreen')
        }
        variant="outline"
        onClick={onToggleFullscreen}
      >
        {fullscreen ? (
          <Minimize2 className="h-4 w-4" />
        ) : (
          <Maximize2 className="h-4 w-4" />
        )}
      </Button>
      {fullscreen && <div className="ml-auto">{scheduleActions}</div>}
    </div>
  );

  return (
    <>
      {!fullscreen && (
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
          {scheduleActions}
        </div>
      )}

      {controls}
    </>
  );
}
