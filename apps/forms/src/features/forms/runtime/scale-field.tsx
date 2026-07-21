'use client';

import { Check, Star } from '@tuturuuu/icons';
import { Slider } from '@tuturuuu/ui/slider';
import { cn } from '@tuturuuu/utils/format';
import { normalizeMarkdownToText } from '../content';
import { FormsMarkdown } from '../forms-markdown';
import type { FormAnswerValue, FormDefinitionQuestion } from '../types';
import type {
  FormScaleOption,
  FormsTranslator,
  FormToneClasses,
} from './types';

export function renderScaleField({
  question,
  value,
  onChange,
  disabled,
  validationError,
  toneClasses,
  t,
  displayScaleOptions,
  scaleMin,
  scaleMax,
  scaleMinLabel,
  scaleMaxLabel,
  hasCustomScaleLabels,
  selectedScaleOption,
  selectedScaleLabel,
  selectedScaleNumber,
}: {
  question: FormDefinitionQuestion;
  value: FormAnswerValue | undefined;
  onChange: (value: FormAnswerValue) => void;
  disabled: boolean;
  validationError?: string;
  toneClasses: FormToneClasses;
  t: FormsTranslator;
  displayScaleOptions: FormScaleOption[];
  scaleMin: number;
  scaleMax: number;
  scaleMinLabel: string;
  scaleMaxLabel: string;
  hasCustomScaleLabels: boolean;
  selectedScaleOption: FormScaleOption | null;
  selectedScaleLabel: string | null;
  selectedScaleNumber: number;
}) {
  return question.type === 'linear_scale' || question.type === 'rating' ? (
    <div
      className={cn(
        'space-y-4 rounded-[1.6rem] border bg-background/45 p-4 transition-all sm:p-5',
        validationError
          ? 'border-dynamic-red/40! bg-dynamic-red/5'
          : 'border-border/60'
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="space-y-1">
            <p
              className={cn(
                'text-[11px] uppercase tracking-[0.22em]',
                validationError
                  ? 'text-dynamic-red/80'
                  : 'text-muted-foreground'
              )}
            >
              {question.type === 'rating'
                ? t('question_type.rating')
                : t('question_type.linear_scale')}
            </p>
            <p
              className={cn(
                'text-sm',
                validationError
                  ? 'text-dynamic-red/70'
                  : 'text-muted-foreground'
              )}
            >
              {scaleMin} - {scaleMax}
            </p>
          </div>
        </div>
        <div
          className={cn(
            'rounded-full border bg-background/70 px-3 py-1.5 text-sm shadow-sm',
            validationError
              ? 'border-dynamic-red/30! text-dynamic-red'
              : 'border-border/60 text-foreground'
          )}
        >
          {selectedScaleOption ? (
            question.type === 'rating' ? (
              <span className="font-semibold">
                {selectedScaleNumber}/{scaleMax}
              </span>
            ) : (
              <span className="font-semibold">{selectedScaleOption.value}</span>
            )
          ) : (
            <span
              className={
                validationError
                  ? 'text-dynamic-red/60'
                  : 'text-muted-foreground'
              }
            >
              {t('runtime.choose_option')}
            </span>
          )}
        </div>
      </div>

      {question.type === 'linear_scale' ? (
        <div
          className={cn(
            'rounded-[1.45rem] border bg-background/55 p-4 shadow-sm',
            validationError ? 'border-dynamic-red/20!' : 'border-border/60'
          )}
        >
          <Slider
            value={[
              Number.isNaN(selectedScaleNumber)
                ? scaleMin
                : selectedScaleNumber,
            ]}
            min={scaleMin}
            max={scaleMax}
            step={1}
            disabled={disabled}
            onValueChange={(nextValue) => {
              const nextScore = nextValue[0];
              if (typeof nextScore !== 'number') {
                return;
              }

              onChange(String(nextScore));
            }}
            className={cn(
              'px-1 py-4 **:data-[slot=slider-thumb]:h-5 **:data-[slot=slider-thumb]:w-5 **:data-[slot=slider-thumb]:border-2 **:data-[slot=slider-thumb]:border-current **:data-[slot=slider-range]:bg-current **:data-[slot=slider-thumb]:bg-background',
              selectedScaleLabel
                ? validationError
                  ? 'text-dynamic-red'
                  : 'text-foreground'
                : 'text-muted-foreground',
              validationError && !selectedScaleLabel
                ? 'text-dynamic-red/40'
                : ''
            )}
          />
          <div className="mt-3 grid gap-2 sm:grid-cols-5">
            {displayScaleOptions.map((option) => {
              const active = String(value ?? '') === option.value;
              const plainOptionLabel = normalizeMarkdownToText(option.label);
              const showLabel = plainOptionLabel.trim() !== option.value.trim();

              return (
                <button
                  key={option.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    if (active) {
                      onChange('');
                      return;
                    }
                    onChange(option.value);
                  }}
                  className={cn(
                    'rounded-[1.15rem] border px-3 py-3 text-left focus-visible:outline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                    disabled
                      ? 'cursor-default opacity-75'
                      : 'transition-all duration-300 hover:scale-[1.05] active:scale-[0.95]',
                    active
                      ? cn(
                          toneClasses.selectedOptionClassName,
                          'shadow-sm ring-1 ring-current/20'
                        )
                      : validationError
                        ? cn(
                            'border-dynamic-red/25 bg-background/40',
                            disabled
                              ? ''
                              : 'hover:border-dynamic-red/40! hover:bg-background/60'
                          )
                        : cn(
                            toneClasses.optionCardClassName,
                            disabled
                              ? ''
                              : 'hover:border-foreground/20 hover:bg-background/80 hover:shadow-sm'
                          )
                  )}
                  aria-label={showLabel ? plainOptionLabel : option.value}
                  aria-pressed={active}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span
                      className={cn(
                        'font-semibold text-base',
                        active
                          ? ''
                          : validationError
                            ? 'text-dynamic-red/70'
                            : ''
                      )}
                    >
                      {option.value}
                    </span>
                    {active ? <Check className="h-4 w-4" /> : null}
                  </div>
                  {showLabel ? (
                    <FormsMarkdown
                      content={option.label}
                      className={cn(
                        'mt-1.5 line-clamp-2 text-xs leading-4 [&_p]:m-0',
                        active
                          ? ''
                          : validationError
                            ? 'text-dynamic-red/60'
                            : 'text-muted-foreground'
                      )}
                    />
                  ) : null}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex items-center justify-between gap-3 text-muted-foreground text-xs">
            <span className="truncate">{scaleMinLabel}</span>
            <span className="truncate text-right">{scaleMaxLabel}</span>
          </div>
        </div>
      ) : (
        <div
          className={cn(
            'rounded-[1.45rem] border bg-background/55 p-5 shadow-sm',
            validationError ? 'border-dynamic-red/20!' : 'border-border/60'
          )}
        >
          <div className="flex flex-wrap items-center justify-center gap-2.5">
            {displayScaleOptions.map((option) => {
              const score = Number(option.value);
              const active =
                !Number.isNaN(score) &&
                !Number.isNaN(selectedScaleNumber) &&
                score <= selectedScaleNumber;
              const selected = String(value ?? '') === option.value;

              return (
                <button
                  key={option.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    if (selected) {
                      onChange('');
                      return;
                    }
                    onChange(option.value);
                  }}
                  className={cn(
                    'group flex h-14 w-14 items-center justify-center rounded-[1.15rem] border focus-visible:outline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                    disabled
                      ? 'cursor-default opacity-75'
                      : 'transition-all duration-300 hover:scale-[1.1] hover:border-foreground/20 active:scale-[0.9]',
                    selected
                      ? cn(
                          toneClasses.selectedOptionClassName,
                          'shadow-sm ring-1 ring-current/20'
                        )
                      : validationError
                        ? cn(
                            'border-dynamic-red/25! bg-background/40',
                            disabled
                              ? ''
                              : 'hover:border-dynamic-red/40! hover:bg-background/60'
                          )
                        : cn(
                            toneClasses.optionCardClassName,
                            disabled
                              ? ''
                              : 'hover:bg-background/80 hover:shadow-sm'
                          )
                  )}
                  aria-label={normalizeMarkdownToText(option.label)}
                  aria-pressed={selected}
                >
                  <Star
                    className={cn(
                      'h-7 w-7 transition',
                      selected
                        ? 'fill-current'
                        : active
                          ? 'fill-current/60'
                          : 'fill-transparent',
                      validationError && !active ? 'text-dynamic-red/40' : ''
                    )}
                  />
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex items-center justify-between gap-3 text-muted-foreground text-xs">
            <span className="truncate">{scaleMinLabel}</span>
            <span className="truncate text-right">{scaleMaxLabel}</span>
          </div>
          {hasCustomScaleLabels &&
          selectedScaleOption &&
          selectedScaleOption.label !== selectedScaleOption.value ? (
            <FormsMarkdown
              content={selectedScaleOption.label}
              className={cn(
                'mt-3 text-center text-sm [&_p]:m-0',
                validationError
                  ? 'text-dynamic-red/70'
                  : 'text-muted-foreground'
              )}
            />
          ) : null}
        </div>
      )}
    </div>
  ) : null;
}
