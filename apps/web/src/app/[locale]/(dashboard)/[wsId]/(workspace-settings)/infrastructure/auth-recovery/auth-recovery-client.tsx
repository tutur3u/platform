'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Search } from '@tuturuuu/icons';
import {
  createAuthRecoveryOverride,
  getAuthRecoverySnapshot,
  revokeAuthRecoveryOverride,
  sendAuthRecoveryEmail,
} from '@tuturuuu/internal-api/infrastructure';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { AuthRecoveryCreateForm } from './auth-recovery-create-form';
import { AuthRecoverySnapshotView } from './auth-recovery-snapshot-view';

const QUERY_KEY = ['infrastructure', 'auth-recovery'];

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function AuthRecoveryClient({
  canManage,
  locale,
}: {
  canManage: boolean;
  locale: string;
}) {
  const t = useTranslations('auth-recovery-admin');
  const queryClient = useQueryClient();
  const [emailFilter, setEmailFilter] = useState('');
  const [email, setEmail] = useState('');
  const [reason, setReason] = useState('');
  const [allowNormalLogin, setAllowNormalLogin] = useState(true);
  const [allowRecoveryEmail, setAllowRecoveryEmail] = useState(true);
  const [clearEmailScoped, setClearEmailScoped] = useState(true);
  const [clearRelatedIpCounters, setClearRelatedIpCounters] = useState(true);
  const [clearRelatedIpBlocks, setClearRelatedIpBlocks] = useState(false);

  const snapshotQuery = useQuery({
    queryFn: () =>
      getAuthRecoverySnapshot({
        email: emailFilter.trim() || undefined,
      }),
    queryKey: [...QUERY_KEY, emailFilter.trim()],
    refetchInterval: 15000,
    staleTime: 5000,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createAuthRecoveryOverride({
        allowNormalLogin,
        allowRecoveryEmail,
        clearEmailScoped,
        clearRelatedIpBlocks,
        clearRelatedIpCounters,
        email,
        reason,
      }),
    onError: (error) =>
      toast.error(getErrorMessage(error, t('toasts.create_failed'))),
    onSuccess: () => {
      toast.success(t('toasts.created'));
      setEmailFilter(email);
      setEmail('');
      setReason('');
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: ({
      overrideId,
      reason: revokeReason,
    }: {
      overrideId: string;
      reason?: string;
    }) => revokeAuthRecoveryOverride(overrideId, { reason: revokeReason }),
    onError: (error) =>
      toast.error(getErrorMessage(error, t('toasts.revoke_failed'))),
    onSuccess: () => {
      toast.success(t('toasts.revoked'));
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });

  const sendMutation = useMutation({
    mutationFn: (overrideId: string) =>
      sendAuthRecoveryEmail(overrideId, { locale }),
    onError: (error) =>
      toast.error(getErrorMessage(error, t('toasts.send_failed'))),
    onSuccess: () => {
      toast.success(t('toasts.sent'));
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });

  const isWorking =
    createMutation.isPending ||
    revokeMutation.isPending ||
    sendMutation.isPending;
  const snapshot = snapshotQuery.data;

  return (
    <div className="space-y-5">
      <form
        className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          snapshotQuery.refetch();
        }}
      >
        <div className="flex-1 space-y-2">
          <Label htmlFor="auth-recovery-filter">{t('filters.email')}</Label>
          <Input
            id="auth-recovery-filter"
            onChange={(event) => setEmailFilter(event.target.value)}
            placeholder={t('filters.email_placeholder')}
            value={emailFilter}
          />
        </div>
        <Button type="submit" variant="secondary">
          <Search className="h-4 w-4" />
          {t('actions.search')}
        </Button>
      </form>

      {canManage ? (
        <AuthRecoveryCreateForm
          allowNormalLogin={allowNormalLogin}
          allowRecoveryEmail={allowRecoveryEmail}
          clearEmailScoped={clearEmailScoped}
          clearRelatedIpBlocks={clearRelatedIpBlocks}
          clearRelatedIpCounters={clearRelatedIpCounters}
          email={email}
          isPending={createMutation.isPending}
          isWorking={isWorking}
          onSubmit={() => createMutation.mutate()}
          reason={reason}
          setAllowNormalLogin={setAllowNormalLogin}
          setAllowRecoveryEmail={setAllowRecoveryEmail}
          setClearEmailScoped={setClearEmailScoped}
          setClearRelatedIpBlocks={setClearRelatedIpBlocks}
          setClearRelatedIpCounters={setClearRelatedIpCounters}
          setEmail={setEmail}
          setReason={setReason}
        />
      ) : null}

      {snapshotQuery.isLoading ? (
        <div className="flex min-h-40 items-center justify-center rounded-lg border border-border bg-card">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : null}

      {snapshotQuery.isError ? (
        <div className="space-y-3 rounded-lg border border-border bg-card p-4">
          <p className="font-medium">{t('error.title')}</p>
          <p className="text-muted-foreground text-sm">
            {t('error.description')}
          </p>
          <Button onClick={() => snapshotQuery.refetch()} variant="secondary">
            {t('actions.retry')}
          </Button>
        </div>
      ) : null}

      {snapshot ? (
        <AuthRecoverySnapshotView
          canManage={canManage}
          isWorking={isWorking}
          onRevoke={(input) => revokeMutation.mutate(input)}
          onSendEmail={(overrideId) => sendMutation.mutate(overrideId)}
          snapshot={snapshot}
        />
      ) : null}
    </div>
  );
}
