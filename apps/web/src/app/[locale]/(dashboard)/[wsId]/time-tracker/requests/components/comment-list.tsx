'use client';

import { Loader2 } from '@tuturuuu/icons';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@tuturuuu/ui/accordion';
import { useTranslations } from 'next-intl';
import { useRequestComments } from '../hooks/use-request-comments';
import { CommentItem } from './comment-item';
import { CommentForm } from './comment-form';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';

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
        defaultValue="comments-section"
        className="border-0"
      >
        <AccordionItem value="comments-section" className="border-b-0">
          <AccordionTrigger className="rounded-lg border hover:bg-muted/50 px-4 py-3">
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2">
                <span className="font-semibold">{t('comments.title')}</span>
                <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs">
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
                  {t('detail.loadingMedia')}
                </span>
              </div>
            ) : !comments || comments.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
                <Avatar className="h-12 w-12 opacity-50">
                  <AvatarImage src={currentUser?.avatar_url ?? ''} />
                  <AvatarFallback className="bg-muted text-muted-foreground">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-6 w-6"
                    >
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
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
