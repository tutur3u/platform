'use client';

import { Input } from '@tuturuuu/ui/input';
import { cn } from '@tuturuuu/utils/format';
import type { FormAnswerValue, FormDefinitionQuestion } from '../types';
import type { FormsTranslator, FormToneClasses } from './types';

/**
 * Types that render one line of text and differ only in what the browser is
 * told about the value. Getting this mapping right is most of the mobile
 * experience: `inputMode` picks the on-screen keyboard, and `autoComplete`
 * decides whether the respondent can fill the field from their saved contact.
 */
const INPUT_ATTRIBUTES = {
  email: {
    type: 'email',
    inputMode: 'email',
    autoComplete: 'email',
  },
  phone: {
    type: 'tel',
    inputMode: 'tel',
    autoComplete: 'tel',
  },
  url: {
    type: 'url',
    inputMode: 'url',
    autoComplete: 'url',
  },
  number: {
    // `inputMode="decimal"` rather than `numeric`: `numeric` hides the decimal
    // point on iOS, which silently makes non-integer answers untypeable.
    type: 'number',
    inputMode: 'decimal',
    autoComplete: 'off',
  },
} as const satisfies Record<
  string,
  { type: string; inputMode: string; autoComplete: string }
>;

type TypedInputType = keyof typeof INPUT_ATTRIBUTES;

function isTypedInput(type: string): type is TypedInputType {
  return type in INPUT_ATTRIBUTES;
}

export function renderTypedTextField({
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
  if (!isTypedInput(question.type)) return null;

  const attributes = INPUT_ATTRIBUTES[question.type];
  const settings = question.settings ?? {};
  const isNumber = question.type === 'number';

  return (
    <Input
      type={attributes.type}
      inputMode={attributes.inputMode}
      autoComplete={attributes.autoComplete}
      value={typeof value === 'string' ? value : ''}
      placeholder={
        settings.placeholder || t(`runtime.placeholder_${question.type}`)
      }
      onChange={(event) => onChange(event.target.value)}
      // Native number inputs clamp and step from these, which keeps the
      // spinner honest before validation ever runs.
      min={
        isNumber && settings.validationMin != null
          ? settings.validationMin
          : undefined
      }
      max={
        isNumber && settings.validationMax != null
          ? settings.validationMax
          : undefined
      }
      step={
        isNumber && settings.numberStep != null
          ? settings.numberStep
          : undefined
      }
      className={cn(
        toneClasses.fieldClassName,
        validationError
          ? 'border-dynamic-red/50! ring-2! ring-dynamic-red/15! focus-visible:border-dynamic-red! focus-visible:ring-dynamic-red/20!'
          : ''
      )}
      disabled={disabled}
      aria-invalid={validationError ? true : undefined}
    />
  );
}
