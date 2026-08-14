'use client';

import {
  Check,
  ChevronDown,
  Eye,
  Mail,
  MoreHorizontal,
  RotateCcw,
  Send,
  Sparkles,
  XCircle,
} from '@tuturuuu/icons';
import type { PeriodicReport } from '@tuturuuu/internal-api/reports';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent } from '@tuturuuu/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

export type PeriodicDeliveryAction = 'test' | 'send' | 'retry' | 'cancel';

function statusVariant(status: string) {
  if (status === 'APPROVED' || status === 'sent') return 'success' as const;
  if (status === 'REJECTED' || status === 'failed' || status === 'blocked') {
    return 'destructive' as const;
  }
  return 'secondary' as const;
}

export function PeriodicReportRow({
  approvalPending,
  generationPending,
  onApprove,
  onDeliveryIntent,
  onEmailPreview,
  onGenerate,
  onPreview,
  permissions,
  report,
  wsId,
}: {
  approvalPending: boolean;
  generationPending: boolean;
  onApprove: () => void;
  onDeliveryIntent: (action: PeriodicDeliveryAction) => void;
  onEmailPreview: () => void;
  onGenerate: () => void;
  onPreview: () => void;
  permissions: {
    canApproveReports: boolean;
    canSendReports: boolean;
  };
  report: PeriodicReport & { creator_name?: string | null };
  wsId: string;
}) {
  const t = useTranslations('reports-hub');
  const approvalLabel = {
    APPROVED: t('status_approved'),
    PENDING: t('status_pending'),
    REJECTED: t('status_rejected'),
  }[report.report_approval_status];
  const deliveryLabel = {
    blocked: t('status_blocked'),
    cancelled: t('status_cancelled'),
    draft: t('status_draft'),
    failed: t('status_failed'),
    processing: t('status_processing'),
    queued: t('status_queued'),
    sent: t('status_sent'),
  }[report.delivery_status];
  return (
    <Card className="transition-colors hover:border-foreground/20">
      <CardContent className="flex flex-col gap-3 p-3 md:flex-row md:items-center md:p-4">
        <button
          type="button"
          className="min-w-0 flex-1 text-left"
          onClick={onPreview}
        >
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-medium">{report.title}</p>
            <Badge variant={statusVariant(report.report_approval_status)}>
              {approvalLabel}
            </Badge>
            <Badge variant={statusVariant(report.delivery_status)}>
              {deliveryLabel}
            </Badge>
            {report.generation_mode === 'ai' ? (
              <Badge variant="outline">
                <Sparkles className="mr-1 h-3 w-3" />
                AI
              </Badge>
            ) : null}
          </div>
          <p className="mt-1 truncate text-muted-foreground text-sm">
            {report.user_name ?? t('unknown_member')} ·{' '}
            {report.group_name ?? t('unknown_group')}
          </p>
          {report.creator_name ? (
            <p className="truncate text-muted-foreground text-xs">
              {t('teacher_name', { name: report.creator_name })}
            </p>
          ) : null}
          <p className="text-muted-foreground text-xs">
            {report.period_start && report.period_end
              ? `${report.period_start} – ${report.period_end}`
              : t('legacy_unscheduled')}
          </p>
          {report.last_delivery_error ? (
            <p className="mt-1 line-clamp-1 text-destructive text-xs">
              {report.last_delivery_error}
            </p>
          ) : null}
        </button>
        <div className="flex items-center justify-end gap-1">
          {report.generation_mode === 'ai' &&
          report.generation_status !== 'ready' ? (
            <Button
              size="icon"
              className="size-8"
              variant="outline"
              disabled={generationPending}
              onClick={onGenerate}
              aria-label={t('generate')}
            >
              <Sparkles className="h-4 w-4" />
            </Button>
          ) : null}
          {permissions.canApproveReports &&
          report.report_approval_status === 'PENDING' ? (
            <Button
              size="icon"
              className="size-8"
              variant="outline"
              disabled={approvalPending}
              onClick={onApprove}
              aria-label={t('approve')}
            >
              <Check className="h-4 w-4" />
            </Button>
          ) : null}
          <Button
            size="icon"
            className="size-8"
            variant="outline"
            onClick={onPreview}
            aria-label={t('details')}
          >
            <Eye className="h-4 w-4" />
          </Button>
          {permissions.canSendReports ? (
            <DeliveryMenu
              report={report}
              onEmailPreview={onEmailPreview}
              onDeliveryIntent={onDeliveryIntent}
            />
          ) : null}
          <Button asChild size="icon" className="size-8" variant="ghost">
            <Link
              href={`/${wsId}/users/reports/${report.id}`}
              aria-label={t('details')}
            >
              <ChevronDown className="h-4 w-4 -rotate-90" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function DeliveryMenu({
  onDeliveryIntent,
  onEmailPreview,
  report,
}: {
  onDeliveryIntent: (action: PeriodicDeliveryAction) => void;
  onEmailPreview: () => void;
  report: PeriodicReport;
}) {
  const t = useTranslations('reports-hub');
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="icon"
          className="size-8"
          variant={
            report.report_approval_status === 'APPROVED' &&
            report.delivery_status !== 'sent'
              ? 'default'
              : 'outline'
          }
          aria-label={t('delivery')}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={onEmailPreview}>
          <Eye className="mr-2 h-4 w-4" />
          {t('preview')}
        </DropdownMenuItem>
        {report.report_approval_status === 'APPROVED' ? (
          <>
            <DropdownMenuItem onSelect={() => onDeliveryIntent('test')}>
              <Send className="mr-2 h-4 w-4" />
              {t('test_send')}
            </DropdownMenuItem>
            {report.delivery_status !== 'sent' ? (
              <DropdownMenuItem onSelect={() => onDeliveryIntent('send')}>
                <Mail className="mr-2 h-4 w-4" />
                {t('send')}
              </DropdownMenuItem>
            ) : null}
          </>
        ) : null}
        {['failed', 'blocked'].includes(report.delivery_status) ? (
          <DropdownMenuItem onSelect={() => onDeliveryIntent('retry')}>
            <RotateCcw className="mr-2 h-4 w-4" />
            {t('retry_delivery')}
          </DropdownMenuItem>
        ) : null}
        {['queued', 'failed'].includes(report.delivery_status) ? (
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => onDeliveryIntent('cancel')}
          >
            <XCircle className="mr-2 h-4 w-4" />
            {t('cancel_delivery')}
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
