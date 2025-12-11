'use client';

import {
  Ban,
  Calendar,
  Check,
  Clock,
  ExternalLink,
  Mail,
  MailCheck,
  Send,
  User,
  Users,
  X,
} from '@tuturuuu/icons';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { LoadingIndicator } from '@tuturuuu/ui/custom/loading-indicator';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { Separator } from '@tuturuuu/ui/separator';
import dayjs from 'dayjs';
import Link from 'next/link';
import { useLocale } from 'next-intl';
import { useEffect } from 'react';
import PostsRowActions from './row-actions';
import type { PostEmail } from './types';
import {
  isOptimisticallyLoading,
  isOptimisticallySent,
  useOptimisticLoadingEmails,
  useOptimisticSentEmails,
} from './use-posts';

interface PostDisplayProps {
  postEmail: PostEmail | null;
  blacklistedEmails?: Set<string>;
}

export function PostDisplay({
  postEmail,
  blacklistedEmails,
}: PostDisplayProps) {
  const locale = useLocale();
  const [optimisticSentEmails] = useOptimisticSentEmails();
  const [optimisticLoadingEmails] = useOptimisticLoadingEmails();

  // Set dayjs locale
  useEffect(() => {
    dayjs.locale(locale);
  }, [locale]);

  // Check if email is sent (either from server data or optimistically)
  const isSent = postEmail
    ? !!postEmail.email_id ||
      isOptimisticallySent(postEmail, optimisticSentEmails)
    : false;
  // Check if email is loading (either from local state or optimistically)
  const isLoading = postEmail
    ? isOptimisticallyLoading(postEmail, optimisticLoadingEmails)
    : false;

  // Check if email is blacklisted
  const isEmailBlacklisted = postEmail?.email
    ? (blacklistedEmails?.has(postEmail.email) ?? false)
    : false;

  if (!postEmail) {
    return (
      <div className="flex h-full items-center justify-center bg-muted/20">
        <div className="text-center text-muted-foreground">
          <Send className="mx-auto mb-4 h-12 w-12 opacity-50" />
          <p className="font-medium text-lg">Post Email Details</p>
          <p className="text-sm">
            Select a post email to view its details and manage actions
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-fit flex-col rounded-lg border">
      <div className="flex h-16 items-center justify-between rounded-t-lg border-b px-4 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-lg">Post Email Details</h3>
        </div>

        <div className="flex items-center gap-2">
          <PostsRowActions
            data={postEmail}
            isEmailBlacklisted={isEmailBlacklisted}
          />
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-6 p-6">
          {/* Recipient Information */}
          <div className="space-y-4">
            <div className="flex items-start gap-4">
              <Avatar className="h-12 w-12 shadow-sm ring-2 ring-background">
                <AvatarImage
                  alt={postEmail.recipient ?? postEmail.email ?? ''}
                />
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
                    {postEmail.recipient || 'Unknown Recipient'}
                  </h4>
                  <p className="flex items-center gap-1 text-muted-foreground text-sm">
                    <Mail className="h-3 w-3" />
                    {postEmail.email}
                  </p>
                </div>

                <div className="flex flex-wrap gap-3 text-muted-foreground text-xs">
                  <div className="flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    <Link
                      href={`/${postEmail.ws_id}/users/groups/${postEmail.group_id}`}
                      className="text-primary hover:underline"
                    >
                      {postEmail.group_name || 'Unknown Group'}
                    </Link>
                  </div>
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {dayjs(postEmail.post_created_at).format(
                      'YYYY-MM-DD HH:mm'
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <Separator />

          {/* Post Information */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h5 className="flex items-center gap-2 font-semibold text-base">
                <Send className="h-4 w-4" />
                Post Details
              </h5>
              {postEmail.post_id && postEmail.group_id && (
                <Button variant="outline" size="sm" asChild>
                  <Link
                    href={`/${postEmail.ws_id}/users/groups/${postEmail.group_id}/posts/${postEmail.post_id}`}
                    className="flex items-center gap-1"
                  >
                    <ExternalLink className="h-3 w-3" />
                    View Post
                  </Link>
                </Button>
              )}
            </div>

            <div className="space-y-3">
              <div>
                <span className="font-medium text-muted-foreground text-sm">
                  Title
                </span>
                <p className="mt-1 font-medium text-sm">
                  {postEmail.post_title || 'No title'}
                </p>
              </div>

              <div>
                <span className="font-medium text-muted-foreground text-sm">
                  Content
                </span>
                <div className="mt-1 rounded-lg border bg-muted/30 p-3">
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">
                    {postEmail.post_content || 'No content'}
                  </p>
                </div>
              </div>

              {postEmail.subject && (
                <div>
                  <span className="font-medium text-muted-foreground text-sm">
                    Email Subject
                  </span>
                  <p className="mt-1 font-medium text-sm">
                    {postEmail.subject}
                  </p>
                </div>
              )}
            </div>
          </div>

          <Separator />

          {/* Email Status */}
          <div className="space-y-4">
            <h5 className="flex items-center gap-2 font-semibold text-base">
              <MailCheck className="h-4 w-4" />
              Email Status
            </h5>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <span className="font-medium text-muted-foreground text-sm">
                  Status
                </span>
                <div className="flex items-center gap-2">
                  {isEmailBlacklisted ? (
                    <Badge
                      variant="outline"
                      className="border-dynamic-red/30 text-dynamic-red"
                    >
                      <Ban className="mr-1 h-3 w-3" />
                      Blocked
                    </Badge>
                  ) : isLoading ? (
                    <Badge
                      variant="secondary"
                      className="border-dynamic-blue/30 bg-dynamic-blue/10 text-dynamic-blue"
                    >
                      <LoadingIndicator className="mr-1 h-3 w-3" />
                      Sending...
                    </Badge>
                  ) : isSent ? (
                    <Badge
                      variant="default"
                      className="border-dynamic-green/30 bg-dynamic-green/10 text-dynamic-green"
                    >
                      <MailCheck className="mr-1 h-3 w-3" />
                      Sent
                    </Badge>
                  ) : (
                    <Badge
                      variant="secondary"
                      className="border-dynamic-orange/30 bg-dynamic-orange/10 text-dynamic-orange"
                    >
                      <Clock className="mr-1 h-3 w-3" />
                      Pending
                    </Badge>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <span className="font-medium text-muted-foreground text-sm">
                  Completion
                </span>
                <div className="flex items-center gap-2">
                  {postEmail.is_completed ? (
                    <Badge
                      variant="default"
                      className="border-dynamic-blue/30 bg-dynamic-blue/10 text-dynamic-blue"
                    >
                      <Check className="mr-1 h-3 w-3" />
                      Completed
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="border-dynamic-red/30 text-dynamic-red"
                    >
                      <X className="mr-1 h-3 w-3" />
                      Incomplete
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Notes */}
          {postEmail.notes && (
            <>
              <Separator />
              <div className="space-y-3">
                <h5 className="flex items-center gap-2 font-semibold text-base">
                  <User className="h-4 w-4" />
                  Notes
                </h5>
                <div className="rounded-lg border bg-muted/30 p-3">
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">
                    {postEmail.notes}
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
