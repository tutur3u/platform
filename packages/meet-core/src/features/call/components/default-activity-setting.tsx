'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { useTranslations } from 'next-intl';
import { useId } from 'react';
import { toolActivityId } from '../stage-layout/activity-ids';
import { MeetSettingsCard, MeetSettingsHeading } from './meet-settings-card';

const NONE = 'none';

/**
 * Host setting: the activity that is already open for everyone who joins.
 * "None" clears it; people already in the call keep what they have open.
 */
export function DefaultActivitySetting({
  value,
  tools,
  onChange,
}: {
  /** The room's `defaultActivity` (`tool:<id>`), or none. */
  value?: string | null;
  /** The registered tools to offer; `label` is a message key or text. */
  tools: readonly { id: string; label: string }[];
  onChange: (activityId: string | null) => void;
}) {
  const t = useTranslations('meet.call.activities_settings');
  const root = useTranslations();
  const id = useId();
  const options = tools.map((tool) => ({
    value: toolActivityId(tool.id),
    label: root.has(tool.label) ? root(tool.label) : tool.label,
  }));
  const current = options.some((option) => option.value === value)
    ? (value as string)
    : NONE;
  return (
    <MeetSettingsCard>
      <MeetSettingsHeading
        id={id}
        title={t('default_activity')}
        description={t('default_activity_hint')}
      />
      <Select
        value={current}
        onValueChange={(next) => onChange(next === NONE ? null : next)}
      >
        <SelectTrigger aria-labelledby={id} className="min-h-11 w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE} className="min-h-11">
            {t('default_activity_none')}
          </SelectItem>
          {options.map((option) => (
            <SelectItem
              key={option.value}
              value={option.value}
              className="min-h-11"
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </MeetSettingsCard>
  );
}
