'use client';

import { EditIcon, Loader2, TrashIcon } from '@tuturuuu/icons';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Textarea } from '@tuturuuu/ui/textarea';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';
import {
  useDeleteComment,
  useUpdateComment,
} from '../hooks/use-request-mutations';
import type { TimeTrackingRequestComment } from '../hooks/use-request-comments';

dayjs.extend(relativeTime);

interface CommentItemProps {
  comment: TimeTrackingRequestComment;
  wsId: string;
  requestId: string;
  currentUserId: string | null;
  showActions: boolean;
}

export function CommentItem({
  comment,
  wsId,
  requestId,
  currentUserId,
  showActions,
}: CommentItemProps) {
  const t = useTranslations('time-tracker.requests');
  const updateMutation = useUpdateComment();
  const deleteMutation = useDeleteComment();

  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(comment.content);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const isOwnComment = currentUserId === comment.user_id;
  const fifteenMinutesAgo = dayjs().subtract(15, 'minute');
  const commentCreated = dayjs(comment.created_at);
  const canEditDelete =
    isOwnComment && commentCreated.isAfter(fifteenMinutesAgo);

  const handleSaveEdit = useCallback(() => {
    if (!editContent.trim()) {
      return;
    }

    updateMutation.mutate(
      {
        wsId,
        requestId,
        commentId: comment.id,
        content: editContent.trim(),
      },
      {
        onSuccess: () => {
          setIsEditing(false);
        },
      }
    );
  }, [editContent, wsId, requestId, comment.id, updateMutation]);

  const handleDelete = useCallback(() => {
    deleteMutation.mutate(
      {
        wsId,
        requestId,
        commentId: comment.id,
      },
      {
        onSuccess: () => {
          setShowDeleteDialog(false);
        },
      }
    );
  }, [wsId, requestId, comment.id, deleteMutation]);

  const formatRelativeTime = useCallback(
    (dateString: string) => {
      const date = dayjs(dateString);
      const now = dayjs();
      const diffInMinutes = now.diff(date, 'minute');

      if (diffInMinutes < 1) {
        return t('comments.justNow');
      } else if (diffInMinutes < 60) {
        return date.fromNow();
      } else if (diffInMinutes < 24 * 60) {
        return date.format('MMM D, h:mm A');
      } else {
        return date.format('MMM D, YYYY');
      }
    },
    [t]
  );

  return (
    <div className="flex gap-3">
      {/* Avatar */}
      <Avatar className="h-8 w-8 shrink-0">
        <AvatarImage src={comment.user.avatar_url || ''} />
        <AvatarFallback className="bg-linear-to-br from-dynamic-blue to-dynamic-purple font-semibold text-xs text-white">
          {comment.user.display_name?.[0] || 'U'}
        </AvatarFallback>
      </Avatar>

      {/* Comment Content */}
      <div className="flex-1 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">
              {comment.user.display_name || 'Unknown User'}
            </span>
            <span className="text-muted-foreground text-xs">
              {formatRelativeTime(comment.created_at)}
            </span>
          </div>

          {/* Actions Dropdown */}
          {showActions && canEditDelete && (
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsEditing(true)}
                className="h-6 w-6"
              >
                <EditIcon className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowDeleteDialog(true)}
                className="h-6 w-6 text-dynamic-red hover:text-dynamic-red/80"
              >
                <TrashIcon className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>

        {/* Comment Content / Edit Mode */}
        {isEditing ? (
          <div className="space-y-2">
            <Textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              rows={3}
              className="text-sm"
              disabled={updateMutation.isPending}
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setIsEditing(false);
                  setEditContent(comment.content);
                }}
                disabled={updateMutation.isPending}
              >
                {t('comments.cancelEdit')}
              </Button>
              <Button
                size="sm"
                onClick={handleSaveEdit}
                disabled={updateMutation.isPending || !editContent.trim()}
              >
                {updateMutation.isPending && (
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                )}
                {t('comments.saveComment')}
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-foreground/80 whitespace-pre-wrap text-sm">
            {comment.content}
          </p>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('comments.deleteComment')}</DialogTitle>
            <DialogDescription>{t('comments.deleteConfirm')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
              disabled={deleteMutation.isPending}
            >
              {t('detail.cancelEditButton')}
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {t('comments.deleteComment')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
