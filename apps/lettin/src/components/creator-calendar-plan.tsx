'use client';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { calendarDayUrl } from './calendar-day-url';
export function CreatorCalendarPlan({
  wsId,
  disabled,
}: {
  wsId: string;
  disabled: boolean;
}) {
  const t = useTranslations('lettin');
  const locale = useLocale();
  const [day, setDay] = useState('');
  const href = !disabled ? calendarDayUrl(wsId, locale, day) : null;
  return (
    <fieldset className="space-y-3 rounded-lg border border-border p-4">
      <legend className="px-2 text-sm">{t('planWritingTime')}</legend>
      <label className="block space-y-2 text-sm">
        {t('planningDay')}
        <Input
          type="date"
          value={day}
          disabled={disabled}
          onChange={(event) => setDay(event.target.value)}
        />
      </label>
      <p className="text-muted-foreground text-xs">
        {t('planningCalendarHint')}
      </p>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="wiki-public-link"
        >
          {t('openPlanningCalendar')}
        </a>
      ) : (
        <Button disabled variant="outline">
          {t('openPlanningCalendar')}
        </Button>
      )}
    </fieldset>
  );
}
