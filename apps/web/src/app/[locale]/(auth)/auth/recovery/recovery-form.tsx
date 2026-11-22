'use client';

import { AlertTriangle, CheckCircle2 } from '@tuturuuu/icons/lucide-static';
import {
  type ConsumeAuthRecoveryResponse,
  consumeAuthRecoveryWithInternalApi,
} from '@tuturuuu/internal-api/auth';
import { Button } from '@tuturuuu/ui/button';
import { LoadingIndicator } from '@tuturuuu/ui/custom/loading-indicator';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { useTranslations } from 'next-intl';
import type { FormEvent } from 'react';
import { useState } from 'react';
import { AuthCodeField } from '../../login/auth-code-field';
import { AuthReferenceRow } from '../../login/auth-reference-row';

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
        (locale === 'en' ? '/personal' : `/${locale}/personal`)
    );
  };

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
      {message ? (
        <div
          className={
            isSuccess
              ? 'flex items-start gap-3 rounded-2xl bg-dynamic-green/10 px-3.5 py-3 text-dynamic-green text-sm leading-relaxed'
              : 'flex items-start gap-3 rounded-2xl bg-dynamic-red/10 px-3.5 py-3 text-dynamic-red text-sm leading-relaxed'
          }
          role={isSuccess ? 'status' : 'alert'}
        >
          {isSuccess ? (
            <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0" />
          ) : (
            <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
          )}
          <p className="min-w-0 font-semibold">{message}</p>
        </div>
      ) : null}
      {diagnosticCode && message && !isSuccess ? (
        <AuthReferenceRow
          code={diagnosticCode}
          copiedLabel={t('reference_copied')}
          copyLabel={t('copy_reference')}
          label={t('reference_label')}
        />
      ) : null}

      <div className="flex flex-col gap-2">
        <Label className="font-semibold" htmlFor="auth-recovery-email">
          {t('email_label')}
        </Label>
        <Input
          autoComplete="email"
          className="h-12 rounded-2xl"
          id="auth-recovery-email"
          inputMode="email"
          name="email"
          onChange={(event) => setEmail(event.target.value)}
          placeholder={t('email_placeholder')}
          required
          type="email"
          value={email}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label className="font-semibold" htmlFor="auth-recovery-code">
          {t('code_label')}
        </Label>
        <AuthCodeField
          align="start"
          disabled={isSubmitting}
          id="auth-recovery-code"
          idPrefix="auth-recovery-code"
          name="code"
          onChange={(value) => setCode(value.replace(/\D/gu, '').slice(0, 6))}
          value={code}
        />
        <p className="text-muted-foreground text-xs leading-5">
          {t('code_hint')}
        </p>
      </div>

      <Button
        className="h-12 w-full rounded-2xl font-bold"
        disabled={isSubmitting || code.length !== 6}
        type="submit"
      >
        {isSubmitting ? <LoadingIndicator className="size-4" /> : null}
        {isSubmitting ? t('submitting') : t('submit')}
      </Button>
    </form>
  );
}
