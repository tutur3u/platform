'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { createCrossAppReturnUrlWithInternalApi } from '@tuturuuu/internal-api/auth';
import { createAuthClient } from '@tuturuuu/supabase/next/auth-browser';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { mfaProofFromVerifiedClaims } from '@tuturuuu/utils/required-mfa-policy';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { passwordsHandoffTarget } from './target';

export function StepUpClient({
  next,
  userId,
}: {
  next: string;
  userId: string;
}) {
  const t = useTranslations('login');
  const [client] = useState(() => createAuthClient());
  const [code, setCode] = useState('');
  const [selected, setSelected] = useState('');
  const [enrollment, setEnrollment] = useState<{
    id: string;
    secret: string;
  } | null>(null);
  const factors = useQuery({
    queryKey: ['passwords-step-up-factors', userId],
    staleTime: 0,
    gcTime: 0,
    retry: false,
    queryFn: async () => {
      const user = await client.auth.getUser();
      if (user.error || user.data.user?.id !== userId)
        throw new Error('Verification failed');
      const result = await client.auth.mfa.listFactors();
      if (result.error) throw new Error('Verification failed');
      return result.data.totp.filter((factor) => factor.status === 'verified');
    },
  });
  const enroll = useMutation({
    retry: false,
    mutationFn: async () => {
      const user = await client.auth.getUser();
      if (user.error || user.data.user?.id !== userId)
        throw new Error('Verification failed');
      const result = await client.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: `${t('required_mfa_authenticator')} ${Date.now()}`,
      });
      if (result.error) throw new Error('Verification failed');
      setEnrollment({ id: result.data.id, secret: result.data.totp.secret });
    },
  });
  const verify = useMutation({
    retry: false,
    mutationFn: async () => {
      try {
        const factorId = enrollment?.id ?? (selected || factors.data?.[0]?.id);
        if (!factorId || !/^\d{6}$/u.test(code))
          throw new Error('Verification failed');
        const user = await client.auth.getUser();
        if (user.error || user.data.user?.id !== userId)
          throw new Error('Verification failed');
        const challenge = await client.auth.mfa.challengeAndVerify({
          factorId,
          code,
        });
        if (challenge.error) throw new Error('Verification failed');
        setEnrollment(null);
        const refreshed = await client.auth.refreshSession();
        if (refreshed.error) throw new Error('Verification failed');
        const claims = await client.auth.getClaims();
        const proof =
          !claims.error && claims.data?.claims.sub === userId
            ? mfaProofFromVerifiedClaims(claims.data.claims)
            : null;
        if (!proof || proof.verifiedAt + 300 <= Math.floor(Date.now() / 1000))
          throw new Error('Verification failed');
        const result = await createCrossAppReturnUrlWithInternalApi({
          returnUrl: next,
        });
        const location = passwordsHandoffTarget(result.returnUrl, next);
        if (!location) throw new Error('Verification failed');
        window.location.replace(location);
      } finally {
        setCode('');
        // Enrollment secrets never enter the query/mutation cache or browser storage.
        await factors.refetch();
      }
    },
  });
  if (factors.isPending) return <output>{t('required_mfa_loading')}</output>;
  const hasFactor = Boolean(enrollment || factors.data?.length);
  return (
    <section className="space-y-4">
      {(factors.isError || enroll.isError || verify.isError) && (
        <p role="alert" className="text-destructive">
          {t('required_mfa_error')}
        </p>
      )}
      {factors.isError ? (
        <Button onClick={() => factors.refetch()}>
          {t('required_mfa_retry')}
        </Button>
      ) : hasFactor ? (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            verify.mutate();
          }}
        >
          {enrollment && (
            <div className="space-y-2">
              <p>{t('required_mfa_secret_label')}</p>
              <code className="block select-all break-all rounded border p-3">
                {enrollment.secret}
              </code>
            </div>
          )}
          {!enrollment && factors.data && factors.data.length > 1 && (
            <div className="space-y-2">
              <Label htmlFor="passwords-factor">
                {t('required_mfa_authenticator')}
              </Label>
              <select
                id="passwords-factor"
                className="w-full rounded border bg-background p-2"
                value={selected || factors.data[0]?.id}
                onChange={(event) => setSelected(event.target.value)}
                disabled={verify.isPending}
              >
                {factors.data.map((factor) => (
                  <option key={factor.id} value={factor.id}>
                    {factor.friendly_name || t('required_mfa_authenticator')}
                  </option>
                ))}
              </select>
            </div>
          )}
          <Label htmlFor="passwords-totp">{t('verification_code_label')}</Label>
          <Input
            id="passwords-totp"
            autoComplete="one-time-code"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            value={code}
            disabled={verify.isPending}
            onChange={(event) =>
              setCode(event.target.value.replace(/\D/gu, ''))
            }
          />
          <Button
            type="submit"
            disabled={verify.isPending || code.length !== 6}
          >
            {t('required_mfa_verify')}
          </Button>
        </form>
      ) : (
        <Button disabled={enroll.isPending} onClick={() => enroll.mutate()}>
          {t('required_mfa_start')}
        </Button>
      )}
    </section>
  );
}
