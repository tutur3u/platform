'use client';

import { Globe, MoveRight } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import type { GroupedTimeblockMoveScope } from './grouped-session-timeblock-types';
import { DEFAULT_SCHEDULE_TIMEZONE } from './session-time-utils';
import { SessionTimezoneCombobox } from './session-timezone-combobox';

interface GroupedSessionTimeblockMoveFormProps {
  date: string;
  disabled?: boolean;
  hasRecurringSessions: boolean;
  onCancel: () => void;
  onDateChange: (value: string) => void;
  onScopeChange: (value: GroupedTimeblockMoveScope) => void;
  onSubmit: () => void;
  onTimeChange: (value: string) => void;
  onTimezoneChange: (value: string) => void;
  scope: GroupedTimeblockMoveScope;
  sessionCount: number;
  time: string;
  timezone: string;
}

function MoveScopeButtons({
  disabled,
  onChange,
  value,
}: {
  disabled?: boolean;
  onChange: (value: GroupedTimeblockMoveScope) => void;
  value: GroupedTimeblockMoveScope;
}) {
  const t = useTranslations('ws-user-group-schedule');

  return (
    <div className="grid grid-cols-2 gap-2">
      {(['once', 'future'] as const).map((scope) => (
        <Button
          className={cn(
            'justify-center',
            value === scope && 'border-primary bg-primary/10 text-primary'
          )}
          disabled={disabled}
          key={scope}
          type="button"
          variant="outline"
          onClick={() => onChange(scope)}
        >
          {scope === 'once' ? t('edit_scope_once') : t('edit_scope_future')}
        </Button>
      ))}
    </div>
  );
}

export function GroupedSessionTimeblockMoveForm({
  date,
  disabled,
  hasRecurringSessions,
  onCancel,
  onDateChange,
  onScopeChange,
  onSubmit,
  onTimeChange,
  onTimezoneChange,
  scope,
  sessionCount,
  time,
  timezone,
}: GroupedSessionTimeblockMoveFormProps) {
  const t = useTranslations('ws-user-group-schedule');

  return (
    <div className="border-b bg-muted/20 px-4 py-3 sm:px-6">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(220px,0.8fr)_auto] lg:items-end">
        <div className="space-y-2">
          <Label htmlFor="grouped-timeblock-move-date">
            {t('bulk_move_date')}
          </Label>
          <Input
            id="grouped-timeblock-move-date"
            type="date"
            value={date}
            onChange={(event) => onDateChange(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="grouped-timeblock-move-time">
            {t('bulk_move_time')}
          </Label>
          <Input
            id="grouped-timeblock-move-time"
            type="time"
            value={time}
            onChange={(event) => onTimeChange(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>{t('timezone')}</Label>
          <SessionTimezoneCombobox
            ariaLabel={t('timezone')}
            className="h-9 w-full"
            emptyLabel={t('no_timezones_found')}
            leadingIcon={<Globe className="h-4 w-4" />}
            placeholder={DEFAULT_SCHEDULE_TIMEZONE}
            searchPlaceholder={t('search_timezone')}
            value={timezone}
            onValueChange={onTimezoneChange}
          />
        </div>
        <div className="flex gap-2 lg:justify-end">
          <Button
            disabled={disabled}
            type="button"
            variant="outline"
            onClick={onCancel}
          >
            {t('cancel_move_mode')}
          </Button>
          <Button
            disabled={
              disabled || !date || !time || !timezone || sessionCount === 0
            }
            type="button"
            onClick={onSubmit}
          >
            <MoveRight className="h-4 w-4" />
            {t('confirm_move_sessions', { count: sessionCount })}
          </Button>
        </div>
      </div>
      {hasRecurringSessions && (
        <div className="mt-3 max-w-xl space-y-2">
          <Label>{t('edit_scope')}</Label>
          <MoveScopeButtons
            disabled={disabled}
            value={scope}
            onChange={onScopeChange}
          />
        </div>
      )}
    </div>
  );
}
