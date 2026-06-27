'use client';

import { Check, Loader2, X } from '@tuturuuu/icons';
import type { RateLimitAppeal } from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Textarea } from '@tuturuuu/ui/textarea';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

export interface ApproveAppealPayload {
  appealId: string;
  expiresInDays: number;
  reviewNote?: string;
  trustMultiplier: number;
  workspaceId?: string | null;
}

export interface ReviewAppealPayload {
  appealId: string;
  reviewNote?: string;
}

function formatDateTime(value?: string | null) {
  return value ? new Date(value).toLocaleString() : '—';
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

function AppealReviewControls({
  appeal,
  canManage,
  isWorking,
  onApprove,
  onClose,
  onReject,
}: {
  appeal: RateLimitAppeal;
  canManage: boolean;
  isWorking: boolean;
  onApprove: (payload: ApproveAppealPayload) => void;
  onClose: (payload: ReviewAppealPayload) => void;
  onReject: (payload: ReviewAppealPayload) => void;
}) {
  const t = useTranslations('rate-limit-appeals');
  const [workspaceId, setWorkspaceId] = useState(appeal.workspace_id ?? '');
  const [trustMultiplier, setTrustMultiplier] = useState('3');
  const [expiresInDays, setExpiresInDays] = useState('30');
  const [reviewNote, setReviewNote] = useState('');

  if (!canManage) {
    return null;
  }

  const parsedMultiplier = Number.parseFloat(trustMultiplier);
  const parsedDays = Number.parseInt(expiresInDays, 10);
  const canApprove =
    appeal.status === 'pending' &&
    workspaceId.trim().length > 0 &&
    Number.isFinite(parsedMultiplier) &&
    parsedMultiplier > 0 &&
    Number.isFinite(parsedDays) &&
    parsedDays > 0;

  return (
    <div className="space-y-3 rounded-md border border-border p-3">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_120px_120px]">
        <div className="space-y-2">
          <Label htmlFor={`appeal-${appeal.id}-workspace`}>
            {t('fields.workspace_id')}
          </Label>
          <Input
            id={`appeal-${appeal.id}-workspace`}
            onChange={(event) => setWorkspaceId(event.target.value)}
            placeholder="workspace UUID"
            value={workspaceId}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`appeal-${appeal.id}-multiplier`}>
            {t('fields.multiplier')}
          </Label>
          <Input
            id={`appeal-${appeal.id}-multiplier`}
            min={0.1}
            onChange={(event) => setTrustMultiplier(event.target.value)}
            step={0.1}
            type="number"
            value={trustMultiplier}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`appeal-${appeal.id}-days`}>
            {t('fields.expires_days')}
          </Label>
          <Input
            id={`appeal-${appeal.id}-days`}
            min={1}
            onChange={(event) => setExpiresInDays(event.target.value)}
            type="number"
            value={expiresInDays}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`appeal-${appeal.id}-note`}>
          {t('fields.review_note')}
        </Label>
        <Textarea
          id={`appeal-${appeal.id}-note`}
          onChange={(event) => setReviewNote(event.target.value)}
          value={reviewNote}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          disabled={!canApprove || isWorking}
          onClick={() =>
            onApprove({
              appealId: appeal.id,
              expiresInDays: parsedDays,
              reviewNote: reviewNote.trim() || undefined,
              trustMultiplier: parsedMultiplier,
              workspaceId: workspaceId.trim(),
            })
          }
          type="button"
        >
          {isWorking ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Check className="h-4 w-4" />
          )}
          {t('actions.approve')}
        </Button>
        <Button
          disabled={appeal.status !== 'pending' || isWorking}
          onClick={() =>
            onReject({
              appealId: appeal.id,
              reviewNote: reviewNote.trim() || undefined,
            })
          }
          type="button"
          variant="destructive"
        >
          <X className="h-4 w-4" />
          {t('actions.reject')}
        </Button>
        <Button
          disabled={isWorking}
          onClick={() =>
            onClose({
              appealId: appeal.id,
              reviewNote: reviewNote.trim() || undefined,
            })
          }
          type="button"
          variant="outline"
        >
          {t('actions.close')}
        </Button>
      </div>
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

  return (
    <article className="space-y-4 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={statusTone(appeal.status)}>
              {t(`statuses.${appeal.status}`)}
            </Badge>
            <span className="font-mono text-muted-foreground text-xs">
              {appeal.id}
            </span>
          </div>
          <p className="font-medium">{appeal.client_ip}</p>
          <p className="break-words text-muted-foreground text-sm">
            {appeal.request_method ?? 'GET'} {appeal.request_path ?? '—'}
          </p>
        </div>
        <div className="text-muted-foreground text-sm lg:text-right">
          <p>{formatDateTime(appeal.created_at)}</p>
          <p>{appeal.user_email ?? appeal.creator_id}</p>
        </div>
      </div>

      <div className="grid gap-3 text-sm md:grid-cols-3">
        <div>
          <p className="text-muted-foreground">{t('fields.workspace')}</p>
          <p className="font-mono text-xs">{appeal.workspace_id ?? '—'}</p>
        </div>
        <div>
          <p className="text-muted-foreground">{t('fields.block_reason')}</p>
          <p>{appeal.proxy_block_reason ?? '—'}</p>
        </div>
        <div>
          <p className="text-muted-foreground">{t('fields.relief_until')}</p>
          <p>{formatDateTime(appeal.temporary_relief_expires_at)}</p>
        </div>
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
