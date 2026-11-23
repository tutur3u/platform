'use client';

import { Button } from '@tuturuuu/ui/button';
import { LoadingIndicator } from '@tuturuuu/ui/custom/loading-indicator';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@tuturuuu/ui/form';
import type { UseFormReturn } from '@tuturuuu/ui/hooks/use-form';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { AuthCodeField } from './auth-code-field';
import { EmailCodeIllustration } from './auth-illustrations';
import { AuthInlineError } from './auth-inline-error';
import {
  AuthBackButton,
  AuthStateCard,
  AuthTextButton,
} from './auth-state-card';
import type { IdentifyStepTurnstile } from './identify-step';
import { StepTurnstile } from './step-turnstile';

/** `0:42` for a cooldown in seconds. */
export function formatCountdown(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}

/**
 * The email code step: back to the other methods, the email illustration,
 * the 3 + 3 code, Verify, the resend countdown and "Use password instead".
 * Presentation only; sending, verifying, cooldowns and the captcha token
 * stay in the login form.
 */
export function OtpStep({
  email,
  form,
  loading,
  onBack,
  onResend,
  onSubmit,
  onUsePassword,
  rateLimit,
  resendDisabled,
  retryAfterSeconds,
  turnstile,
}: {
  email: string;
  form: UseFormReturn<{ otp: string }>;
  loading: boolean;
  onBack: () => void;
  onResend: () => void;
  onSubmit: (data: { otp: string }) => void | Promise<void>;
  onUsePassword: () => void;
  rateLimit: ReactNode;
  resendDisabled: boolean;
  retryAfterSeconds: number;
  turnstile: IdentifyStepTurnstile;
}) {
  const t = useTranslations();
  const code = form.watch('otp');

  return (
    <AuthStateCard
      description={
        <>
          {t('login.check_email_sent_to')}{' '}
          <b className="break-all font-bold text-foreground">{email}</b>
        </>
      }
      illustration={<EmailCodeIllustration />}
      lead={
        <AuthBackButton
          disabled={loading}
          label={t('login.other_sign_in_methods')}
          onClick={onBack}
        />
      }
      testId="otp-step"
      title={t('login.check_email_title')}
    >
      <AuthInlineError busy={loading} />
      <Form {...form}>
        <form
          className="flex flex-col gap-4"
          onSubmit={form.handleSubmit(onSubmit)}
        >
          <FormField
            control={form.control}
            name="otp"
            render={({ field, fieldState }) => (
              <FormItem>
                <FormLabel className="sr-only">
                  {t('login.verification_code_label')}
                </FormLabel>
                <FormControl>
                  <AuthCodeField
                    disabled={loading}
                    idPrefix="otp"
                    invalid={Boolean(fieldState.error)}
                    name={field.name}
                    onBlur={field.onBlur}
                    onChange={field.onChange}
                    ref={field.ref}
                    value={field.value}
                  />
                </FormControl>
                <FormMessage className="text-center" />
              </FormItem>
            )}
          />
          <Button
            className="h-12 w-full rounded-2xl font-bold"
            disabled={loading || code.length !== 6}
            type="submit"
            aria-busy={loading}
          >
            {loading ? <LoadingIndicator className="size-4" /> : null}
            {t('login.verify_button')}
            {loading ? (
              <span className="sr-only">{t('common.loading')}</span>
            ) : null}
          </Button>
          <StepTurnstile turnstile={turnstile} />
          <div className="flex flex-wrap items-center justify-between gap-x-4">
            {retryAfterSeconds > 0 ? (
              <span
                className="inline-flex min-h-11 items-center text-muted-foreground text-sm"
                role="timer"
              >
                {t('login.resend_countdown', {
                  time: formatCountdown(retryAfterSeconds),
                })}
              </span>
            ) : (
              <AuthTextButton disabled={resendDisabled} onClick={onResend}>
                {t('login.resend')}
              </AuthTextButton>
            )}
            <AuthTextButton disabled={loading} onClick={onUsePassword}>
              {t('login.use_password_instead')}
            </AuthTextButton>
          </div>
        </form>
      </Form>
      {rateLimit}
    </AuthStateCard>
  );
}
