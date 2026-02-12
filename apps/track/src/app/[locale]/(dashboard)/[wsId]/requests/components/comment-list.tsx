'use client';

import { Loader2, MessageSquareIcon } from '@tuturuuu/icons';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@tuturuuu/ui/accordion';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { useTranslations } from 'next-intl';
import { useRequestComments } from '../hooks/use-request-comments';
import { CommentForm } from './comment-form';
import { CommentItem } from './comment-item';

interface CommentListProps {
  requestId: string;
  wsId: string;
  currentUser: WorkspaceUser | null;
  canViewComments: boolean;
  hasManagePermission: boolean;
}

export function CommentList({
  requestId,
  wsId,
  currentUser,
  canViewComments,
  hasManagePermission,
}: CommentListProps) {
  const t = useTranslations('time-tracker.requests');
  const { data: comments, isLoading } = useRequestComments(
    wsId,
    requestId,
    canViewComments
  );

  if (!canViewComments) {
    return null;
  }

  return (
    <div className="space-y-4">
      {/* Comments Section Header with Accordion */}
      <Accordion
        type="single"
        collapsible
        // defaultValue="comments-section"
        className="border-0"
      >
        <AccordionItem value="comments-section" className="border-b-0">
          <AccordionTrigger className="rounded-lg border px-4 py-3 hover:bg-muted/50">
            <div className="flex w-full items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquareIcon className="h-5 w-5 text-muted-foreground" />
                <span className="font-semibold">{t('comments.title')}</span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground text-xs">
                  {comments?.length || 0}
                </span>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="space-y-4 pt-4">
            {/* Comment Form */}
            <CommentForm
              wsId={wsId}
              requestId={requestId}
              currentUser={currentUser}
            />

            {/* Comments List */}
            {isLoading ? (
              <div className="flex items-center justify-center gap-2 py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                <span className="text-muted-foreground text-sm">
                  {t('comments.loading')}
                </span>
              </div>
            ) : !comments || comments.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
                <Avatar className="h-12 w-12 opacity-50">
                  <AvatarImage src={currentUser?.avatar_url ?? ''} />
                  <AvatarFallback className="bg-muted text-muted-foreground">
                    <MessageSquareIcon className="h-5 w-5 text-muted-foreground" />
                  </AvatarFallback>
                </Avatar>
                <p className="text-muted-foreground text-sm">
                  {t('comments.noComments')}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {comments.map((comment) => (
                  <CommentItem
                    key={comment.id}
                    comment={comment}
                    wsId={wsId}
                    requestId={requestId}
                    currentUserId={currentUser?.id || null}
                    showActions={
                      currentUser?.id === comment.user_id || hasManagePermission
                    }
                  />
                ))}
              </div>
            )}
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
