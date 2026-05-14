'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  Clock3,
  LoaderCircle,
  SendHorizontal,
  ShieldAlert,
} from '@tuturuuu/icons';
import {
  getMyHiveAccessRequestStatus,
  requestHiveAccess,
} from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

const HIVE_ACCESS_STATUS_QUERY_KEY = ['hive-access-request-status'];

export function AccessRequestCard({ email }: { email: string | null }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const t = useTranslations('auth');
  const [note, setNote] = useState('');
  const statusQuery = useQuery({
    queryFn: () => getMyHiveAccessRequestStatus(),
    queryKey: HIVE_ACCESS_STATUS_QUERY_KEY,
    refetchInterval: (query) => (query.state.data?.hasAccess ? false : 5_000),
    refetchIntervalInBackground: true,
  });
  const requestMutation = useMutation({
    mutationFn: () => requestHiveAccess({ note: note.trim() || null }),
    onSuccess: (data) => {
      queryClient.setQueryData(HIVE_ACCESS_STATUS_QUERY_KEY, data);
      setNote('');
    },
  });
  const status = statusQuery.data?.status ?? 'none';
  const hasAccess = statusQuery.data?.hasAccess === true;
  const isPending = status === 'pending';

  useEffect(() => {
    if (hasAccess) router.replace('/');
  }, [hasAccess, router]);

  return (
    <section className="w-full max-w-xl rounded-2xl border border-dynamic-border bg-dynamic-card p-6 shadow-2xl shadow-dynamic-background/40 sm:p-8">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-dynamic-green/10 text-dynamic-green">
          {hasAccess ? (
            <CheckCircle2 className="h-5 w-5" />
          ) : isPending ? (
            <Clock3 className="h-5 w-5" />
          ) : (
            <ShieldAlert className="h-5 w-5" />
          )}
        </div>
        <div>
          <p className="font-semibold text-dynamic-green text-xs uppercase tracking-[0.14em]">
            Hive
          </p>
          <h1 className="font-semibold text-2xl tracking-tight sm:text-3xl">
            {t('notWhitelistedTitle')}
          </h1>
        </div>
      </div>

      <p className="mt-4 text-dynamic-muted-foreground leading-7">
        {t('notWhitelistedBody')}
      </p>

      <div className="mt-5 rounded-lg border border-dynamic-border/70 bg-dynamic-muted/30 p-4">
        <div className="flex items-center gap-2 font-medium text-sm">
          {statusQuery.isFetching && !hasAccess ? (
            <LoaderCircle className="h-4 w-4 animate-spin text-dynamic-blue" />
          ) : isPending ? (
            <Clock3 className="h-4 w-4 text-dynamic-blue" />
          ) : hasAccess ? (
            <CheckCircle2 className="h-4 w-4 text-dynamic-green" />
          ) : (
            <ShieldAlert className="h-4 w-4 text-dynamic-orange" />
          )}
          {hasAccess
            ? t('requestAccessApproved')
            : isPending
              ? t('requestAccessPending')
              : t('requestAccessTitle')}
        </div>
        <p className="mt-2 text-dynamic-muted-foreground text-sm">
          {hasAccess
            ? t('requestAccessApprovedBody')
            : isPending
              ? t('requestAccessPendingBody')
              : t('requestAccessDescription')}
        </p>
        {email && (
          <p className="mt-3 text-dynamic-muted-foreground text-xs">
            {t('requestAccessAccount', { email })}
          </p>
        )}
      </div>

      {!hasAccess && (
        <div className="mt-5 space-y-3">
          <Textarea
            disabled={requestMutation.isPending || isPending}
            maxLength={1000}
            onChange={(event) => setNote(event.target.value)}
            placeholder={t('requestAccessNotePlaceholder')}
            rows={4}
            value={note}
          />
          {statusQuery.isError && (
            <p className="text-dynamic-red text-sm">
              {t('requestAccessFailed')}
            </p>
          )}
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button
              disabled={requestMutation.isPending || isPending}
              onClick={() => requestMutation.mutate()}
              type="button"
            >
              {requestMutation.isPending ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <SendHorizontal className="h-4 w-4" />
              )}
              {isPending ? t('requestAccessWaiting') : t('requestAccessCta')}
            </Button>
            <form action="/api/auth/logout" method="post">
              <Button type="submit" variant="outline">
                {t('logout')}
              </Button>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
