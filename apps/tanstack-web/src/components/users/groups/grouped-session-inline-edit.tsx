'use client';

import { Globe, Save, X } from '@tuturuuu/icons';
import type {
  UpdateWorkspaceUserGroupSessionPayload,
  WorkspaceUserGroupSession,
} from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { cn } from '@tuturuuu/utils/format';
import dayjs from 'dayjs';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import '@/lib/dayjs-setup';
import type { GroupedTimeblockMoveScope } from './grouped-session-timeblock-types';
import {
  DEFAULT_SCHEDULE_TIMEZONE,
  localDateTimeParts,
} from './session-time-utils';
import { SessionTimezoneCombobox } from './session-timezone-combobox';

interface GroupedSessionInlineEditProps {
  disabled?: boolean;
  onCancel: () => void;
  onSave: (
    session: WorkspaceUserGroupSession,
    payload: UpdateWorkspaceUserGroupSessionPayload
  ) => Promise<void>;
  session: WorkspaceUserGroupSession;
}

function splitTags(value: string) {
  return Array.from(
    new Set(
      value
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean)
    )
  ).slice(0, 20);
}

function buildZonedIso(date: string, time: string, timezone: string) {
  return dayjs
    .tz(`${date} ${time}`, 'YYYY-MM-DD HH:mm', timezone)
    .toISOString();
}

function ScopeButtons({
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
            'h-8 justify-center',
            value === scope && 'border-primary bg-primary/10 text-primary'
          )}
          disabled={disabled}
          key={scope}
          size="sm"
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

export function GroupedSessionInlineEdit({
  disabled,
  onCancel,
  onSave,
  session,
}: GroupedSessionInlineEditProps) {
  const t = useTranslations('ws-user-group-schedule');
  const initialTimezone =
    session.startTimezone || session.endTimezone || DEFAULT_SCHEDULE_TIMEZONE;
  const [title, setTitle] = useState(session.title ?? '');
  const [tags, setTags] = useState(
    session.tags.map((tag) => tag.name).join(', ')
  );
  const [date, setDate] = useState(
    localDateTimeParts(session.startsAt, initialTimezone).date
  );
  const [startTime, setStartTime] = useState(
    localDateTimeParts(session.startsAt, initialTimezone).time
  );
  const [endTime, setEndTime] = useState(
    localDateTimeParts(session.endsAt, session.endTimezone || initialTimezone)
      .time
  );
  const [timezone, setTimezone] = useState(initialTimezone);
  const [scope, setScope] = useState<GroupedTimeblockMoveScope>('once');

  useEffect(() => {
    const nextTimezone =
      session.startTimezone || session.endTimezone || DEFAULT_SCHEDULE_TIMEZONE;
    setTitle(session.title ?? '');
    setTags(session.tags.map((tag) => tag.name).join(', '));
    setDate(localDateTimeParts(session.startsAt, nextTimezone).date);
    setStartTime(localDateTimeParts(session.startsAt, nextTimezone).time);
    setEndTime(
      localDateTimeParts(session.endsAt, session.endTimezone || nextTimezone)
        .time
    );
    setTimezone(nextTimezone);
    setScope('once');
  }, [session]);

  const canSubmit =
    Boolean(date && startTime && endTime && timezone) &&
    dayjs(buildZonedIso(date, endTime, timezone)).isAfter(
      dayjs(buildZonedIso(date, startTime, timezone))
    );

  return (
    <div className="mt-3 rounded-md border bg-muted/20 p-3">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1.1fr)_140px_120px_120px_minmax(220px,0.9fr)]">
        <div className="space-y-1.5 md:col-span-1">
          <Label htmlFor={`inline-title-${session.id}`}>
            {t('inline_edit_title')}
          </Label>
          <Input
            id={`inline-title-${session.id}`}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>
        <div className="space-y-1.5 md:col-span-1">
          <Label htmlFor={`inline-tags-${session.id}`}>
            {t('inline_edit_tags')}
          </Label>
          <Input
            id={`inline-tags-${session.id}`}
            value={tags}
            onChange={(event) => setTags(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`inline-date-${session.id}`}>
            {t('inline_edit_date')}
          </Label>
          <Input
            id={`inline-date-${session.id}`}
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`inline-start-${session.id}`}>
            {t('inline_edit_start_time')}
          </Label>
          <Input
            id={`inline-start-${session.id}`}
            type="time"
            value={startTime}
            onChange={(event) => setStartTime(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`inline-end-${session.id}`}>
            {t('inline_edit_end_time')}
          </Label>
          <Input
            id={`inline-end-${session.id}`}
            type="time"
            value={endTime}
            onChange={(event) => setEndTime(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>{t('timezone')}</Label>
          <SessionTimezoneCombobox
            ariaLabel={t('timezone')}
            className="h-9 w-full"
            emptyLabel={t('no_timezones_found')}
            leadingIcon={<Globe className="h-4 w-4" />}
            placeholder={DEFAULT_SCHEDULE_TIMEZONE}
            searchPlaceholder={t('search_timezone')}
            value={timezone}
            onValueChange={setTimezone}
          />
        </div>
      </div>
      {session.seriesId && (
        <div className="mt-3 max-w-sm">
          <ScopeButtons disabled={disabled} value={scope} onChange={setScope} />
        </div>
      )}
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <Button
          disabled={disabled}
          size="sm"
          type="button"
          variant="outline"
          onClick={onCancel}
        >
          <X className="h-4 w-4" />
          {t('inline_edit_cancel')}
        </Button>
        <Button
          disabled={disabled || !canSubmit}
          size="sm"
          type="button"
          onClick={async () => {
            await onSave(session, {
              endTimezone: timezone,
              endsAt: buildZonedIso(date, endTime, timezone),
              scope: session.seriesId ? scope : 'once',
              startTimezone: timezone,
              startsAt: buildZonedIso(date, startTime, timezone),
              tagNames: splitTags(tags),
              title: title.trim() || null,
            });
          }}
        >
          <Save className="h-4 w-4" />
          {t('inline_edit_save')}
        </Button>
      </div>
    </div>
  );
}
