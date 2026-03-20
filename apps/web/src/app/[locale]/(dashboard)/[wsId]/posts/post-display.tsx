'use client';

import {
  Calendar,
  ExternalLink,
  MailCheck,
  Send,
  Users,
} from '@tuturuuu/icons';
import { Avatar, AvatarFallback } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { Separator } from '@tuturuuu/ui/separator';
import dayjs from 'dayjs';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect } from 'react';
import PostsRowActions from './row-actions';
import type { PostEmail } from './types';

export function PostDisplay({ postEmail }: { postEmail: PostEmail | null }) {
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

  return (
    <div className="flex h-fit flex-col rounded-lg border">
      <div className="flex h-16 items-center justify-between rounded-t-lg border-b px-4 backdrop-blur-sm">
        <h3 className="font-semibold text-lg">{t('details_title')}</h3>
        <PostsRowActions data={postEmail} />
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
                      href={`/${postEmail.ws_id}/users/groups/${postEmail.group_id}`}
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
                    href={`/${postEmail.ws_id}/users/groups/${postEmail.group_id}/posts/${postEmail.post_id}`}
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

          <Separator />

          <div className="space-y-4">
            <h5 className="flex items-center gap-2 font-semibold text-base">
              <MailCheck className="h-4 w-4" />
              {t('queue_status')}
            </h5>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <span className="font-medium text-muted-foreground text-sm">
                  {t('queue_status')}
                </span>
                <PostsRowActions data={postEmail} />
              </div>
              <div className="space-y-2">
                <span className="font-medium text-muted-foreground text-sm">
                  {t('approval_status')}
                </span>
                <Badge variant="outline" className="capitalize">
                  {postEmail.post_approval_status?.toLowerCase() || '-'}
                </Badge>
              </div>
            </div>

            {postEmail.queue_last_error && (
              <div className="rounded-lg border border-dynamic-red/20 bg-dynamic-red/5 p-3 text-dynamic-red text-sm">
                {postEmail.queue_last_error}
              </div>
            )}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
