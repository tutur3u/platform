'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { InternalApiError } from '@tuturuuu/internal-api';
import {
  readEmailAppealRecipient,
  requestEmailAppealConfirmation,
} from '@tuturuuu/internal-api/email-appeals';
import { Button } from '@tuturuuu/ui/button';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';

export default function EmailAppealRecipientRequest({
  appealId,
}: {
  appealId: string;
}) {
  const t = useTranslations('email-appeals');
  const locale = useLocale();
  const details = useQuery({
    queryKey: ['email-appeal-recipient', appealId],
    queryFn: () => readEmailAppealRecipient(appealId),
    enabled: !!appealId,
    retry: false,
  });
  const send = useMutation({
    mutationFn: () => requestEmailAppealConfirmation(appealId),
    retry: false,
  });

  function result() {
    switch (send.status) {
      case 'idle':
        return null;
      case 'pending':
        return <p role="status">{t('requesting')}</p>;
      case 'error':
        return <p role="alert">{t('recipient_request_error')}</p>;
      case 'success':
        return <p role="status">{t(`outcome.${send.data.status}`)}</p>;
      default: {
        const exhaustive: never = send;
        return exhaustive;
      }
    }
  }

  function storedOutcome(status: string) {
    switch (status) {
      case 'waiting_recipient':
        return null;
      case 'sent':
        return t('outcome.sent');
      case 'unknown':
        return t('outcome.unknown');
      case 'unavailable':
        return t('outcome.unavailable');
      case 'confirmed':
        return t('transport_pending');
      case 'verifying':
      case 'dispatching':
        return t('requesting');
      default:
        return t('recipient_access_error');
    }
  }

  function content() {
    if (!appealId) return <p role="alert">{t('invalid_recipient_request')}</p>;
    switch (details.status) {
      case 'pending':
        return <p role="status">{t('loading')}</p>;
      case 'error': {
        const needsLogin =
          details.error instanceof InternalApiError &&
          details.error.status === 401;
        if (!needsLogin)
          return <p role="alert">{t('recipient_access_error')}</p>;
        const nextUrl = `/${locale}/email-appeals/request?appeal=${encodeURIComponent(appealId)}`;
        return (
          <div className="space-y-4">
            <p>{t('recipient_sign_in')}</p>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline">
                <Link
                  href={`/${locale}/login?provider=google&nextUrl=${encodeURIComponent(nextUrl)}`}
                >
                  {t('sign_in_google')}
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link
                  href={`/${locale}/login?provider=azure&nextUrl=${encodeURIComponent(nextUrl)}`}
                >
                  {t('sign_in_microsoft')}
                </Link>
              </Button>
            </div>
          </div>
        );
      }
      case 'success':
        return (
          <div className="space-y-4">
            <dl className="space-y-3 rounded-xl border bg-card p-4">
              <div>
                <dt className="text-muted-foreground text-sm">
                  {t('workspace')}
                </dt>
                <dd className="break-words font-medium">
                  {details.data.workspaceName}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-sm">
                  {t('recipient')}
                </dt>
                <dd className="break-all">{details.data.email}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-sm">
                  {t('purpose')}
                </dt>
                <dd>{t('purpose_workspace_reports')}</dd>
              </div>
            </dl>
            <p className="text-muted-foreground">
              {t('recipient_request_description')}
            </p>
            <Button
              disabled={
                send.status !== 'idle' ||
                details.data.status !== 'waiting_recipient'
              }
              onClick={() => send.mutate()}
            >
              {t('recipient_request_button')}
            </Button>
            {send.status === 'idle' ? (
              <p role="status">{storedOutcome(details.data.status)}</p>
            ) : null}
            {result()}
          </div>
        );
      default: {
        const exhaustive: never = details;
        return exhaustive;
      }
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 px-4 py-10">
      <h1 className="font-semibold text-2xl tracking-tight">
        {t('recipient_request_title')}
      </h1>
      {content()}
    </main>
  );
}
