'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from '@tuturuuu/icons';
import {
  approveRateLimitAppeal,
  closeRateLimitAppeal,
  listRateLimitAppeals,
  type RateLimitAppeal,
  rejectRateLimitAppeal,
} from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { toast } from '@tuturuuu/ui/sonner';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  type ApproveAppealPayload,
  RateLimitAppealCard,
  type ReviewAppealPayload,
} from './rate-limit-appeal-card';

const QUERY_KEY = ['infrastructure', 'rate-limit-appeals'];
const ALL_STATUSES = 'all';

export function RateLimitAppealsClient({
  canManage,
  wsId,
}: {
  canManage: boolean;
  wsId: string;
}) {
  const t = useTranslations('rate-limit-appeals');
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<string>('pending');
  const [search, setSearch] = useState('');

  const appealsQuery = useQuery({
    queryFn: () =>
      listRateLimitAppeals({
        limit: 100,
        q: search.trim() || undefined,
        status:
          status === ALL_STATUSES
            ? 'all'
            : (status as RateLimitAppeal['status']),
      }),
    queryKey: [...QUERY_KEY, status, search.trim()],
    refetchInterval: 15000,
    staleTime: 5000,
  });

  const approveMutation = useMutation({
    mutationFn: (payload: ApproveAppealPayload) =>
      approveRateLimitAppeal(payload.appealId, payload),
    onError: () => toast.error(t('toasts.approve_failed')),
    onSuccess: () => {
      toast.success(t('toasts.approved'));
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (payload: ReviewAppealPayload) =>
      rejectRateLimitAppeal(payload.appealId, {
        reviewNote: payload.reviewNote,
      }),
    onError: () => toast.error(t('toasts.reject_failed')),
    onSuccess: () => {
      toast.success(t('toasts.rejected'));
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });

  const closeMutation = useMutation({
    mutationFn: (payload: ReviewAppealPayload) =>
      closeRateLimitAppeal(payload.appealId, {
        reviewNote: payload.reviewNote,
      }),
    onError: () => toast.error(t('toasts.close_failed')),
    onSuccess: () => {
      toast.success(t('toasts.closed'));
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });

  const isWorking =
    approveMutation.isPending ||
    rejectMutation.isPending ||
    closeMutation.isPending;

  if (appealsQuery.isLoading) {
    return (
      <div className="flex min-h-64 items-center justify-center rounded-lg border border-border bg-card">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (appealsQuery.isError || !appealsQuery.data) {
    return (
      <div className="space-y-4 rounded-lg border border-border bg-card p-6">
        <p className="font-medium">{t('error.title')}</p>
        <p className="text-muted-foreground text-sm">
          {t('error.description')}
        </p>
        <Button onClick={() => appealsQuery.refetch()} variant="secondary">
          {t('actions.retry')}
        </Button>
      </div>
    );
  }

  const { appeals, summary } = appealsQuery.data;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-4">
        {(['pending', 'approved', 'rejected', 'closed'] as const).map(
          (value) => (
            <div className="rounded-md border border-border p-3" key={value}>
              <p className="text-muted-foreground text-sm">
                {t(`statuses.${value}`)}
              </p>
              <p className="font-semibold text-2xl">{summary[value]}</p>
            </div>
          )
        )}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Select onValueChange={setStatus} value={status}>
          <SelectTrigger className="sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_STATUSES}>{t('filters.all')}</SelectItem>
            {(['pending', 'approved', 'rejected', 'closed'] as const).map(
              (value) => (
                <SelectItem key={value} value={value}>
                  {t(`statuses.${value}`)}
                </SelectItem>
              )
            )}
          </SelectContent>
        </Select>
        <Input
          className="sm:max-w-xs"
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t('filters.search')}
          value={search}
        />
        <Button asChild type="button" variant="outline">
          <Link href={`/${wsId}/rate-limits`}>
            {t('actions.open_rate_limits')}
          </Link>
        </Button>
      </div>

      {appeals.length === 0 ? (
        <p className="rounded-lg border border-border bg-card p-6 text-muted-foreground text-sm">
          {t('empty')}
        </p>
      ) : (
        <div className="space-y-4">
          {appeals.map((appeal) => (
            <RateLimitAppealCard
              appeal={appeal}
              canManage={canManage}
              isWorking={isWorking}
              key={appeal.id}
              onApprove={(payload) => approveMutation.mutate(payload)}
              onClose={(payload) => closeMutation.mutate(payload)}
              onReject={(payload) => rejectMutation.mutate(payload)}
              wsId={wsId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
