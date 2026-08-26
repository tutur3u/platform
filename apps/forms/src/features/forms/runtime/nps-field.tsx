'use client';

import { cn } from '@tuturuuu/utils/format';
import { getNpsBand, NPS_SCORES, type NpsBand } from '../nps';
import type { FormAnswerValue, FormDefinitionQuestion } from '../types';
import type { FormsTranslator, FormToneClasses } from './types';

const BAND_SELECTED_CLASSES: Record<NpsBand, string> = {
  detractor: 'border-dynamic-red bg-dynamic-red text-white shadow-md',
  passive: 'border-dynamic-orange bg-dynamic-orange text-white shadow-md',
  promoter: 'border-dynamic-green bg-dynamic-green text-white shadow-md',
};

const BAND_HOVER_CLASSES: Record<NpsBand, string> = {
  detractor: 'hover:border-dynamic-red/60 hover:bg-dynamic-red/10',
  passive: 'hover:border-dynamic-orange/60 hover:bg-dynamic-orange/10',
  promoter: 'hover:border-dynamic-green/60 hover:bg-dynamic-green/10',
};

export function renderNpsField({
  question,
  value,
  onChange,
  disabled,
  validationError,
  toneClasses,
  t,
}: {
  question: FormDefinitionQuestion;
  value: FormAnswerValue | undefined;
  onChange: (value: FormAnswerValue) => void;
  disabled: boolean;
  validationError?: string;
  toneClasses: FormToneClasses;
  t: FormsTranslator;
}) {
  if (question.type !== 'nps') return null;

  const settings = question.settings ?? {};
  const selected =
    typeof value === 'string' && value !== '' ? Number(value) : Number.NaN;
  const minLabel = settings.minLabel || t('runtime.nps_not_likely');
  const maxLabel = settings.maxLabel || t('runtime.nps_very_likely');

  return (
    // A native fieldset of radios rather than a div of buttons with ARIA
    // roles: arrow-key navigation, the group label and the disabled cascade
    // all come for free, and there is no role to get wrong.
    <fieldset className="space-y-3" disabled={disabled}>
      <legend className="sr-only">{t('question_type.nps')}</legend>
      <div
        // 11 tiles never fit one comfortable row on a phone, so they wrap into
        // a grid rather than shrinking below a tappable size.
        className={cn(
          'grid grid-cols-6 gap-2 sm:grid-cols-11',
          validationError ? 'rounded-2xl ring-2 ring-dynamic-red/15' : ''
        )}
      >
        {NPS_SCORES.map((score) => {
          const band = getNpsBand(score);
          const isSelected = selected === score;

          return (
            <label
              key={score}
              className={cn(
                'flex h-11 items-center justify-center rounded-xl border font-medium text-sm tabular-nums transition-all duration-200',
                'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
                isSelected
                  ? BAND_SELECTED_CLASSES[band]
                  : cn(
                      toneClasses.optionCardClassName,
                      validationError ? 'border-dynamic-red/30!' : ''
                    ),
                disabled
                  ? 'cursor-default opacity-75'
                  : cn(
                      'cursor-pointer active:scale-95',
                      isSelected ? '' : BAND_HOVER_CLASSES[band]
                    )
              )}
            >
              <input
                type="radio"
                name={`nps-${question.id}`}
                value={score}
                checked={isSelected}
                onChange={() => onChange(String(score))}
                className="sr-only"
              />
              {score}
            </label>
          );
        })}
      </div>
      <div className="flex items-center justify-between gap-4 text-muted-foreground text-xs">
        <span>{minLabel}</span>
        <span className="text-right">{maxLabel}</span>
      </div>
    </fieldset>
  );
}
