'use client';

import { Mail } from '@tuturuuu/icons/lucide-static';
import { Button } from '@tuturuuu/ui/button';
import { LoadingIndicator } from '@tuturuuu/ui/custom/loading-indicator';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@tuturuuu/ui/form';
import type { UseFormReturn } from '@tuturuuu/ui/hooks/use-form';
import { Input } from '@tuturuuu/ui/input';
import { useTranslations } from 'next-intl';
import { type ReactNode, useId } from 'react';
import { type LoginMethod, useLastLoginMethod } from './last-login-method';
import { LoginMethodSeparator } from './login-form-parts';
import { PasskeyLoginButton } from './passkey-login-button';
import { SignInAlternatives } from './sign-in-methods';
import { arrangeSignInMethodStack } from './sign-in-method-stack';
import { TurnstilePill } from './turnstile-pill';
import type { TurnstilePillState } from './turnstile-pill-state';

export type IdentifyStepPasskey = {
  canRenderTurnstile: boolean;
  captchaToken?: string;
  onAuthenticated: () => Promise<void>;
  onCaptchaReset: () => void;
  requiresTurnstile: boolean;
};

export type IdentifyStepTurnstile = {
  detail?: string;
  onRetry: () => void;
  state: TurnstilePillState | null;
  /** The widget slot, or a placeholder while it may not render yet. */
  widget: ReactNode;
};

/**
 * The email-first sign-in step: the email field and its Continue, the
 * security check, then Google, passkey and "More options". Presentation only;
 * every handler, the captcha token and the disabled rules come from the form.
 */
export function IdentifyStep({
  autoFocusEmail,
  continueDisabled,
  emailForm,
  loading,
  normalizedPreviewEmail,
  onBlurUsername,
  onChooseProvider,
  onEmailInput,
  onSubmit,
  onUsePassword,
  passkey,
  pending,
  turnstile,
  usePasswordAvailable,
}: {
  autoFocusEmail: boolean;
  continueDisabled: boolean;
  emailForm: UseFormReturn<{ email: string }>;
  loading: boolean;
  normalizedPreviewEmail: string | null;
  onBlurUsername: () => void;
  onChooseProvider: (method: LoginMethod) => void;
  onEmailInput: (value: string) => void;
  onSubmit: () => void;
  onUsePassword: () => void;
  passkey: IdentifyStepPasskey;
  /** Loading or resolving the email mode; the Continue shows a spinner. */
  pending: boolean;
  turnstile: IdentifyStepTurnstile;
  usePasswordAvailable: boolean;
}) {
  const t = useTranslations();
  const turnstileDetailId = useId();
  const lastUsed = useLastLoginMethod();
  const { emailLastUsed } = arrangeSignInMethodStack(lastUsed);

  return (
    <div className="flex flex-col gap-5">
      <Form {...emailForm}>
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <FormField
            control={emailForm.control}
            name="email"
            render={({ field }) => (
              <FormItem className="gap-1.5">
                <div className="flex min-h-6 items-center justify-between gap-2">
                  <FormLabel className="font-bold text-[13px]">
                    {t('login.email_or_username')}
                  </FormLabel>
                  {emailLastUsed ? (
                    <span className="inline-flex h-6 items-center rounded-full bg-calendar-bg-blue px-2.5 font-bold text-dynamic-blue text-xs">
                      {t('login.last_used')}
                    </span>
                  ) : null}
                </div>
                <FormControl>
                  <div className="group relative">
                    <Mail
                      aria-hidden
                      className="pointer-events-none absolute top-1/2 left-4 size-[18px] -translate-y-1/2 text-muted-foreground"
                    />
                    <Input
                      autoComplete="username"
                      autoFocus={autoFocusEmail}
                      className={`h-12 bg-card pl-11 text-base md:text-base ${
                        normalizedPreviewEmail ? 'pr-36' : ''
                      }`}
                      disabled={loading}
                      inputMode="email"
                      placeholder={t('login.email_username_placeholder')}
                      value={field.value}
                      onBlur={() => {
                        if (field.value.trim() && !field.value.includes('@')) {
                          onBlurUsername();
                        }
                        field.onBlur();
                      }}
                      onChange={(event) => {
                        field.onChange(event.target.value);
                        onEmailInput(event.target.value);
                      }}
                    />
                    {normalizedPreviewEmail ? (
                      <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
                        <span className="rounded-full bg-secondary px-2.5 py-1 font-semibold text-muted-foreground text-xs">
                          @tuturuuu.com
                        </span>
                      </div>
                    ) : null}
                  </div>
                </FormControl>
                <FormMessage />
                {normalizedPreviewEmail ? (
                  <FormDescription className="text-xs">
                    {t('login.will_sign_in_as')}{' '}
                    <span className="font-semibold text-foreground">
                      {normalizedPreviewEmail}
                    </span>
                  </FormDescription>
                ) : null}
              </FormItem>
            )}
          />

          <Button
            className="h-12 w-full rounded-full font-semibold text-[15px]"
            disabled={continueDisabled}
            type="submit"
          >
            {pending ? (
              <span className="flex items-center gap-2">
                <LoadingIndicator className="h-4 w-4" />
                <span>{t('common.loading')}...</span>
              </span>
            ) : (
              t('login.continue_with_email')
            )}
          </Button>

          {usePasswordAvailable ? (
            <Button
              className="h-11 w-full rounded-full"
              disabled={pending}
              onClick={onUsePassword}
              type="button"
              variant="ghost"
            >
              {t('login.use_password_instead')}
            </Button>
          ) : null}

          {turnstile.state ? (
            <TurnstilePill
              detail={turnstile.detail}
              detailId={turnstileDetailId}
              onRetry={turnstile.onRetry}
              state={turnstile.state}
            >
              {turnstile.state === 'unavailable' ? null : turnstile.widget}
            </TurnstilePill>
          ) : null}
        </form>
      </Form>

      <LoginMethodSeparator label={t('login.or')} />

      <SignInAlternatives
        disabled={loading}
        lastUsed={lastUsed}
        onChoose={onChooseProvider}
        renderPasskey={(badge) => (
          <PasskeyLoginButton
            badge={badge}
            canRenderTurnstile={passkey.canRenderTurnstile}
            captchaToken={passkey.captchaToken}
            disabled={loading}
            onAuthenticated={passkey.onAuthenticated}
            onCaptchaReset={passkey.onCaptchaReset}
            requiresTurnstile={passkey.requiresTurnstile}
            turnstileDescribedBy={
              turnstile.detail &&
              (turnstile.state === 'failed' ||
                turnstile.state === 'unavailable')
                ? turnstileDetailId
                : undefined
            }
          />
        )}
      />
    </div>
  );
}
