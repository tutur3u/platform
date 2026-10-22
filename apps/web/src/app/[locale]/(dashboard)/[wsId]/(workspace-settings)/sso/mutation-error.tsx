'use client';
import { InternalApiError } from '@tuturuuu/internal-api/client';
import { useTranslations } from 'next-intl';
import { Reauthenticate } from '@/app/[locale]/(auth)/sso/consent/reauthenticate';

export function SsoMutationError({ error }: { error: Error | null }) {
  const t = useTranslations('workspace-sso');
  if (!error) return null;
  const mfa =
    error instanceof InternalApiError && error.message === 'sso_mfa_required';
  const conflict = error instanceof InternalApiError && error.status === 409;
  return (
    <div className="space-y-3">
      <p role="alert" className="text-destructive">
        {t(mfa ? 'mfaRequired' : conflict ? 'conflict' : 'saveError')}
      </p>
      {mfa && (
        <Reauthenticate
          loginPath={`/login?nextUrl=${encodeURIComponent(typeof window === 'undefined' ? '/' : window.location.pathname)}`}
        />
      )}
    </div>
  );
}
