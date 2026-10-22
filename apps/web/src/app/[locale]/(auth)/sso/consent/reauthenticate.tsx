'use client';

import { useMutation } from '@tanstack/react-query';
import { createClient } from '@tuturuuu/supabase/next/client';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { RequiredMfaEnrollment } from '../../login/required-mfa-enrollment';

/** Reuses the account enrollment surface and provider challenge service. */
export function Reauthenticate({ loginPath }: { loginPath: string }) {
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
  return (
    <section className="space-y-4">
      <RequiredMfaEnrollment onVerified={verified}>
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            verify.mutate();
          }}
        >
          <Label htmlFor="sso-totp">{t('verification_code_label')}</Label>
          <Input
            id="sso-totp"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            value={code}
            onChange={(event) => setCode(event.target.value)}
          />
          {verify.isError && (
            <p role="alert" className="text-destructive">
              {t('required_mfa_error')}
            </p>
          )}
          <Button
            type="submit"
            disabled={verify.isPending || !/^\d{6}$/.test(code)}
          >
            {t('required_mfa_verify')}
          </Button>
        </form>
      </RequiredMfaEnrollment>
      <Button
        variant="outline"
        onClick={async () => {
          await client.auth.signOut({ scope: 'local' });
          window.location.assign(loginPath);
        }}
      >
        {t('required_mfa_sign_in_again')}
      </Button>
    </section>
  );
}
