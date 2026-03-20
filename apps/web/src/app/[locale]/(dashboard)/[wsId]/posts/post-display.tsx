'use client';

import { Calendar, ExternalLink, Send, Users } from '@tuturuuu/icons';
import { Avatar, AvatarFallback } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { Separator } from '@tuturuuu/ui/separator';
import dayjs from 'dayjs';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { PostApprovalActions } from '@/components/post-approval-actions';
import PostsRowActions from './row-actions';
import type { PostEmail } from './types';

export function PostDisplay({
  wsId,
  postEmail,
  canApprovePosts = false,
}: {
  wsId: string;
  postEmail: PostEmail | null;
  canApprovePosts?: boolean;
}) {
  const locale = useLocale();
  const t = useTranslations('post-email-data-table');

  useEffect(() => {
    dayjs.locale(locale);
  }, [locale]);

  if (!postEmail) {
    return (
      <div className="flex h-full items-center justify-center bg-muted/20">
        <div className="text-center text-muted-foreground">
          <Send className="mx-auto mb-4 h-12 w-12 opacity-50" />
          <p className="font-medium text-lg">{t('details_title')}</p>
          <p className="text-sm">{t('details_description')}</p>
        </div>
      </div>
    );
  }

  const approvalClassName =
    postEmail.approval_status === 'APPROVED'
      ? 'border-dynamic-green/20 bg-dynamic-green/10 text-dynamic-green'
      : postEmail.approval_status === 'REJECTED'
        ? 'border-dynamic-red/20 bg-dynamic-red/10 text-dynamic-red'
        : 'border-dynamic-yellow/20 bg-dynamic-yellow/10 text-dynamic-yellow';
  const hasFollowUp = Boolean(
    postEmail.approval_rejection_reason || postEmail.queue_last_error
  );

  return (
    <div className="flex h-fit flex-col rounded-lg border">
      <div className="flex flex-col gap-3 rounded-t-lg border-b px-4 py-4 backdrop-blur-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-semibold text-lg">{t('details_title')}</h3>
          <div className="flex flex-wrap items-center gap-2">
            <PostsRowActions data={postEmail} />
            <Badge variant="outline" className={approvalClassName}>
              {(postEmail.approval_status ?? '-').toLowerCase()}
            </Badge>
          </div>
        </div>
        {canApprovePosts && postEmail.post_id && postEmail.user_id && (
          <PostApprovalActions
            wsId={wsId}
            itemId={`${postEmail.post_id}:${postEmail.user_id}`}
            approvalStatus={postEmail.approval_status ?? 'PENDING'}
            canRemoveApproval={postEmail.can_remove_approval}
            compact
          />
        )}
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-6 p-6">
          <div className="space-y-4">
            <div className="flex items-start gap-4">
              <Avatar className="h-12 w-12 shadow-sm ring-2 ring-background">
                <AvatarFallback className="bg-primary/10 font-semibold text-primary text-sm">
                  {(postEmail.recipient ?? postEmail.email ?? 'U')
                    .split(' ')
                    .map((chunk: string) => chunk[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase()}
                </AvatarFallback>
              </Avatar>

              <div className="min-w-0 flex-1 space-y-2">
                <div>
                  <h4 className="font-semibold text-base text-foreground">
                    {postEmail.recipient || '-'}
                  </h4>
                  <p className="text-muted-foreground text-sm">
                    {postEmail.email || '-'}
                  </p>
                </div>

                <div className="flex flex-wrap gap-3 text-muted-foreground text-xs">
                  <div className="flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    <Link
                      href={`/${wsId}/users/groups/${postEmail.group_id}`}
                      className="text-primary hover:underline"
                    >
                      {postEmail.group_name || '-'}
                    </Link>
                  </div>
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {postEmail.post_created_at
                      ? dayjs(postEmail.post_created_at).format(
                          'YYYY-MM-DD HH:mm'
                        )
                      : '-'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <Separator />

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h5 className="flex items-center gap-2 font-semibold text-base">
                <Send className="h-4 w-4" />
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
              <div>
                <span className="font-medium text-muted-foreground text-sm">
                  {t('post_title')}
                </span>
                <p className="mt-1 font-medium text-sm">
                  {postEmail.post_title || '-'}
                </p>
              </div>

              <div>
                <span className="font-medium text-muted-foreground text-sm">
                  {t('post_content')}
                </span>
                <div className="mt-1 rounded-lg border bg-muted/30 p-3">
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">
                    {postEmail.post_content || '-'}
                  </p>
                </div>
              </div>

              {postEmail.notes && (
                <div>
                  <span className="font-medium text-muted-foreground text-sm">
                    {t('notes')}
                  </span>
                  <p className="mt-1 text-sm">{postEmail.notes}</p>
                </div>
              )}
            </div>
          </div>

          {hasFollowUp && (
            <>
              <Separator />

              {postEmail.approval_rejection_reason && (
                <div className="rounded-lg border border-dynamic-red/20 bg-dynamic-red/5 p-3 text-dynamic-red text-sm">
                  {postEmail.approval_rejection_reason}
                </div>
              )}

              {postEmail.queue_last_error && (
                <div className="rounded-lg border border-dynamic-red/20 bg-dynamic-red/5 p-3 text-dynamic-red text-sm">
                  {postEmail.queue_last_error}
                </div>
              )}
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
