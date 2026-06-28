'use client';

import { AlertCircle, CheckCircle2 } from '@tuturuuu/icons';
import {
  type ConsumeAuthRecoveryResponse,
  consumeAuthRecoveryWithInternalApi,
} from '@tuturuuu/internal-api/auth';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { useTranslations } from 'next-intl';
import type { FormEvent } from 'react';
import { useState } from 'react';

interface AuthRecoveryFormProps {
  defaultEmail: string;
  diagnosticCode?: string;
  error?: string;
  locale: string;
  next?: string;
}

export function AuthRecoveryForm({
  defaultEmail,
  diagnosticCode,
  error,
  locale,
  next,
}: AuthRecoveryFormProps) {
  const t = useTranslations('auth-recovery');
  const [email, setEmail] = useState(defaultEmail);
  const [code, setCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(
    error ? t('invalid_link') : null
  );
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage(null);
    setIsSuccess(false);

    const result: ConsumeAuthRecoveryResponse =
      await consumeAuthRecoveryWithInternalApi({
        code,
        email,
        locale,
        next,
      }).catch((requestError) => ({
        error:
          requestError instanceof Error
            ? requestError.message
            : t('generic_error'),
        success: false,
      }));

    setIsSubmitting(false);

    if (!result.success) {
      setMessage(result.error || t('generic_error'));
      return;
    }

    setIsSuccess(true);
    setMessage(t('success'));
    window.location.assign(
      result.redirectTo ||
        (locale === 'en' ? '/onboarding' : `/${locale}/onboarding`)
    );
  };

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      {message ? (
        <div
          className="flex items-start gap-2 rounded-lg border bg-muted/40 p-3 text-sm"
          role="status"
        >
          {isSuccess ? (
            <CheckCircle2 className="mt-0.5 size-4 text-dynamic-green" />
          ) : (
            <AlertCircle className="mt-0.5 size-4 text-dynamic-red" />
          )}
          <div className="space-y-1">
            <p>{message}</p>
            {diagnosticCode ? (
              <p className="text-muted-foreground">
                {t('diagnostic_code', { code: diagnosticCode })}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="auth-recovery-email">{t('email_label')}</Label>
        <Input
          autoComplete="email"
          id="auth-recovery-email"
          inputMode="email"
          name="email"
          onChange={(event) => setEmail(event.target.value)}
          required
          type="email"
          value={email}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="auth-recovery-code">{t('code_label')}</Label>
        <Input
          autoComplete="one-time-code"
          id="auth-recovery-code"
          inputMode="numeric"
          maxLength={6}
          minLength={6}
          name="code"
          onChange={(event) =>
            setCode(event.target.value.replace(/\D/gu, '').slice(0, 6))
          }
          pattern="[0-9]{6}"
          required
          value={code}
        />
        <p className="text-muted-foreground text-xs leading-5">
          {t('code_hint')}
        </p>
      </div>

      <Button className="w-full" disabled={isSubmitting} type="submit">
        {isSubmitting ? t('submitting') : t('submit')}
      </Button>
    </form>
  );
}
