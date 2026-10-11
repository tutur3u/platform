'use client';

import {
  Check,
  ChevronDown,
  Eye,
  Mail,
  MoreHorizontal,
  Pencil,
  Send,
  Sparkles,
  XCircle,
} from '@tuturuuu/icons';
import type { PeriodicReport } from '@tuturuuu/internal-api/reports';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { periodicDeliveryCategory } from './periodic-delivery-category';
import {
  PeriodicStageBadge,
  PeriodicStatusBadge,
} from './periodic-status-badge';

export type PeriodicDeliveryAction = 'test' | 'send' | 'retry' | 'cancel';

export function PeriodicReportRow({
  approvalPending,
  generationPending,
  onApprove,
  onDeliveryIntent,
  onEmailPreview,
  onGenerate,
  onPreview,
  onEditRecipient,
  permissions,
  selectable = false,
  selected = false,
  onToggleSelection,
  report,
  wsId,
}: {
  onEditRecipient?: () => void;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelection?: () => void;
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
    canUpdateUsers?: boolean;
  };
  report: PeriodicReport & { creator_name?: string | null };
  wsId: string;
}) {
  const t = useTranslations('reports-hub');
  const category = periodicDeliveryCategory(report);
  return (
    <article className="border-border/60 border-b transition-colors last:border-b-0 hover:bg-muted/30">
      <div className="grid gap-3 p-3 md:px-4 xl:grid-cols-[minmax(0,1fr)_10rem_12rem] xl:items-center">
        <div className="flex min-w-0 items-start gap-3">
          {permissions.canSendReports && (
            <Checkbox
              className="mt-1 shrink-0"
              checked={selected}
              disabled={!selectable}
              onCheckedChange={onToggleSelection}
              aria-label={t('select_report', {
                name: report.user_name || report.title,
              })}
            />
          )}
          <button
            type="button"
            className="min-w-0 flex-1 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={onPreview}
          >
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate font-medium text-sm">{report.title}</p>
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
            <p className="mt-1 flex items-center gap-1 truncate text-muted-foreground text-xs">
              <Mail className="size-3 shrink-0" />
              {report.user_email?.trim() || t('missing_email')}
            </p>
            {report.creator_name ? (
              <p className="truncate text-muted-foreground text-xs">
                {t('teacher_name', { name: report.creator_name })}
              </p>
            ) : null}
            <p className="text-muted-foreground text-xs">
              {report.period_start && report.period_end
                ? `${report.period_start} – ${report.period_end}`
                : t('manual_report')}
            </p>
            {report.last_delivery_error ? (
              <p className="mt-1 line-clamp-1 text-destructive text-xs">
                {category
                  ? t(`category_${category}_guidance`)
                  : t('category_failure_guidance')}
              </p>
            ) : null}
          </button>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2 xl:w-40 [&_[data-slot=badge]]:max-w-full [&_[data-slot=badge]]:whitespace-normal [&_[data-slot=badge]]:text-left">
          {category && (
            <Badge variant="outline">{t(`category_${category}`)}</Badge>
          )}
          {report.report_stage ? (
            <PeriodicStageBadge stage={report.report_stage} />
          ) : (
            <PeriodicStatusBadge approval={report.report_approval_status} />
          )}
          {!report.report_stage && (
            <span className="inline-flex flex-wrap items-center gap-1">
              <span className="text-muted-foreground text-xs">
                {t('live_delivery')}
              </span>
              <PeriodicStatusBadge delivery={report.delivery_status} />
            </span>
          )}
          {report.test_delivery && (
            <span className="inline-flex flex-wrap items-center gap-1">
              <span className="text-muted-foreground text-xs">
                {t('test_send')}
              </span>
              <PeriodicStatusBadge delivery={report.test_delivery.status} />
            </span>
          )}
        </div>
        <div className="flex min-h-9 flex-wrap items-center justify-end gap-1 xl:w-48">
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
          (report.report_approval_status === 'PENDING' ||
            report.report_approval_status === null) ? (
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
          {permissions.canUpdateUsers &&
            onEditRecipient &&
            (!report.user_email?.trim() || !report.user_name?.trim()) && (
              <Button size="sm" variant="outline" onClick={onEditRecipient}>
                <Pencil className="size-3.5" />
                {t('edit_recipient')}
              </Button>
            )}
          {permissions.canSendReports &&
          report.report_approval_status === 'APPROVED' &&
          report.user_email?.trim() &&
          !['queued', 'processing', 'sent', 'failed', 'blocked'].includes(
            report.delivery_status
          ) &&
          !category ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onDeliveryIntent('send')}
            >
              <Send className="size-3.5" />
              {t('send')}
            </Button>
          ) : null}
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
      </div>
    </article>
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
          variant="ghost"
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
        {report.report_approval_status === 'APPROVED' &&
        !['queued', 'processing', 'sent', 'failed', 'blocked'].includes(
          report.delivery_status
        ) &&
        !periodicDeliveryCategory(report) ? (
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
