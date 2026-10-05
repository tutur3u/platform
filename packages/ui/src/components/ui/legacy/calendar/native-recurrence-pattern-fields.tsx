'use client';
import { useTranslations } from 'next-intl';
import { Checkbox } from '../../checkbox';
import { Input } from '../../input';
import { Label } from '../../label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../select';
import type { RecurrenceDraft } from './native-recurrence-model';

export function NativeRecurrencePatternFields({
  draft,
  setDraft,
}: {
  draft: RecurrenceDraft;
  setDraft: (draft: RecurrenceDraft) => void;
}) {
  const t = useTranslations('calendar.recurrence');
  const field = (key: keyof RecurrenceDraft, value: unknown) =>
    setDraft({ ...draft, [key]: value });
  const monthly = draft.frequency === 'monthly' || draft.frequency === 'yearly';
  const relative = monthly && draft.monthPattern === 'weekday';
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>{t('frequency')}</Label>
          <Select
            value={draft.frequency}
            onValueChange={(value) => field('frequency', value)}
          >
            <SelectTrigger aria-label={t('frequency')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(['daily', 'weekly', 'monthly', 'yearly'] as const).map(
                (value) => (
                  <SelectItem key={value} value={value}>
                    {t(value)}
                  </SelectItem>
                )
              )}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="series-interval">{t('interval')}</Label>
          <Input
            id="series-interval"
            type="number"
            min={1}
            max={1000}
            value={draft.interval}
            onChange={(e) => field('interval', e.target.value)}
          />
        </div>
      </div>
      {monthly && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>{t('monthPattern')}</Label>
            <Select
              value={draft.monthPattern}
              onValueChange={(value) => field('monthPattern', value)}
            >
              <SelectTrigger aria-label={t('monthPattern')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="day">{t('monthDayPattern')}</SelectItem>
                <SelectItem value="weekday">
                  {t('monthWeekdayPattern')}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          {draft.frequency === 'yearly' && (
            <div>
              <Label htmlFor="series-month">{t('month')}</Label>
              <Input
                id="series-month"
                type="number"
                min={1}
                max={12}
                value={
                  draft.month ||
                  (draft.startLocal
                    ? String(Number(draft.startLocal.slice(5, 7)))
                    : '')
                }
                onChange={(e) => field('month', e.target.value)}
              />
            </div>
          )}
        </div>
      )}
      {monthly &&
        (relative ? (
          <div>
            <Label>{t('weekIndex')}</Label>
            <Select
              value={draft.weekIndex}
              onValueChange={(value) => field('weekIndex', value)}
            >
              <SelectTrigger aria-label={t('weekIndex')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(['1', '2', '3', '4', '-1'] as const).map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(value === '-1' ? 'ordinalLast' : `ordinal${value}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="series-monthday">{t('monthDay')}</Label>
              <Input
                id="series-monthday"
                type="number"
                min={1}
                max={31}
                value={draft.monthDay}
                onChange={(e) => field('monthDay', e.target.value)}
              />
            </div>
            <div>
              <Label>{t('monthDayOverflow')}</Label>
              <Select
                value={draft.monthDayOverflow ?? 'skip'}
                onValueChange={(value) => field('monthDayOverflow', value)}
              >
                <SelectTrigger aria-label={t('monthDayOverflow')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="skip">{t('monthDaySkip')}</SelectItem>
                  <SelectItem value="last-day">{t('monthDayLast')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        ))}
      {(draft.frequency === 'weekly' || relative) && (
        <fieldset aria-label={t('weekdays')} className="flex flex-wrap gap-2">
          {(['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const).map((day) => (
            <label key={day} className="flex items-center gap-1">
              <Checkbox
                checked={draft.weekdays.includes(day)}
                onCheckedChange={(checked) =>
                  field(
                    'weekdays',
                    checked
                      ? [...draft.weekdays, day]
                      : draft.weekdays.filter((d) => d !== day)
                  )
                }
              />
              {t(day)}
            </label>
          ))}
        </fieldset>
      )}
      {relative && (
        <p className="text-muted-foreground text-xs">
          {t('relativeWeekdayHelp')}
        </p>
      )}
    </>
  );
}
