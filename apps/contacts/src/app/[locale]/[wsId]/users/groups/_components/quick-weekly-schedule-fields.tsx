'use client';

import { CalendarDays, Clock, Globe, Repeat, Users } from '@tuturuuu/icons';
import type { WorkspaceUserGroupScheduleGroup } from '@tuturuuu/internal-api';
import { DateTimePicker } from '@tuturuuu/ui/date-time-picker';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { useTranslations } from 'next-intl';
import { QuickWeeklyDayPicker } from './quick-weekly-day-picker';
import {
  pickerDateFromParts,
  pickerPartsFromDate,
  type QuickWeeklyScheduleDraft,
} from './quick-weekly-schedule-utils';
import { DEFAULT_SCHEDULE_TIMEZONE } from './session-time-utils';
import { SessionTimezoneCombobox } from './session-timezone-combobox';

interface QuickWeeklyScheduleFieldsProps {
  canChooseGroup: boolean;
  draft: QuickWeeklyScheduleDraft;
  groupId: string;
  groups: WorkspaceUserGroupScheduleGroup[];
  setDraft: (
    updater: (current: QuickWeeklyScheduleDraft) => QuickWeeklyScheduleDraft
  ) => void;
  setGroupId: (value: string) => void;
}

function updateDraftDateTime(
  draft: QuickWeeklyScheduleDraft,
  key: 'end' | 'start',
  value: Date
): QuickWeeklyScheduleDraft {
  const parts = pickerPartsFromDate(value, draft.timezone);

  return key === 'start'
    ? {
        ...draft,
        startDate: parts.date,
        startTime: parts.time,
      }
    : {
        ...draft,
        endDate: parts.date,
        endTime: parts.time,
      };
}

export function QuickWeeklyScheduleFields({
  canChooseGroup,
  draft,
  groupId,
  groups,
  setDraft,
  setGroupId,
}: QuickWeeklyScheduleFieldsProps) {
  const t = useTranslations('ws-user-group-schedule');

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {canChooseGroup ? (
        <div className="space-y-2 sm:col-span-2">
          <Label className="flex items-center gap-2">
            <Users className="h-3.5 w-3.5 text-muted-foreground" />
            {t('group')}
          </Label>
          <Select value={groupId} onValueChange={setGroupId}>
            <SelectTrigger>
              <Users className="h-4 w-4 text-muted-foreground" />
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
      ) : null}

      <div className="space-y-2 sm:col-span-2">
        <Label className="flex items-center gap-2">
          <Globe className="h-3.5 w-3.5 text-muted-foreground" />
          {t('timezone')}
        </Label>
        <SessionTimezoneCombobox
          ariaLabel={t('timezone')}
          className="h-10 w-full"
          emptyLabel={t('no_timezones_found')}
          leadingIcon={<Globe className="h-4 w-4" />}
          placeholder={DEFAULT_SCHEDULE_TIMEZONE}
          searchPlaceholder={t('search_timezone')}
          value={draft.timezone}
          onValueChange={(timezone) =>
            setDraft((current) => ({ ...current, timezone }))
          }
        />
      </div>

      <div className="space-y-2">
        <Label className="flex items-center gap-2">
          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
          {t('start_time')}
        </Label>
        <DateTimePicker
          allowClear={false}
          date={pickerDateFromParts(
            draft.startDate,
            draft.startTime,
            draft.timezone
          )}
          preferences={{
            timeFormat: '24h',
            timezone: draft.timezone,
            weekStartsOn: 1,
          }}
          setDate={(value) => {
            if (!value) return;
            setDraft((current) => updateDraftDateTime(current, 'start', value));
          }}
          showTimeSelect
        />
      </div>

      <div className="space-y-2">
        <Label className="flex items-center gap-2">
          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
          {t('end_time')}
        </Label>
        <DateTimePicker
          allowClear={false}
          date={pickerDateFromParts(
            draft.endDate,
            draft.endTime,
            draft.timezone
          )}
          preferences={{
            timeFormat: '24h',
            timezone: draft.timezone,
            weekStartsOn: 1,
          }}
          setDate={(value) => {
            if (!value) return;
            setDraft((current) => updateDraftDateTime(current, 'end', value));
          }}
          showTimeSelect
        />
      </div>

      <QuickWeeklyDayPicker
        daysOfWeek={draft.daysOfWeek}
        onChange={(daysOfWeek) =>
          setDraft((current) => ({ ...current, daysOfWeek }))
        }
      />

      <div className="space-y-2">
        <Label className="flex items-center gap-2" htmlFor="quick-interval">
          <Repeat className="h-3.5 w-3.5 text-muted-foreground" />
          {t('interval_weeks')}
        </Label>
        <Input
          id="quick-interval"
          min={1}
          max={52}
          type="number"
          value={draft.intervalWeeks}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              intervalWeeks: Number(event.target.value) || 1,
            }))
          }
        />
      </div>

      <div className="space-y-2">
        <Label className="flex items-center gap-2">
          <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
          {t('until_date')}
        </Label>
        <DateTimePicker
          allowClear={false}
          date={pickerDateFromParts(draft.untilDate, '00:00', draft.timezone)}
          preferences={{
            timeFormat: '24h',
            timezone: draft.timezone,
            weekStartsOn: 1,
          }}
          setDate={(value) => {
            if (!value) return;
            const parts = pickerPartsFromDate(value, draft.timezone);
            setDraft((current) => ({ ...current, untilDate: parts.date }));
          }}
          showTimeSelect={false}
        />
      </div>
    </div>
  );
}
