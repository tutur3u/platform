'use client';

import { CalendarDays, Repeat, Users } from '@tuturuuu/icons';
import type { WorkspaceUserGroupScheduleGroup } from '@tuturuuu/internal-api';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import dayjs from 'dayjs';
import { useLocale, useTranslations } from 'next-intl';
import type {
  FrequencySeriesOption,
  FrequencyUpdateDraft,
} from './frequency-update-utils';
import { QuickWeeklyDayPicker } from './quick-weekly-day-picker';

interface FrequencyUpdateFieldsProps {
  canChooseGroup: boolean;
  draft: FrequencyUpdateDraft | null;
  groupId: string;
  groups: WorkspaceUserGroupScheduleGroup[];
  onDraftChange: (draft: FrequencyUpdateDraft) => void;
  onGroupChange: (groupId: string) => void;
  onSeriesChange: (seriesId: string) => void;
  selectedSeriesId: string;
  seriesOptions: FrequencySeriesOption[];
}

export function FrequencyUpdateFields({
  canChooseGroup,
  draft,
  groupId,
  groups,
  onDraftChange,
  onGroupChange,
  onSeriesChange,
  selectedSeriesId,
  seriesOptions,
}: FrequencyUpdateFieldsProps) {
  const t = useTranslations('ws-user-group-schedule');
  const commonT = useTranslations('common');
  const locale = useLocale();

  return (
    <div className="space-y-5">
      {canChooseGroup && (
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <Users className="h-3.5 w-3.5 text-muted-foreground" />
            {t('group')}
          </Label>
          <Select value={groupId} onValueChange={onGroupChange}>
            <SelectTrigger>
              <SelectValue placeholder={t('group')} />
            </SelectTrigger>
            <SelectContent>
              {groups.map((group) => (
                <SelectItem key={group.id} value={group.id}>
                  {group.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {seriesOptions.length > 1 && (
        <div className="space-y-2">
          <Label>{t('frequency_schedule_to_change')}</Label>
          <Select value={selectedSeriesId} onValueChange={onSeriesChange}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {seriesOptions.map((option) => {
                const session = option.firstSession;
                const days = session.recurrence?.daysOfWeek
                  .map((day) =>
                    commonT(
                      `days_of_week.${['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][day]}`
                    )
                  )
                  .join(', ');
                return (
                  <SelectItem key={option.id} value={option.id}>
                    {days} ·{' '}
                    {dayjs(session.startsAt)
                      .tz(session.startTimezone)
                      .locale(locale)
                      .format('HH:mm')}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
      )}

      {draft && (
        <div className="grid min-w-0 gap-4 rounded-xl border bg-muted/20 p-3 md:grid-cols-2 md:p-4">
          <QuickWeeklyDayPicker
            daysOfWeek={draft.daysOfWeek}
            onChange={(daysOfWeek) => onDraftChange({ ...draft, daysOfWeek })}
          />
          <div className="space-y-2">
            <Label
              className="flex items-center gap-2"
              htmlFor="frequency-interval"
            >
              <Repeat className="h-3.5 w-3.5 text-muted-foreground" />
              {t('interval_weeks')}
            </Label>
            <Input
              id="frequency-interval"
              max={52}
              min={1}
              type="number"
              value={draft.intervalWeeks}
              onChange={(event) =>
                onDraftChange({
                  ...draft,
                  intervalWeeks: Math.min(
                    52,
                    Math.max(1, Number(event.target.value) || 1)
                  ),
                })
              }
            />
          </div>
          <div className="flex gap-3 rounded-lg border bg-background p-3 md:col-span-2">
            <CalendarDays className="mt-0.5 h-4 w-4 text-dynamic-blue" />
            <div className="space-y-1 text-sm">
              <p className="font-medium">{t('frequency_future_only_title')}</p>
              <p className="text-muted-foreground">
                {t('frequency_future_only_description')}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
