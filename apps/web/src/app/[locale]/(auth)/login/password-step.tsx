'use client';

import { Eye, EyeOff } from '@tuturuuu/icons/lucide-static';
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
import { Input } from '@tuturuuu/ui/input';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { AuthInlineError } from './auth-inline-error';
import {
  AuthBackButton,
  AuthStateCard,
  AuthTextButton,
} from './auth-state-card';
import type { IdentifyStepTurnstile } from './identify-step';
import { StepTurnstile } from './step-turnstile';

type PasswordValues = { email: string; password: string };

/**
 * The password step: back to the other methods, the email as a chip, the
 * password with a show/hide toggle, the security check, Sign in and "Email
 * me a code instead". Presentation only; the credentials, rate limit and
 * captcha rules stay in the login form.
 */
export function PasswordStep({
  form,
  loading,
  onBack,
  onSubmit,
  onToggleShowPassword,
  onUseCode,
  rateLimit,
  showPassword,
  submitDisabled,
  turnstile,
}: {
  form: UseFormReturn<PasswordValues>;
  loading: boolean;
  onBack: () => void;
  onSubmit: (data: PasswordValues) => void | Promise<void>;
  onToggleShowPassword: () => void;
  /** Absent when email codes are off for this deployment. */
  onUseCode: (() => void) | null;
  rateLimit: ReactNode;
  showPassword: boolean;
  submitDisabled: boolean;
  turnstile: IdentifyStepTurnstile;
}) {
  const t = useTranslations();

  return (
    <AuthStateCard
      align="start"
      lead={
        <AuthBackButton
          disabled={loading}
          label={t('login.other_sign_in_methods')}
          onClick={onBack}
        />
      }
      testId="password-step"
      title={t('login.password_title')}
    >
      <Form {...form}>
        <form
          className="flex flex-col gap-4"
          onSubmit={form.handleSubmit(onSubmit)}
        >
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem className="-mt-2">
                <FormLabel className="sr-only">{t('login.email')}</FormLabel>
                <FormControl>
                  {/* Read-only, but kept as a field so password managers
                      pair the saved password with this account. */}
                  <Input
                    {...field}
                    aria-readonly="true"
                    autoComplete="username"
                    className="h-8 w-auto max-w-full self-start rounded-full border-0 bg-secondary px-3 font-semibold text-muted-foreground text-xs shadow-none"
                    readOnly
                    size={Math.max(8, field.value.length)}
                    tabIndex={-1}
                  />
                </FormControl>
              </FormItem>
            )}
          />
          <AuthInlineError busy={loading} />
          <FormField
            control={form.control}
            name="password"
            render={({ field, fieldState }) => (
              <FormItem>
                <FormLabel className="font-semibold text-sm">
                  {t('login.password')}
                </FormLabel>
                <div className="relative">
                  <FormControl>
                    <Input
                      autoComplete="current-password"
                      className="h-12 rounded-2xl pr-12"
                      placeholder={t('login.password_placeholder')}
                      type={showPassword ? 'text' : 'password'}
                      {...field}
                      aria-invalid={Boolean(fieldState.error) || undefined}
                      disabled={loading}
                    />
                  </FormControl>
                  <button
                    aria-label={
                      showPassword
                        ? t('login.hide_password')
                        : t('login.show_password')
                    }
                    aria-pressed={showPassword}
                    className="absolute top-0 right-0 flex size-12 items-center justify-center rounded-2xl text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-4"
                    onClick={onToggleShowPassword}
                    type="button"
                  >
                    {showPassword ? (
                      <EyeOff aria-hidden className="size-4" />
                    ) : (
                      <Eye aria-hidden className="size-4" />
                    )}
                  </button>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
          <StepTurnstile turnstile={turnstile} />
          <Button
            className="h-12 w-full rounded-2xl font-bold"
            disabled={submitDisabled}
            type="submit"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <LoadingIndicator className="size-4" />
                {t('common.loading')}...
              </span>
            ) : (
              t('login.sign_in')
            )}
          </Button>
          {onUseCode ? (
            <AuthTextButton
              className="self-center"
              disabled={loading}
              onClick={onUseCode}
            >
              {t('login.use_code_instead')}
            </AuthTextButton>
          ) : null}
        </form>
      </Form>
      {rateLimit}
    </AuthStateCard>
  );
}
