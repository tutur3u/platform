'use client';

import { cn } from '@tuturuuu/utils/format';
import { Fragment, lazy, type Ref, Suspense } from 'react';
import { InputOTPRowFallback } from './login-form-parts';

const InputOTP = lazy(async () => ({
  default: (await import('@tuturuuu/ui/input-otp')).InputOTP,
}));
const InputOTPGroup = lazy(async () => ({
  default: (await import('@tuturuuu/ui/input-otp')).InputOTPGroup,
}));
const InputOTPSlot = lazy(async () => ({
  default: (await import('@tuturuuu/ui/input-otp')).InputOTPSlot,
}));

const SLOTS = 6;

/**
 * A 6-slot code, split 3 + 3, sized for touch (48px slots). Sorbet strokes
 * each slot with the field role; an invalid code shows the red stroke.
 * Presentation only: the value, change handler and disabled rule come from
 * the owning form field.
 */
export function AuthCodeField({
  align = 'center',
  ariaLabel,
  disabled,
  id,
  idPrefix,
  invalid,
  name,
  onBlur,
  onChange,
  ref,
  value,
}: {
  align?: 'center' | 'start';
  ariaLabel?: string;
  disabled?: boolean;
  /** Lets a visible label name the field. */
  id?: string;
  idPrefix: string;
  invalid?: boolean;
  name?: string;
  onBlur?: () => void;
  onChange: (value: string) => void;
  ref?: Ref<HTMLInputElement>;
  value: string;
}) {
  return (
    <Suspense fallback={<InputOTPRowFallback />}>
      <InputOTP
        aria-invalid={invalid || undefined}
        aria-label={ariaLabel}
        autoComplete="one-time-code"
        containerClassName={cn(
          'w-full',
          align === 'center' ? 'justify-center' : 'justify-start'
        )}
        disabled={disabled}
        id={id}
        inputMode="numeric"
        maxLength={SLOTS}
        name={name}
        onBlur={onBlur}
        onChange={onChange}
        ref={ref}
        value={value}
      >
        <InputOTPGroup className="gap-2">
          {Array.from({ length: SLOTS }).map((_, index) => (
            <Fragment key={`${idPrefix}-${index + 1}`}>
              {index === SLOTS / 2 ? (
                <span aria-hidden className="w-1.5 shrink-0 sm:w-2.5" />
              ) : null}
              <InputOTPSlot
                className={cn(
                  'h-12 w-11 rounded-2xl border font-bold text-lg tabular-nums first:rounded-2xl last:rounded-2xl sm:w-12',
                  invalid && 'border-dynamic-red!'
                )}
                index={index}
              />
            </Fragment>
          ))}
        </InputOTPGroup>
      </InputOTP>
    </Suspense>
  );
}
