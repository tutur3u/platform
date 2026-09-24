'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { createClient } from '@tuturuuu/supabase/next/client';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { requiresFreshPrimaryForMfa } from '@tuturuuu/utils/required-mfa-policy';
import { useTranslations } from 'next-intl';
import { type ReactNode, useState } from 'react';

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
  if (factors.data?.primaryRequired)
    return (
      <section className="space-y-5 rounded-3xl border bg-background p-6">
        <h2 className="font-semibold text-2xl">
          {t('required_mfa_recovery_title')}
        </h2>
        <p>{t('required_mfa_recovery_description')}</p>
        <Button
          onClick={async () => {
            await client.auth.signOut({ scope: 'local' });
            window.location.assign('/login');
          }}
        >
          {t('required_mfa_sign_in_again')}
        </Button>
      </section>
    );
  if (factors.data?.factors.length) return children;
  if (factors.isPending)
    return <p role="status">{t('required_mfa_loading')}</p>;
  return (
    <section className="space-y-5 rounded-3xl border bg-background p-6">
      <h2 className="font-semibold text-2xl">
        {t('required_mfa_enroll_title')}
      </h2>
      <p className="text-muted-foreground text-sm">
        {t('required_mfa_enroll_description')}
      </p>
      {factors.isError || enroll.isError || verify.isError ? (
        <p role="alert" className="text-destructive">
          {t('required_mfa_error')}
        </p>
      ) : null}
      {factors.isError ? (
        <Button onClick={() => factors.refetch()}>
          {t('required_mfa_retry')}
        </Button>
      ) : enroll.data ? (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            verify.mutate();
          }}
        >
          <p className="text-sm">{t('required_mfa_secret_label')}</p>
          <code className="block select-all break-all rounded border p-3">
            {enroll.data.totp.secret}
          </code>
          <Label htmlFor="required-mfa-code">
            {t('verification_code_label')}
          </Label>
          <Input
            id="required-mfa-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            maxLength={6}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
          />
          <Button
            type="submit"
            disabled={code.length !== 6 || verify.isPending}
          >
            {t('required_mfa_verify')}
          </Button>
        </form>
      ) : (
        <Button disabled={enroll.isPending} onClick={() => enroll.mutate()}>
          {t('required_mfa_start')}
        </Button>
      )}
      <Button
        variant="ghost"
        onClick={async () => {
          await client.auth.signOut();
          window.location.assign('/login');
        }}
      >
        {t('required_mfa_sign_out')}
      </Button>
    </section>
  );
}
