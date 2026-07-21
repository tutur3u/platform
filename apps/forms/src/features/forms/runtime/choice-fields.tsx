'use client';

import { ZoomIn } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@tuturuuu/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@tuturuuu/ui/select';
import { cn } from '@tuturuuu/utils/format';
import Image from 'next/image';
import { normalizeMarkdownToText } from '../content';
import { FormsMarkdown } from '../forms-markdown';
import type { FormAnswerValue, FormDefinitionQuestion } from '../types';
import type { FormsTranslator, FormToneClasses } from './types';
import { hasOptionImage } from './utils';

type ChoiceFieldArgs = {
  question: FormDefinitionQuestion;
  value: FormAnswerValue | undefined;
  onChange: (value: FormAnswerValue) => void;
  onImagePreview: (image: { src: string; alt: string }) => void;
  disabled: boolean;
  validationError?: string;
  toneClasses: FormToneClasses;
  t: FormsTranslator;
  choiceLayoutClassName: string;
  interactionStateClassName: string;
};

export function renderSingleChoiceField({
  question,
  value,
  onChange,
  onImagePreview,
  disabled,
  validationError,
  toneClasses,
  t,
  choiceLayoutClassName,
  interactionStateClassName,
}: ChoiceFieldArgs) {
  return question.type === 'single_choice' ? (
    <RadioGroup
      value={typeof value === 'string' ? value : ''}
      disabled={disabled}
      onValueChange={(nextValue) => {
        onChange(nextValue);
      }}
      className={choiceLayoutClassName}
    >
      {question.options.map((option) => (
        <label
          key={option.id}
          className={cn(
            'flex h-full rounded-2xl border p-4',
            interactionStateClassName,
            value === option.value
              ? cn(toneClasses.selectedOptionClassName, 'shadow-md')
              : validationError
                ? cn(
                    'border-dynamic-red/30! bg-background/50',
                    disabled ? '' : 'hover:border-dynamic-red/50!'
                  )
                : cn(
                    toneClasses.optionCardClassName,
                    disabled ? '' : 'hover:shadow-sm'
                  )
          )}
        >
          <div className="flex w-full items-start gap-3">
            <RadioGroupItem
              value={option.value}
              id={option.id}
              className={cn(
                'mt-1 shrink-0',
                toneClasses.radioClassName,
                validationError && value !== option.value
                  ? 'border-dynamic-red/40!'
                  : ''
              )}
            />
            <div className="min-w-0 flex-1 space-y-3">
              {hasOptionImage(option) ? (
                <div
                  className={cn(
                    'relative aspect-16/10 overflow-hidden rounded-[1.15rem] border bg-background/70',
                    validationError && value !== option.value
                      ? 'border-dynamic-red/30!'
                      : 'border-border/60'
                  )}
                >
                  <Image
                    src={option.image.url}
                    alt={
                      option.image.alt ||
                      normalizeMarkdownToText(option.label) ||
                      option.value
                    }
                    fill
                    unoptimized
                    className="object-cover"
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="secondary"
                    className="absolute top-3 right-3 h-9 w-9 rounded-full bg-background/85 shadow-sm backdrop-blur-sm"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      onImagePreview({
                        src: option.image.url,
                        alt:
                          option.image.alt ||
                          normalizeMarkdownToText(option.label) ||
                          option.value,
                      });
                    }}
                  >
                    <ZoomIn className="h-4 w-4" />
                    <span className="sr-only">
                      {t('runtime.view_image_fullscreen')}
                    </span>
                  </Button>
                </div>
              ) : null}
              <div className="flex items-start gap-2">
                <FormsMarkdown
                  content={option.label}
                  className={cn(
                    'min-w-0 font-medium text-sm [&_p]:m-0 [&_p]:leading-6',
                    validationError && value !== option.value
                      ? 'text-dynamic-red/80'
                      : ''
                  )}
                />
              </div>
            </div>
          </div>
        </label>
      ))}
    </RadioGroup>
  ) : null;
}

