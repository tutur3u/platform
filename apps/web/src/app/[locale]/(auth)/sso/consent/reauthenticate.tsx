'use client';

import { useMutation } from '@tanstack/react-query';
import { createClient } from '@tuturuuu/supabase/next/client';
import { Button } from '@tuturuuu/ui/button';
import { LoadingIndicator } from '@tuturuuu/ui/custom/loading-indicator';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { AuthCodeField } from '../../login/auth-code-field';
import { ConfirmIdentityIllustration } from '../../login/auth-illustrations';
import { AuthStateCard } from '../../login/auth-state-card';
import { RequiredMfaEnrollment } from '../../login/required-mfa-enrollment';

/**
 * "Confirm it's you": a fresh authenticator code for the SSO consent, or a
 * fresh sign-in instead. Reuses the account enrollment surface and the
 * provider challenge service; the server re-checks everything on refresh.
 */
export function Reauthenticate({
  description,
  loginPath,
}: {
  /** The consent screen's own explanation, resolved on the server. */
  description?: string;
  loginPath: string;
}) {
  const t = useTranslations('login');
  const router = useRouter();
  const [client] = useState(() => createClient());
  const [code, setCode] = useState('');
  const verified = async () => {
    setCode('');
    router.refresh();
  };
  const verify = useMutation({
    mutationFn: async () => {
      const { data, error } = await client.auth.mfa.listFactors();
      if (error) throw error;
      const factor = data.totp.find((f) => f.status === 'verified');
      if (!factor) throw new Error('MFA required');
      const result = await client.auth.mfa.challengeAndVerify({
        factorId: factor.id,
        code,
      });
      if (result.error) throw result.error;
      await verified();
    },
  });
  const signInAgain = async () => {
    await client.auth.signOut({ scope: 'local' });
    window.location.assign(loginPath);
  };
  return (
    <>
      <RequiredMfaEnrollment onVerified={verified}>
        <AuthStateCard
          description={description ?? t('mfa_step_up_description')}
          illustration={<ConfirmIdentityIllustration />}
          testId="sso-reauthenticate"
          title={t('reauthenticate_title')}
          titleAs="h1"
        >
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              verify.mutate();
            }}
          >
            <label className="sr-only" htmlFor="sso-totp">
              {t('verification_code_label')}
            </label>
            <AuthCodeField
              disabled={verify.isPending}
              id="sso-totp"
              idPrefix="sso-totp"
              invalid={verify.isError}
              onChange={setCode}
              value={code}
            />
            {verify.isError && (
              <p
                className="rounded-2xl bg-dynamic-red/10 px-3.5 py-3 font-semibold text-dynamic-red text-sm"
                role="alert"
              >
                {t('required_mfa_error')}
              </p>
            )}
            <Button
              className="h-12 w-full rounded-2xl font-bold"
              disabled={verify.isPending || !/^\d{6}$/.test(code)}
              type="submit"
            >
              {verify.isPending ? (
                <LoadingIndicator className="size-4" />
              ) : null}
              {t('required_mfa_verify')}
            </Button>
          </form>
        </AuthStateCard>
      </RequiredMfaEnrollment>
      {/* Outside the enrolment surface, as before: always available. */}
      <Button
        className="h-12 w-full rounded-2xl font-bold"
        onClick={() => void signInAgain()}
        variant="ghost"
      >
        {t('reauthenticate_sign_in_instead')}
      </Button>
    </>
  );
}
