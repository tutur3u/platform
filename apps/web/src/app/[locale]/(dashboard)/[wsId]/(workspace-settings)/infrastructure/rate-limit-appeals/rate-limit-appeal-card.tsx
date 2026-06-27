'use client';

import { ShieldAlert, User, Users } from '@tuturuuu/icons';
import type { RateLimitAppeal } from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { type ReactNode, useMemo } from 'react';
import {
  AppealReviewControls,
  type ApproveAppealPayload,
  type ReviewAppealPayload,
} from './rate-limit-appeal-controls';

export type { ApproveAppealPayload, ReviewAppealPayload };

function formatDateTime(value?: string | null) {
  return value ? new Date(value).toLocaleString() : '-';
}

function statusTone(status: RateLimitAppeal['status']) {
  switch (status) {
    case 'approved':
      return 'border-dynamic-green/30 bg-dynamic-green/10 text-dynamic-green';
    case 'rejected':
      return 'border-dynamic-red/30 bg-dynamic-red/10 text-dynamic-red';
    case 'closed':
      return 'border-border bg-muted text-muted-foreground';
    default:
      return 'border-dynamic-yellow/30 bg-dynamic-yellow/10 text-dynamic-yellow';
  }
}

function membershipTone(status?: string) {
  if (status === 'member') {
    return 'border-dynamic-green/30 bg-dynamic-green/10 text-dynamic-green';
  }
  if (status === 'not_member') {
    return 'border-dynamic-yellow/30 bg-dynamic-yellow/10 text-dynamic-yellow';
  }
  return 'border-border bg-muted text-muted-foreground';
}

function AppealDiagnostics({ appeal }: { appeal: RateLimitAppeal }) {
  const t = useTranslations('rate-limit-appeals');
  const diagnostics = useMemo(
    () => JSON.stringify(appeal.diagnostics, null, 2),
    [appeal.diagnostics]
  );

  return (
    <details className="rounded-md border border-border bg-muted/30 p-3">
      <summary className="cursor-pointer font-medium text-sm">
        {t('diagnostics')}
      </summary>
      <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md bg-background p-3 font-mono text-xs">
        {diagnostics}
      </pre>
    </details>
  );
}

function IdentityTile({
  detail,
  icon,
  label,
  title,
}: {
  detail?: string | null;
  icon: ReactNode;
  label: string;
  title: string;
}) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="flex items-center gap-2 text-muted-foreground text-sm">
        {icon}
        {label}
      </div>
      <p className="mt-2 truncate font-medium">{title}</p>
      {detail ? (
        <p className="mt-1 truncate text-muted-foreground text-xs">{detail}</p>
      ) : null}
    </div>
  );
}

export function RateLimitAppealCard({
  appeal,
  canManage,
  isWorking,
  onApprove,
  onClose,
  onReject,
  wsId,
}: {
  appeal: RateLimitAppeal;
  canManage: boolean;
  isWorking: boolean;
  onApprove: (payload: ApproveAppealPayload) => void;
  onClose: (payload: ReviewAppealPayload) => void;
  onReject: (payload: ReviewAppealPayload) => void;
  wsId: string;
}) {
  const t = useTranslations('rate-limit-appeals');
  const context = appeal.reviewContext;
  const requester = context?.requester;
  const workspace = context?.workspace;

  return (
    <article className="space-y-4 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={statusTone(appeal.status)}>
              {t(`statuses.${appeal.status}`)}
            </Badge>
            <Badge className={membershipTone(context?.membership.status)}>
              {context?.membership.label ?? t('review.membership_unknown')}
            </Badge>
          </div>
          <p className="font-medium">{appeal.client_ip}</p>
          <p className="break-words text-muted-foreground text-sm">
            {appeal.request_method ?? 'GET'} {appeal.request_path ?? '-'}
          </p>
        </div>
        <div className="text-muted-foreground text-sm lg:text-right">
          <p>{formatDateTime(appeal.created_at)}</p>
          <p className="font-mono text-xs">{appeal.id}</p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <IdentityTile
          detail={requester?.email ?? requester?.id ?? appeal.creator_id}
          icon={<User className="h-4 w-4" />}
          label={t('review.requester')}
          title={
            requester?.displayName ??
            requester?.email ??
            appeal.user_email ??
            appeal.creator_id
          }
        />
        <IdentityTile
          detail={workspace?.handle ? `@${workspace.handle}` : workspace?.id}
          icon={<Users className="h-4 w-4" />}
          label={t('review.workspace')}
          title={
            workspace?.name ??
            (appeal.workspace_id
              ? t('review.unknown_workspace')
              : t('review.no_workspace'))
          }
        />
        <IdentityTile
          detail={appeal.proxy_block_reason ?? appeal.rate_limit_policy}
          icon={<ShieldAlert className="h-4 w-4" />}
          label={t('review.block_status')}
          title={context?.activeBlock.label ?? t('review.block_unknown')}
        />
      </div>

      {appeal.message ? (
        <p className="rounded-md bg-muted/40 p-3 text-sm">{appeal.message}</p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm" type="button" variant="outline">
          <Link
            href={`/${wsId}/infrastructure/blocked-ips?ip=${encodeURIComponent(appeal.client_ip)}&status=active`}
          >
            {t('actions.open_blocked_ip')}
          </Link>
        </Button>
        <Button asChild size="sm" type="button" variant="outline">
          <Link href={`/${wsId}/infrastructure/rate-limits`}>
            {t('actions.open_live_usage')}
          </Link>
        </Button>
      </div>

      <AppealDiagnostics appeal={appeal} />

      <AppealReviewControls
        appeal={appeal}
        canManage={canManage}
        isWorking={isWorking}
        onApprove={onApprove}
        onClose={onClose}
        onReject={onReject}
      />
    </article>
  );
}
