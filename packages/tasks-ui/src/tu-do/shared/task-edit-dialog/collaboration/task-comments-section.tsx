'use client';

import { Loader2 } from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';
import { CommentComposer } from './comment-composer';
import { CommentItem } from './comment-item';
import type { TaskComment } from './types';
import { useTaskCommentMutations, useTaskComments } from './use-task-comments';

interface TaskCommentsSectionProps {
  wsId: string;
  taskId: string;
  currentUserId?: string | null;
  /** True for holders of manage_projects, who may delete any comment. */
  canModerate?: boolean;
  disabled?: boolean;
}

export function TaskCommentsSection({
  wsId,
  taskId,
  currentUserId,
  canModerate = false,
  disabled = false,
}: TaskCommentsSectionProps) {
  const t = useTranslations('task-collaboration');
  const { data: comments, isLoading, error } = useTaskComments(wsId, taskId);
  const { create, update, remove } = useTaskCommentMutations({
    wsId,
    taskId,
    failureMessage: t('comment_failed'),
  });

  return (
    <div className="space-y-3">
      {isLoading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <p className="py-4 text-center text-muted-foreground text-sm">
          {t('comments_load_failed')}
        </p>
      ) : comments && comments.length > 0 ? (
        <ul className="divide-y">
          {comments.map((comment: TaskComment) => {
            const isAuthor =
              !!currentUserId && comment.author?.id === currentUserId;
            return (
              <CommentItem
                canDelete={!disabled && (isAuthor || canModerate)}
                canEdit={!disabled && isAuthor}
                comment={comment}
                key={comment.id}
                onDelete={(id) => remove.mutate(id)}
                onEdit={(id, body) => update.mutateAsync({ id, body })}
                pending={update.isPending}
              />
            );
          })}
        </ul>
      ) : (
        <p className="py-4 text-center text-muted-foreground text-sm">
          {t('no_comments')}
        </p>
      )}

      {!disabled && (
        <CommentComposer
          onSubmit={(body) => create.mutateAsync(body)}
          pending={create.isPending}
        />
      )}
    </div>
  );
}
