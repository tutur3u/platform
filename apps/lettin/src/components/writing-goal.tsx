'use client';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';

export function WritingGoal({
  words,
  incomplete,
}: {
  words: number;
  incomplete: boolean;
}) {
  const t = useTranslations('lettin');
  const id = useId();
  const [raw, setRaw] = useState('');
  const value = raw.trim();
  const number = /^\d{1,6}$/.test(value) ? Number(value) : 0;
  const target =
    Number.isInteger(number) && number >= 1 && number <= 100_000
      ? number
      : undefined;
  const invalid = !!value && target === undefined;
  return (
    <fieldset className="space-y-2 rounded border border-border p-3">
      <legend className="px-1">{t('writingGoal')}</legend>
      <label className="block" htmlFor={id}>
        {t('writingGoal')}
      </label>
      <Input
        id={id}
        inputMode="numeric"
        maxLength={6}
        value={raw}
        aria-invalid={invalid}
        aria-describedby={`${id}-hint${invalid ? ` ${id}-error` : ''}`}
        onInput={(e) => setRaw(e.currentTarget.value)}
      />
      <p id={`${id}-hint`} className="text-muted-foreground text-xs">
        {t('writingGoalHint')}
      </p>
      {invalid && (
        <p id={`${id}-error`} role="alert">
          {t('writingGoalInvalid')}
        </p>
      )}
      {target !== undefined && (
        <div role="status" className="space-y-1">
          {incomplete ? (
            <p>{t('writingGoalUnavailable')}</p>
          ) : (
            <>
              <p>{t('writingGoalProgress', { count: words, target })}</p>
              <progress
                className="w-full"
                aria-label={t('writingGoal')}
                value={Math.min(words, target)}
                max={target}
              />
              {words >= target && <p>{t('writingGoalReached')}</p>}
            </>
          )}
        </div>
      )}
      {raw && (
        <Button type="button" variant="ghost" onClick={() => setRaw('')}>
          {t('clearWritingGoal')}
        </Button>
      )}
    </fieldset>
  );
}
