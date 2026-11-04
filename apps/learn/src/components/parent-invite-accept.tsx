'use client';

import { useMutation } from '@tanstack/react-query';
import { acceptTulearnParentInvite } from '@tuturuuu/internal-api/tulearn';
import { Button } from '@tuturuuu/ui/button';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

function getErrorStatus(error: unknown) {
  return typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof error.status === 'number'
    ? error.status
    : null;
}

export function ParentInviteAccept() {
  const t = useTranslations('parentInvite');
  const searchParams = useSearchParams();
  const wsId = searchParams.get('workspace');
  const token = searchParams.get('token');
  const accept = useMutation({
    mutationFn: () => acceptTulearnParentInvite(wsId ?? '', token ?? ''),
  });

  const errorStatus = getErrorStatus(accept.error);
  const errorKey =
    errorStatus === 403
      ? 'emailMismatch'
      : errorStatus !== null && [404, 409, 410].includes(errorStatus)
        ? 'unavailable'
        : 'failed';

  return (
    <div className="flex min-h-screen items-center justify-center bg-root-background p-6">
      <div className="max-w-lg rounded-lg border border-border bg-background p-8 text-center">
        <h1 className="font-semibold text-3xl tracking-normal">{t('title')}</h1>
        <p className="mt-3 text-muted-foreground leading-7">
          {!wsId || !token
            ? t('incomplete')
            : accept.isSuccess
              ? t('success')
              : t('description')}
        </p>
        {accept.isError ? (
          <p className="mt-3 text-destructive" role="alert">
            {t(errorKey)}
          </p>
        ) : null}
        {wsId && token && !accept.isSuccess ? (
          <Button
            className="mt-6 h-11"
            disabled={accept.isPending}
            onClick={() => accept.mutate()}
          >
            {accept.isPending ? t('accepting') : t('accept')}
          </Button>
        ) : null}
        {accept.isSuccess ? (
          <Link
            className="mt-6 inline-flex h-11 items-center justify-center rounded-lg border border-border bg-primary px-4 font-semibold text-primary-foreground"
            href={`/${encodeURIComponent(wsId ?? '')}`}
          >
            {t('open')}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
