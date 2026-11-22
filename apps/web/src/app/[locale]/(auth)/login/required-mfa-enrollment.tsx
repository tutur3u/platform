'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { createClient } from '@tuturuuu/supabase/next/client';
import { Button } from '@tuturuuu/ui/button';
import { LoadingIndicator } from '@tuturuuu/ui/custom/loading-indicator';
import { requiresFreshPrimaryForMfa } from '@tuturuuu/utils/required-mfa-policy';
import { useTranslations } from 'next-intl';
import { type ReactNode, useState } from 'react';
import { AuthCodeField } from './auth-code-field';
import { ConfirmIdentityIllustration } from './auth-illustrations';
import { AuthStateCard, AuthTextButton } from './auth-state-card';
import {
  EnrollmentSetupKey,
  EnrollmentStepBar,
} from './required-mfa-enrollment-parts';

/** Enrollment stays on the login surface, reachable before database access. */
export function RequiredMfaEnrollment({
  children,
  onVerified,
}: {
  children: ReactNode;
  onVerified(): Promise<void>;
}) {
  const t = useTranslations('login');
  const [client] = useState(() => createClient());
  const [code, setCode] = useState('');
  const factors = useQuery({
    queryKey: ['login-mfa-enrollment-factors'],
    staleTime: 0,
    gcTime: 0,
    queryFn: async () => {
      const { data, error } = await client.auth.mfa.listFactors();
      if (error) throw error;
      const user = await client.auth.getUser();
      const claims = await client.auth.getClaims();
      if (
        user.error ||
        claims.error ||
        !user.data.user ||
        claims.data?.claims.sub !== user.data.user.id
      )
        throw new Error('Unable to verify session');
      return {
        factors: data.totp.filter((factor) => factor.status === 'verified'),
        primaryRequired: requiresFreshPrimaryForMfa(
          user.data.user.app_metadata,
          claims.data.claims
        ),
      };
    },
  });
  const enroll = useMutation({
    mutationFn: async () => {
      const { data, error } = await client.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: `${t('required_mfa_authenticator')} ${Date.now()}`,
      });
      if (error) throw error;
      return data;
    },
  });
  const verify = useMutation({
    mutationFn: async () => {
      if (!enroll.data) return;
      const { error } = await client.auth.mfa.challengeAndVerify({
        factorId: enroll.data.id,
        code,
      });
      if (error) throw error;
      await onVerified();
    },
  });
  const signInAgain = async () => {
    await client.auth.signOut({ scope: 'local' });
    window.location.assign('/login');
  };
  const signOut = async () => {
    await client.auth.signOut();
    window.location.assign('/login');
  };
  if (factors.data?.primaryRequired)
    return (
      <AuthStateCard
        description={t('required_mfa_recovery_description')}
        illustration={<ConfirmIdentityIllustration />}
        testId="required-mfa-sign-in-again"
        title={t('required_mfa_recovery_title')}
      >
        <Button
          className="h-12 w-full rounded-2xl font-bold"
          onClick={() => void signInAgain()}
        >
          {t('required_mfa_sign_in_again')}
        </Button>
      </AuthStateCard>
    );
  if (factors.data?.factors.length) return children;
  if (factors.isPending)
    return (
      <p
        className="flex items-center justify-center gap-2 py-8 text-muted-foreground text-sm"
        role="status"
      >
        <LoadingIndicator aria-hidden className="size-4" />
        {t('required_mfa_loading')}
      </p>
    );
  const failed = factors.isError || enroll.isError || verify.isError;
  return (
    <AuthStateCard
      align="start"
      lead={
        <EnrollmentStepBar
          current={verify.isSuccess ? 3 : enroll.data ? 2 : 1}
        />
      }
      description={
        enroll.data
          ? t('required_mfa_scan_description')
          : t('required_mfa_enroll_description')
      }
      testId="required-mfa-enrollment"
      title={t('required_mfa_enroll_title')}
    >
      {failed ? (
        <p
          className="rounded-2xl bg-dynamic-red/10 px-3.5 py-3 font-semibold text-dynamic-red text-sm"
          role="alert"
        >
          {t('required_mfa_error')}
        </p>
      ) : null}
      {factors.isError ? (
        <Button
          className="h-12 w-full rounded-2xl font-bold"
          onClick={() => factors.refetch()}
        >
          {t('required_mfa_retry')}
        </Button>
      ) : enroll.data ? (
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            verify.mutate();
          }}
        >
          <EnrollmentSetupKey
            secret={enroll.data.totp.secret}
            uri={enroll.data.totp.uri}
          />
          <div className="flex flex-col gap-2">
            <label
              className="font-semibold text-sm"
              htmlFor="required-mfa-code"
            >
              {t('required_mfa_code_label')}
            </label>
            <AuthCodeField
              align="start"
              disabled={verify.isPending}
              id="required-mfa-code"
              idPrefix="required-mfa"
              invalid={verify.isError}
              onChange={(value) => setCode(value.replace(/\D/g, ''))}
              value={code}
            />
          </div>
          <Button
            className="h-12 w-full rounded-2xl font-bold"
            disabled={code.length !== 6 || verify.isPending}
            type="submit"
          >
            {verify.isPending ? <LoadingIndicator className="size-4" /> : null}
            {t('required_mfa_turn_on')}
          </Button>
        </form>
      ) : (
        <Button
          className="h-12 w-full rounded-2xl font-bold"
          disabled={enroll.isPending}
          onClick={() => enroll.mutate()}
        >
          {enroll.isPending ? <LoadingIndicator className="size-4" /> : null}
          {t('required_mfa_start')}
        </Button>
      )}
      <AuthTextButton className="self-center" onClick={() => void signOut()}>
        {t('required_mfa_sign_out')}
      </AuthTextButton>
    </AuthStateCard>
  );
}
