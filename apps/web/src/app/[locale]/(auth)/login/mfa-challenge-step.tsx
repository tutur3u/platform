'use client';

import { Smartphone } from '@tuturuuu/icons/lucide-static';
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
import { useLocale, useTranslations } from 'next-intl';
import { AuthCodeField } from './auth-code-field';
import { AuthInlineError } from './auth-inline-error';
import { TwoStepIllustration } from './auth-illustrations';
import { AuthDivider, AuthStateCard } from './auth-state-card';
import type { MobileMfaApprovalChallenge } from './login-form-parts';
import { localizedAuthPath } from './login-footer';

export type MfaChallengeMobileApproval = {
  challenge: MobileMfaApprovalChallenge | null;
  onRequest: () => void;
  pending: boolean;
};

function MobileApprovalPanel({
  disabled,
  mobile,
}: {
  disabled: boolean;
  mobile: MfaChallengeMobileApproval;
}) {
  const t = useTranslations();
  const requestLabel = mobile.challenge
    ? t('login.mobile_mfa_new_code')
    : t('login.mobile_mfa_button');

  return (
    <section
      aria-labelledby="mfa-mobile-approval-title"
      className="flex flex-col gap-2.5 rounded-2xl bg-muted/60 p-3.5"
    >
      <div className="flex items-center justify-between gap-3">
        <h3
          className="flex items-center gap-2 font-bold text-sm"
          id="mfa-mobile-approval-title"
        >
          <Smartphone aria-hidden className="size-4 text-muted-foreground" />
          {t('login.mobile_mfa_title')}
        </h3>
        {mobile.challenge ? (
          <LoadingIndicator aria-hidden className="size-4" />
        ) : null}
      </div>
      <p className="text-muted-foreground text-xs leading-relaxed">
        {t('login.mobile_mfa_description')}
      </p>
      {mobile.challenge ? (
        <div className="flex flex-col gap-0.5">
          <span className="text-muted-foreground text-xs">
            {t('login.mobile_mfa_pair_code_label')}
          </span>
          <span className="font-mono font-semibold text-[28px] tabular-nums tracking-[0.08em]">
            {mobile.challenge.pairCode}
          </span>
          <span className="text-muted-foreground text-xs" role="status">
            {t('login.mobile_mfa_waiting')}
          </span>
        </div>
      ) : null}
      <Button
        className="h-11 self-start rounded-full px-4"
        disabled={mobile.pending || disabled}
        onClick={mobile.onRequest}
        type="button"
        variant="outline"
      >
        {mobile.pending ? (
          <LoadingIndicator className="size-4" />
        ) : (
          requestLabel
        )}
      </Button>
    </section>
  );
}

/**
 * The two-step challenge: the authenticator code, Verify, the mobile
 * approval panel and Sign out. Presentation only; the verify handler,
 * the pair code and its polling stay in the login form. `mobile` is null
 * when an approval cannot satisfy the request (the SSO consent's mfa=totp
 * step-up).
 */
export function MfaChallengeStep({
  form,
  loading,
  mobile,
  onSubmit,
  stepUp,
}: {
  form: UseFormReturn<{ totp: string }>;
  loading: boolean;
  mobile: MfaChallengeMobileApproval | null;
  onSubmit: (data: { totp: string }) => void | Promise<void>;
  stepUp: boolean;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const code = form.watch('totp');

  return (
    <AuthStateCard
      description={
        stepUp
          ? t('login.mfa_step_up_description')
          : t('login.enter_authenticator_code')
      }
      illustration={<TwoStepIllustration />}
      testId="mfa-challenge-step"
      title={t('login.two_factor_authentication')}
    >
      <AuthInlineError busy={loading} />
      <Form {...form}>
        <form
          className="flex flex-col gap-4"
          onSubmit={form.handleSubmit(onSubmit)}
        >
          <FormField
            control={form.control}
            name="totp"
            render={({ field, fieldState }) => (
              <FormItem>
                <FormLabel className="sr-only">
                  {t('login.verification_code_label')}
                </FormLabel>
                <FormControl>
                  <AuthCodeField
                    disabled={loading}
                    idPrefix="totp"
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
        </form>
      </Form>
      {mobile ? (
        <>
          <AuthDivider label={t('common.or')} />
          <MobileApprovalPanel disabled={loading} mobile={mobile} />
        </>
      ) : null}
      <a
        className="inline-flex min-h-11 items-center self-center rounded-full px-2 font-semibold text-muted-foreground text-sm underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
        href={localizedAuthPath('/logout', locale)}
      >
        {t('login.required_mfa_sign_out')}
      </a>
    </AuthStateCard>
  );
}