export function renderMultipleChoiceField({
  question,
  value,
  onChange,
  onImagePreview,
  disabled,
  validationError,
  toneClasses,
  t,
  choiceLayoutClassName,
  interactionStateClassName,
}: ChoiceFieldArgs) {
  return question.type === 'multiple_choice' ? (
    <div className={choiceLayoutClassName}>
      {question.options.map((option) => {
        const checked = Array.isArray(value)
          ? value.includes(option.value)
          : false;

        return (
          <label
            key={option.id}
            className={cn(
              'flex h-full rounded-2xl border p-4',
              interactionStateClassName,
              checked
                ? cn(toneClasses.selectedOptionClassName, 'shadow-md')
                : validationError
                  ? cn(
                      'border-dynamic-red/30! bg-background/50',
                      disabled ? '' : 'hover:border-dynamic-red/50!'
                    )
                  : cn(
                      toneClasses.optionCardClassName,
                      disabled ? '' : 'hover:shadow-sm'
                    )
            )}
          >
            <div className="flex w-full items-start gap-3">
              <Checkbox
                checked={checked}
                className={cn(
                  'mt-1 shrink-0',
                  toneClasses.checkboxClassName,
                  validationError && !checked ? 'border-dynamic-red/40!' : ''
                )}
                disabled={disabled}
                onCheckedChange={(nextChecked) => {
                  const nextValue = new Set(Array.isArray(value) ? value : []);
                  if (nextChecked) {
                    nextValue.add(option.value);
                  } else {
                    nextValue.delete(option.value);
                  }
                  onChange([...nextValue]);
                }}
              />
              <div className="min-w-0 flex-1 space-y-3">
                {hasOptionImage(option) ? (
                  <div
                    className={cn(
                      'relative aspect-16/10 overflow-hidden rounded-[1.15rem] border bg-background/70',
                      validationError && !checked
                        ? 'border-dynamic-red/30!'
                        : 'border-border/60'
                    )}
                  >
                    <Image
                      src={option.image.url}
                      alt={
                        option.image.alt ||
                        normalizeMarkdownToText(option.label) ||
                        option.value
                      }
                      fill
                      unoptimized
                      className="object-cover"
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="secondary"
                      className="absolute top-3 right-3 h-9 w-9 rounded-full bg-background/85 shadow-sm backdrop-blur-sm"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        onImagePreview({
                          src: option.image.url,
                          alt:
                            option.image.alt ||
                            normalizeMarkdownToText(option.label) ||
                            option.value,
                        });
                      }}
                    >
                      <ZoomIn className="h-4 w-4" />
                      <span className="sr-only">
                        {t('runtime.view_image_fullscreen')}
                      </span>
                    </Button>
                  </div>
                ) : null}
                <div className="flex items-start gap-2">
                  <FormsMarkdown
                    content={option.label}
                    className={cn(
                      'min-w-0 font-medium text-sm [&_p]:m-0 [&_p]:leading-6',
                      validationError && !checked ? 'text-dynamic-red/80' : ''
                    )}
                  />
                </div>
              </div>
            </div>
          </label>
        );
      })}
    </div>
  ) : null;
}

export function renderDropdownField({
  question,
  value,
  onChange,
  disabled,
  validationError,
  toneClasses,
  t,
  selectedDropdownOption,
}: {
  question: FormDefinitionQuestion;
  value: FormAnswerValue | undefined;
  onChange: (value: FormAnswerValue) => void;
  disabled: boolean;
  validationError?: string;
  toneClasses: FormToneClasses;
  t: FormsTranslator;
  selectedDropdownOption: FormDefinitionQuestion['options'][number] | null;
}) {
  return question.type === 'dropdown' ? (
    <Select
      value={typeof value === 'string' ? value : ''}
      disabled={disabled}
      onValueChange={(nextValue) => {
        onChange(nextValue);
      }}
    >
      <SelectTrigger
        className={cn(
          toneClasses.fieldClassName,
          validationError
            ? 'border-dynamic-red/50! ring-2! ring-dynamic-red/15! focus:border-dynamic-red! focus:ring-dynamic-red/20!'
            : ''
        )}
      >
        {typeof value === 'string' && value ? (
          <div className="flex min-w-0 items-center gap-2">
            {selectedDropdownOption &&
            hasOptionImage(selectedDropdownOption) ? (
              <div
                className={cn(
                  'relative h-8 w-8 shrink-0 overflow-hidden rounded-xl border bg-background/70',
                  validationError
                    ? 'border-dynamic-red/30!'
                    : 'border-border/60'
                )}
              >
                <Image
                  src={selectedDropdownOption.image.url}
                  alt={
                    selectedDropdownOption.image.alt ||
                    selectedDropdownOption.value ||
                    t('runtime.choose_option')
                  }
                  fill
                  unoptimized
                  className="object-cover"
                />
              </div>
            ) : null}
            <FormsMarkdown
              content={selectedDropdownOption?.label ?? value}
              variant="inline"
              className="min-w-0 truncate text-left text-sm"
            />
          </div>
        ) : (
          <span
            className={
              validationError ? 'text-dynamic-red/70' : 'text-muted-foreground'
            }
          >
            {t('runtime.choose_option')}
          </span>
        )}
      </SelectTrigger>
      <SelectContent>
        {question.options.map((option) => (
          <SelectItem key={option.id} value={option.value}>
            <div className="flex min-w-0 items-center gap-2">
              {hasOptionImage(option) ? (
                <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-xl border border-border/60 bg-background/70">
                  <Image
                    src={option.image.url}
                    alt={
                      option.image.alt ||
                      normalizeMarkdownToText(option.label) ||
                      option.value
                    }
                    fill
                    unoptimized
                    className="object-cover"
                  />
                </div>
              ) : null}
              <FormsMarkdown
                content={option.label}
                variant="inline"
                className="min-w-0 text-sm"
              />
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  ) : null;
}
