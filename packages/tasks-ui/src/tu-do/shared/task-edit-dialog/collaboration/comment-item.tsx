'use client';

import { Pencil, Trash2 } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ActorLabel } from './actor-label';
import { CommentBody } from './comment-body';
import { CommentComposer } from './comment-composer';
import { CommentDeleteDialog } from './comment-delete-dialog';
import { RelativeTime } from './relative-time';
import type { TaskComment } from './types';

interface CommentItemProps {
  comment: TaskComment;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: (id: string, body: string) => Promise<unknown>;
  onDelete: (id: string) => void;
  pending?: boolean;
}

export function CommentItem({
  comment,
  canEdit,
  canDelete,
  onEdit,
  onDelete,
  pending = false,
}: CommentItemProps) {
  const t = useTranslations('task-collaboration');
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  return (
    <li className="group space-y-1.5 py-3" data-testid="task-comment">
      <div className="flex flex-wrap items-center gap-2">
        <ActorLabel
          actor={comment.author}
          externalAuthor={comment.external_author}
          externalUrl={comment.external_url}
        />
        <RelativeTime value={comment.created_at} />
        {comment.edited_at && (
          <span className="text-muted-foreground text-xs">{t('edited')}</span>
        )}
        {(canEdit || canDelete) && !editing && (
          <span className="ml-auto flex items-center gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
            {canEdit && (
              <Button
                aria-label={t('edit')}
                className="h-7 w-7"
                onClick={() => setEditing(true)}
                size="icon"
                type="button"
                variant="ghost"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            )}
            {canDelete && (
              <Button
                aria-label={t('delete')}
                className="h-7 w-7"
                onClick={() => setConfirmingDelete(true)}
                size="icon"
                type="button"
                variant="ghost"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </span>
        )}
      </div>

      {editing ? (
        <CommentComposer
          autoFocus
          initialValue={comment.body}
          onCancel={() => setEditing(false)}
          onSubmit={async (body) => {
            await onEdit(comment.id, body);
            setEditing(false);
          }}
          pending={pending}
          submitLabel={t('save')}
        />
      ) : (
        <CommentBody body={comment.body} />
      )}

      <CommentDeleteDialog
        onConfirm={() => onDelete(comment.id)}
        onOpenChange={setConfirmingDelete}
        open={confirmingDelete}
      />
    </li>
  );
}
