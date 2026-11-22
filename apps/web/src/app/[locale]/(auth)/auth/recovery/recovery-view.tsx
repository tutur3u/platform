'use client';

import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  ExpiredLinkIllustration,
  RecoveryIllustration,
} from '../../login/auth-illustrations';
import { AuthReferenceRow } from '../../login/auth-reference-row';
import { AuthStateCard } from '../../login/auth-state-card';
import { localizedAuthPath } from '../../login/login-footer';
import { AuthRecoveryForm } from './recovery-form';

const LINK_CLASS =
  'inline-flex min-h-11 items-center self-center rounded-full px-2 font-semibold text-muted-foreground text-sm underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2';

/**
 * Account recovery: an expired or invalid one-click link first explains
 * itself (with its reference) and offers sign-in or the code form; the code
 * form itself is unchanged in behaviour.
 */
export function AuthRecoveryView({
  defaultEmail,
  diagnosticCode,
  error,
  locale,
  next,
}: {
  defaultEmail: string;
  diagnosticCode?: string;
  error?: string;
  locale: string;
  next?: string;
}) {
  const t = useTranslations('auth-recovery');
  const [enterCode, setEnterCode] = useState(false);
  const loginHref = localizedAuthPath('/login', locale);

  if (error && !enterCode) {
    return (
      <AuthStateCard
        description={t('link_expired_description')}
        illustration={<ExpiredLinkIllustration />}
        testId="auth-recovery-expired"
        title={t('link_expired_title')}
        titleAs="h1"
      >
        <Button asChild className="h-12 w-full rounded-2xl font-bold">
          <a href={loginHref}>{t('back_to_sign_in')}</a>
        </Button>
        <Button
          className="h-12 w-full rounded-2xl font-bold"
          onClick={() => setEnterCode(true)}
          type="button"
          variant="outline"
        >
          {t('enter_code_instead')}
        </Button>
        {diagnosticCode ? (
          <AuthReferenceRow
            code={diagnosticCode}
            copiedLabel={t('reference_copied')}
            copyLabel={t('copy_reference')}
            label={t('reference_label')}
          />
        ) : null}
      </AuthStateCard>
    );
  }

  return (
    <AuthStateCard
      description={t('description')}
      illustration={<RecoveryIllustration />}
      testId="auth-recovery"
      title={t('title')}
      titleAs="h1"
    >
      <AuthRecoveryForm
        defaultEmail={defaultEmail}
        diagnosticCode={enterCode ? undefined : diagnosticCode}
        error={enterCode ? undefined : error}
        locale={locale}
        next={next}
      />
      <a className={LINK_CLASS} href={loginHref}>
        {t('back_to_sign_in')}
      </a>
    </AuthStateCard>
  );
}
