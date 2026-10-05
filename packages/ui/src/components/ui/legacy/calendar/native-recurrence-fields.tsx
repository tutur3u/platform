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
import {
  type RecurrenceDraft,
  recurrenceAllDay,
} from './native-recurrence-model';
export function NativeRecurrenceFields({
  draft,
  setDraft,
  occurrenceOnly,
  disabled,
  nativeStorageHint = true,
}: {
  draft: RecurrenceDraft;
  setDraft: (draft: RecurrenceDraft) => void;
  occurrenceOnly: boolean;
  disabled: boolean;
  nativeStorageHint?: boolean;
}) {
  const t = useTranslations('calendar.recurrence');
  const field = (key: keyof RecurrenceDraft, value: unknown) =>
    setDraft({ ...draft, [key]: value });
  return (
    <fieldset disabled={disabled} className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor="series-title">{t('title')}</Label>
        <Input
          id="series-title"
          value={draft.title}
          maxLength={1000}
          onChange={(e) => field('title', e.target.value)}
          required
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        {(['startLocal', 'endLocal'] as const).map((key) => (
          <div key={key} className="space-y-1">
            <Label htmlFor={key}>
              {t(key === 'startLocal' ? 'start' : 'end')}
            </Label>
            <Input
              id={key}
              type="datetime-local"
              value={draft[key]}
              onChange={(e) => field(key, e.target.value)}
              required
            />
          </div>
        ))}
      </div>
      <div className="space-y-1">
        <Label htmlFor="series-timezone">{t('timezone')}</Label>
        <Input
          id="series-timezone"
          value={draft.timeZone}
          onChange={(e) => field('timeZone', e.target.value)}
          disabled={occurrenceOnly || !!draft.retainedRule}
          required
        />
      </div>
      <label className="flex items-center gap-2">
        <Checkbox
          checked={draft.allDay}
          disabled={occurrenceOnly}
          onCheckedChange={(value) =>
            setDraft(recurrenceAllDay(draft, value === true))
          }
        />
        {t('allDay')}
      </label>
      {draft.retainedRule && !occurrenceOnly && (
        <p className="text-muted-foreground text-xs">{t('advancedPattern')}</p>
      )}
      {!occurrenceOnly && !draft.retainedRule && (
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
          {draft.frequency === 'weekly' && (
            <fieldset
              aria-label={t('weekdays')}
              className="flex flex-wrap gap-2"
            >
              {(['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const).map(
                (day) => (
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
                )
              )}
            </fieldset>
          )}
          {(draft.frequency === 'monthly' || draft.frequency === 'yearly') && (
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
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{t('ending')}</Label>
              <Select
                value={draft.endType}
                onValueChange={(value) => field('endType', value)}
              >
                <SelectTrigger aria-label={t('ending')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(['never', 'count', 'until'] as const).map((value) => (
                    <SelectItem value={value} key={value}>
                      {t(value)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {draft.endType !== 'never' && (
              <div>
                <Label htmlFor="series-endvalue">{t(draft.endType)}</Label>
                <Input
                  id="series-endvalue"
                  type={draft.endType === 'count' ? 'number' : 'date'}
                  min={draft.endType === 'count' ? 1 : undefined}
                  max={draft.endType === 'count' ? 10000 : undefined}
                  value={draft.endValue}
                  onChange={(e) => field('endValue', e.target.value)}
                  required
                />
              </div>
            )}
          </div>
        </>
      )}
      <div>
        <Label htmlFor="series-location">{t('location')}</Label>
        <Input
          id="series-location"
          value={draft.location}
          onChange={(e) => field('location', e.target.value)}
        />
      </div>
      {nativeStorageHint && (
        <p className="text-muted-foreground text-xs">{t('nativeOnly')}</p>
      )}
    </fieldset>
  );
}
