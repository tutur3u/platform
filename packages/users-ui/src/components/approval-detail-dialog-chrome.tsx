'use client';

import {
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
  X,
  XIcon,
} from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Textarea } from '@tuturuuu/ui/textarea';
import type { ApprovalStatus } from '@tuturuuu/users-core/lib/approvals-utils';
import { getStatusColorClasses } from '@tuturuuu/users-core/lib/approvals-utils';
import { cn } from '@tuturuuu/utils/format';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import type { ApprovalItem } from '../hooks/use-approvals';

type ApprovalDetailHeaderProps = {
  canApprove: boolean;
  currentIndex: number;
  formatDate: (value?: string | null) => string;
  hasNext: boolean;
  hasPrev: boolean;
  isApproving: boolean;
  isRejecting: boolean;
  isUnapproving: boolean;
  item: ApprovalItem;
  items: ApprovalItem[];
  onApprove: (id: string) => void;
  onNavigateToItem?: (item: ApprovalItem) => void;
  onReject: (params: { id: string; reason: string }) => void;
  onUnapprove: (id: string) => void;
  positionLabel: string | null;
  rejectReason: string;
  setRejectReason: (reason: string) => void;
  setShowRejectForm: (show: boolean) => void;
  showRejectForm: boolean;
  status: ApprovalStatus;
  wsId: string;
};

function LinkedMetadataValue({
  children,
  href,
  variant,
}: {
  children: string;
  href?: string;
  variant: 'outline' | 'secondary';
}) {
  const value = (
    <Badge
      variant={variant}
      title={children}
      className={cn(
        'max-w-full whitespace-normal break-words text-left',
        href && 'cursor-pointer hover:bg-muted'
      )}
    >
      {children}
    </Badge>
  );

  return href ? (
    <Link href={href} className="min-w-0 max-w-full">
      {value}
    </Link>
  ) : (
    value
  );
}

export function ApprovalDetailHeader({
  canApprove,
  currentIndex,
  formatDate,
  hasNext,
  hasPrev,
  isApproving,
  isRejecting,
  isUnapproving,
  item,
  items,
  onApprove,
  onNavigateToItem,
  onReject,
  onUnapprove,
  positionLabel,
  rejectReason,
  setRejectReason,
  setShowRejectForm,
  showRejectForm,
  status,
  wsId,
}: ApprovalDetailHeaderProps) {
  const t = useTranslations('approvals');
  const isReport = item.kind === 'reports';
  const statusKey =
    status === 'APPROVED'
      ? 'approved'
      : status === 'REJECTED'
        ? 'rejected'
        : 'pending';
  const groupName = item.group_name || t('labels.unknown_group');
  const userName = item.user_name || t('labels.unknown_user');

  return (
    <DialogHeader className="shrink-0 border-b px-4 pt-5 pb-4 text-left sm:px-6 lg:px-8">
      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
        <div className="min-w-0 space-y-1">
          <DialogTitle
            className="break-words font-semibold text-lg leading-snug"
            title={item.title || t('labels.untitled')}
          >
            {item.title || t('labels.untitled')}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm">
            {isReport ? t('detail.reportSubtitle') : t('detail.postSubtitle')}
          </DialogDescription>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2 lg:justify-end">
          {items.length > 1 && onNavigateToItem ? (
            <div className="flex items-center gap-1">
              <Button
                aria-label={t('actions.previous')}
                variant="outline"
                size="sm"
                onClick={() => {
                  if (hasPrev) onNavigateToItem(items[currentIndex - 1]!);
                }}
                disabled={!hasPrev || isApproving || isRejecting}
                className="h-8 w-8 p-0"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              {positionLabel ? (
                <span className="min-w-12 text-center text-muted-foreground text-xs tabular-nums">
                  {positionLabel}
                </span>
              ) : null}
              <Button
                aria-label={t('actions.next')}
                variant="outline"
                size="sm"
                onClick={() => {
                  if (hasNext) onNavigateToItem(items[currentIndex + 1]!);
                }}
                disabled={!hasNext || isApproving || isRejecting}
                className="h-8 w-8 p-0"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          ) : null}
          {isReport ? (
            <Button variant="outline" size="sm" className="h-8 gap-1" asChild>
              <Link
                href={`/${wsId}/users/reports?groupId=${item.group_id ?? ''}&userId=${item.user_id ?? ''}&reportId=${item.id}`}
                target="_blank"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {t('actions.openReport')}
              </Link>
            </Button>
          ) : null}
          <span
            className={cn(
              'inline-flex items-center rounded-full border px-2 py-1 font-medium text-xs',
              getStatusColorClasses(status)
            )}
          >
            {t(`status.${statusKey}`)}
          </span>
        </div>
      </div>

      <div className="grid min-w-0 gap-3 pt-2 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 text-muted-foreground text-xs">
          <span className="break-words">
            {t('labels.created_at')} {formatDate(item.created_at)}
          </span>
          <span className="flex min-w-0 max-w-full items-center gap-1">
            <span className="shrink-0">{t('labels.group')}:</span>
            <LinkedMetadataValue
              variant="outline"
              href={
                item.group_id
                  ? `/${wsId}/users/groups/${item.group_id}`
                  : undefined
              }
            >
              {groupName}
            </LinkedMetadataValue>
          </span>
          <span className="flex min-w-0 max-w-full items-center gap-1">
            <span className="shrink-0">{t('labels.user')}:</span>
            <LinkedMetadataValue
              variant="secondary"
              href={
                item.user_id
                  ? `/${wsId}/users/database/${item.user_id}`
                  : undefined
              }
            >
              {userName}
            </LinkedMetadataValue>
          </span>
        </div>

        {canApprove &&
        (status === 'PENDING' ||
          (status === 'APPROVED' && item.kind === 'posts')) ? (
          showRejectForm ? (
            <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(12rem,1fr)_auto_auto] lg:w-[32rem]">
              <Textarea
                placeholder={t('detail.rejectionReasonPlaceholder')}
                value={rejectReason}
                onChange={(event) => setRejectReason(event.target.value)}
                className="min-h-9 w-full resize-y text-xs"
              />
              <Button
                aria-label={t('actions.cancel')}
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowRejectForm(false);
                  setRejectReason('');
                }}
                className="h-9 px-3"
              >
                <XIcon className="h-4 w-4" />
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() =>
                  onReject({ id: item.id, reason: rejectReason.trim() })
                }
                disabled={isRejecting || !rejectReason.trim()}
                className="h-9 gap-1"
              >
                {isRejecting ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : null}
                <X className="h-3 w-3" />
                {t('actions.confirmReject')}
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowRejectForm(true)}
                className="h-9 gap-1"
              >
                <X className="h-3 w-3" />
                {t('actions.reject')}
              </Button>
              {status === 'APPROVED' && item.kind === 'posts' ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onUnapprove(item.id)}
                  disabled={!item.can_remove_approval || isUnapproving}
                  className="h-9 gap-1"
                >
                  {isUnapproving ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : null}
                  <X className="h-3 w-3" />
                  {t('actions.unapprove')}
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={() => onApprove(item.id)}
                  disabled={isApproving}
                  className="h-9 gap-1 bg-dynamic-green hover:bg-dynamic-green/90"
                >
                  {isApproving ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : null}
                  <Check className="h-3 w-3" />
                  {t('actions.approve')}
                </Button>
              )}
            </div>
          )
        ) : null}
      </div>
    </DialogHeader>
  );
}

function MetadataRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid min-w-0 grid-cols-[minmax(6.5rem,auto)_minmax(0,1fr)] items-start gap-3">
      <span className="text-muted-foreground">{label}</span>
      <div className="min-w-0 justify-self-end break-words text-right">
        {value}
      </div>
    </div>
  );
}

export function ApprovalDetailSidebar({
  formatDate,
  item,
  wsId,
}: {
  formatDate: (value?: string | null) => string;
  item: ApprovalItem;
  wsId: string;
}) {
  const t = useTranslations('approvals');
  const groupName = item.group_name || t('labels.unknown_group');
  const userName = item.user_name || t('labels.unknown_user');
  const modifierName = item.modifier_name || t('labels.unknown_user');
  const creatorName =
    item.kind === 'reports'
      ? item.creator_name || t('labels.unknown_user')
      : null;

  return (
    <div className="space-y-4" data-testid="approval-detail-sidebar">
      <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
        <h4 className="mb-3 font-semibold text-sm">{t('detail.metadata')}</h4>
        <div className="space-y-3 text-sm">
          <MetadataRow
            label={t('labels.created_at')}
            value={formatDate(item.created_at)}
          />
          <MetadataRow
            label={t('labels.user')}
            value={
              <LinkedMetadataValue
                variant="secondary"
                href={
                  item.user_id
                    ? `/${wsId}/users/database/${item.user_id}`
                    : undefined
                }
              >
                {userName}
              </LinkedMetadataValue>
            }
          />
          <MetadataRow
            label={t('labels.group')}
            value={
              <LinkedMetadataValue
                variant="outline"
                href={
                  item.group_id
                    ? `/${wsId}/users/groups/${item.group_id}`
                    : undefined
                }
              >
                {groupName}
              </LinkedMetadataValue>
            }
          />
          {creatorName ? (
            <MetadataRow
              label={t('labels.creator')}
              value={
                <span title={creatorName} className="break-words">
                  {creatorName}
                </span>
              }
            />
          ) : null}
          <MetadataRow
            label={t('labels.last_modified_by')}
            value={
              <span title={modifierName} className="break-words">
                {modifierName}
              </span>
            }
          />
        </div>
      </div>

      {item.approved_at || item.rejected_at || item.rejection_reason ? (
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <h4 className="mb-3 font-semibold text-sm">
            {t('detail.statusHistory')}
          </h4>
          <div className="space-y-3 text-sm">
            {item.approved_at ? (
              <MetadataRow
                label={t('labels.approved_at')}
                value={formatDate(item.approved_at)}
              />
            ) : null}
            {item.rejected_at ? (
              <MetadataRow
                label={t('labels.rejected_at')}
                value={formatDate(item.rejected_at)}
              />
            ) : null}
            {item.rejection_reason ? (
              <div className="min-w-0 pt-1">
                <span className="text-muted-foreground">
                  {t('labels.rejection_reason')}:
                </span>
                <p className="mt-1 whitespace-pre-wrap break-words rounded bg-dynamic-red/10 px-2 py-1 text-dynamic-red text-xs">
                  {item.rejection_reason}
                </p>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
