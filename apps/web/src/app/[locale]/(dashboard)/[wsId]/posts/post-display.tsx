'use client';

import {
  Calendar,
  Check,
  ExternalLink,
  FileText,
  Mail,
  Send,
  Users,
} from '@tuturuuu/icons';
import { Avatar, AvatarFallback } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { Separator } from '@tuturuuu/ui/separator';
import { cn } from '@tuturuuu/utils/format';
import dayjs from 'dayjs';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { PostApprovalActions } from '@/components/post-approval-actions';
import { ForceSendPostButton } from './force-send-button';
import {
  getPostApprovalStatusAppearance,
  getPostEmailStatusAppearance,
  getPostReviewStageAppearance,
} from './status-meta';
import type { PostEmail } from './types';

export function PostDisplay({
  wsId,
  postEmail,
  canApprovePosts = false,
  canForceSendPosts = false,
}: {
  wsId: string;
  postEmail: PostEmail | null;
  canApprovePosts?: boolean;
  canForceSendPosts?: boolean;
}) {
  const locale = useLocale();
  const t = useTranslations('post-email-data-table');

  useEffect(() => {
    dayjs.locale(locale);
  }, [locale]);

  if (!postEmail) {
    return (
      <div className="flex min-h-[36rem] items-center justify-center rounded-lg border border-border/60 bg-muted/20 shadow-sm">
        <div className="text-center text-muted-foreground">
          <Send className="mx-auto mb-4 h-12 w-12 opacity-50" />
          <p className="font-medium text-lg">{t('details_title')}</p>
          <p className="text-sm">{t('details_description')}</p>
        </div>
      </div>
    );
  }

  const stageAppearance = getPostReviewStageAppearance(postEmail.stage);
  const approvalAppearance = postEmail.approval_status
    ? getPostApprovalStatusAppearance(postEmail.approval_status)
    : null;
  const queueAppearance = postEmail.queue_status
    ? getPostEmailStatusAppearance(postEmail.queue_status)
    : null;
  const deliveryIssueMessage =
    postEmail.delivery_issue_reason === 'missing_email'
      ? t('delivery_issue_reason_missing_email')
      : postEmail.delivery_issue_reason === 'missing_sender_platform_user'
        ? t('delivery_issue_reason_missing_sender_platform_user')
        : null;
  const hasFollowUp = Boolean(
    postEmail.approval_rejection_reason || postEmail.queue_last_error
  );
  const canShowForceSend =
    canForceSendPosts &&
    Boolean(postEmail.post_id && postEmail.user_id && postEmail.has_check) &&
    Boolean(postEmail.email) &&
    postEmail.delivery_issue_reason !== 'missing_email' &&
    postEmail.stage !== 'processing' &&
    postEmail.stage !== 'queued' &&
    postEmail.stage !== 'sent';

  return (
    <div className="flex min-h-[36rem] flex-col rounded-lg border border-border/60 shadow-sm">
      <div className="flex flex-col gap-3 rounded-t-lg border-b px-4 py-4 backdrop-blur-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-semibold text-lg">{t('details_title')}</h3>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className={stageAppearance.className}>
              <stageAppearance.icon
                className={cn(
                  'mr-1 h-3.5 w-3.5',
                  stageAppearance.iconClassName
                )}
              />
              {t(stageAppearance.labelKey)}
            </Badge>
            {approvalAppearance && (
              <Badge variant="outline" className={approvalAppearance.className}>
                <approvalAppearance.icon className="mr-1 h-3.5 w-3.5" />
                {t(approvalAppearance.labelKey)}
              </Badge>
            )}
            {queueAppearance && (
              <Badge variant="outline" className={queueAppearance.className}>
                <queueAppearance.icon
                  className={cn(
                    'mr-1 h-3.5 w-3.5',
                    queueAppearance.iconClassName
                  )}
                />
                {t(queueAppearance.labelKey)}
              </Badge>
            )}
          </div>
        </div>
        {(canApprovePosts || canShowForceSend) &&
          postEmail.post_id &&
          postEmail.user_id &&
          postEmail.has_check && (
            <div className="flex flex-wrap items-center gap-2">
              {canApprovePosts && (
                <PostApprovalActions
                  wsId={wsId}
                  itemId={`${postEmail.post_id}:${postEmail.user_id}`}
                  approvalStatus={postEmail.approval_status ?? 'PENDING'}
                  queueStatus={postEmail.queue_status}
                  canRemoveApproval={postEmail.can_remove_approval}
                  compact
                />
              )}
              {canShowForceSend && (
                <ForceSendPostButton
                  wsId={wsId}
                  postId={postEmail.post_id}
                  userId={postEmail.user_id}
                  compact
                />
              )}
            </div>
          )}
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-5 p-5">
          <div className="flex items-start gap-4">
            <Avatar className="h-11 w-11 shadow-sm ring-2 ring-background">
              <AvatarFallback className="bg-primary/10 font-semibold text-primary text-sm">
                {(postEmail.recipient ?? postEmail.email ?? 'U')
                  .split(' ')
                  .map((chunk: string) => chunk[0])
                  .join('')
                  .slice(0, 2)
                  .toUpperCase()}
              </AvatarFallback>
            </Avatar>

            <div className="min-w-0 flex-1 space-y-1.5">
              <div>
                <h4 className="font-semibold text-base text-foreground">
                  {postEmail.recipient || '-'}
                </h4>
                <p className="text-muted-foreground text-sm">
                  {postEmail.email || '-'}
                </p>
              </div>

              <div className="flex flex-wrap gap-3 text-muted-foreground text-xs">
                {postEmail.group_id && (
                  <div className="flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    <Link
                      href={`/${wsId}/users/groups/${postEmail.group_id}`}
                      className="text-primary hover:underline"
                    >
                      {postEmail.group_name || '-'}
                    </Link>
                  </div>
                )}
                {postEmail.post_created_at && (
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {dayjs(postEmail.post_created_at).format(
                      'YYYY-MM-DD HH:mm'
                    )}
                  </div>
                )}
                {postEmail.is_completed != null && (
                  <div
                    className={cn(
                      'flex items-center gap-1',
                      postEmail.is_completed
                        ? 'text-dynamic-green'
                        : 'text-dynamic-red'
                    )}
                  >
                    <Check className="h-3 w-3" />
                    {postEmail.is_completed ? t('completed') : t('incomplete')}
                  </div>
                )}
              </div>
            </div>
          </div>

          {!postEmail.has_check && (
            <div className="rounded-lg border border-dynamic-blue/20 bg-dynamic-blue/5 p-3">
              <p className="font-medium text-dynamic-blue text-xs uppercase tracking-wide">
                {t('missing_check')}
              </p>
              <p className="mt-1 text-dynamic-blue text-sm">
                {t('missing_check_description')}
              </p>
            </div>
          )}

          {postEmail.stage === 'undeliverable' && deliveryIssueMessage && (
            <div className="rounded-lg border border-dynamic-orange/20 bg-dynamic-orange/5 p-3">
              <p className="font-medium text-dynamic-orange text-xs uppercase tracking-wide">
                {t('undeliverable')}
              </p>
              <p className="mt-1 text-dynamic-orange text-sm">
                {deliveryIssueMessage}
              </p>
            </div>
          )}

          <Separator />

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h5 className="flex items-center gap-2 font-semibold text-base">
                <FileText className="h-4 w-4" />
                {t('post_details')}
              </h5>
              {postEmail.post_id && postEmail.group_id && (
                <Button variant="outline" size="sm" asChild>
                  <Link
                    href={`/${wsId}/users/groups/${postEmail.group_id}/posts/${postEmail.post_id}`}
                    className="flex items-center gap-1"
                  >
                    <ExternalLink className="h-3 w-3" />
                    {t('view_post')}
                  </Link>
                </Button>
              )}
            </div>

            <div className="space-y-3">
              {postEmail.post_title && (
                <div>
                  <span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
                    {t('post_title')}
                  </span>
                  <p className="mt-1 font-medium text-sm">
                    {postEmail.post_title}
                  </p>
                </div>
              )}

              {postEmail.post_content && (
                <div>
                  <span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
                    {t('post_content')}
                  </span>
                  <div className="mt-1 rounded-lg border bg-muted/30 p-3">
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">
                      {postEmail.post_content}
                    </p>
                  </div>
                </div>
              )}

              {postEmail.notes && (
                <div>
                  <span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
                    {t('notes')}
                  </span>
                  <p className="mt-1 text-sm">{postEmail.notes}</p>
                </div>
              )}

              {postEmail.subject && (
                <div>
                  <span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
                    <Mail className="mr-1 inline h-3 w-3" />
                    {t('subject')}
                  </span>
                  <p className="mt-1 text-sm">{postEmail.subject}</p>
                </div>
              )}
            </div>
          </div>

          {hasFollowUp && (
            <>
              <Separator />

              {postEmail.approval_rejection_reason && (
                <div className="rounded-lg border border-dynamic-red/20 bg-dynamic-red/5 p-3">
                  <p className="font-medium text-dynamic-red text-xs uppercase tracking-wide">
                    {t('rejected')}
                  </p>
                  <p className="mt-1 text-dynamic-red text-sm">
                    {postEmail.approval_rejection_reason}
                  </p>
                </div>
              )}

              {postEmail.queue_last_error && (
                <div className="rounded-lg border border-dynamic-red/20 bg-dynamic-red/5 p-3">
                  <p className="font-medium text-dynamic-red text-xs uppercase tracking-wide">
                    {t('failed')}
                  </p>
                  <p className="mt-1 text-dynamic-red text-sm">
                    {postEmail.queue_last_error}
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
