'use client';

import { CalendarDays, Globe, Repeat, Users } from '@tuturuuu/icons';
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
import { QuickWeeklyPatternFields } from './quick-weekly-pattern-fields';
import {
  pickerDateFromParts,
  pickerPartsFromDate,
  type QuickWeeklyScheduleDraft,
} from './quick-weekly-schedule-utils';
import { ScheduleEndingFields } from './schedule-ending-fields';
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
    <div className="grid min-w-0 gap-4 md:grid-cols-2">
      {canChooseGroup ? (
        <div className="min-w-0 space-y-2 md:col-span-2">
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

      <div className="min-w-0 space-y-2 md:col-span-2">
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

      <div className="min-w-0 space-y-2">
        <Label className="flex items-center gap-2">
          <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
          {t('starts_on')}
        </Label>
        <DateTimePicker
          allowClear={false}
          date={pickerDateFromParts(draft.startDate, '00:00', draft.timezone)}
          preferences={{
            timeFormat: '24h',
            timezone: draft.timezone,
            weekStartsOn: 1,
          }}
          setDate={(value) => {
            if (!value) return;
            const startDate = pickerPartsFromDate(value, draft.timezone).date;
            setDraft((current) => ({ ...current, startDate }));
          }}
          showTimeSelect={false}
        />
      </div>

      <div className="space-y-2">
        <Label className="flex items-center gap-2" htmlFor="quick-interval">
          <Repeat className="h-3.5 w-3.5 text-muted-foreground" />
          {t('interval_weeks')}
        </Label>
        <Input
          id="quick-interval"
          max={52}
          min={1}
          type="number"
          value={draft.intervalWeeks}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              intervalWeeks: Math.min(
                52,
                Math.max(1, Number(event.target.value) || 1)
              ),
            }))
          }
        />
      </div>

      <QuickWeeklyPatternFields
        patterns={draft.patterns}
        onChange={(patterns) =>
          setDraft((current) => ({ ...current, patterns }))
        }
      />

      <ScheduleEndingFields
        endMode={draft.endMode}
        timezone={draft.timezone}
        untilDate={draft.untilDate}
        onChange={(ending) =>
          setDraft((current) => ({ ...current, ...ending }))
        }
      />
    </div>
  );
}
