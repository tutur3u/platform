'use client';

import { Loader2, SendIcon } from '@tuturuuu/icons';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Button } from '@tuturuuu/ui/button';
import { Kbd } from '@tuturuuu/ui/kbd';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';
import { useAddComment } from '../hooks/use-request-mutations';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';

interface CommentFormProps {
  wsId: string;
  requestId: string;
  currentUser: WorkspaceUser | null;
}

export function CommentForm({
  wsId,
  requestId,
  currentUser,
}: CommentFormProps) {
  const t = useTranslations('time-tracker.requests');
  const addComment = useAddComment();

  const [content, setContent] = useState('');

  const handleSubmit = useCallback(() => {
    if (!content.trim() || !currentUser) {
      return;
    }

    addComment.mutate(
      {
        wsId,
        requestId,
        content: content.trim(),
      },
      {
        onSuccess: () => {
          setContent('');
        },
      }
    );
  }, [content, wsId, requestId, currentUser, addComment]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Submit on Ctrl/Cmd + Enter
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  return (
    <div className="space-y-3">
      <div className="flex gap-3">
        {/* Current User Avatar */}
        <Avatar className="h-8 w-8 shrink-0">
          <AvatarImage src={currentUser?.avatar_url || ''} />
          <AvatarFallback className="bg-linear-to-br from-dynamic-blue to-dynamic-purple font-semibold text-xs text-white">
            {currentUser?.display_name?.[0] || 'U'}
          </AvatarFallback>
        </Avatar>

        {/* Comment Input */}
        <div className="flex-1 space-y-2">
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('comments.addComment')}
            rows={2}
            className="resize-none text-sm"
            disabled={!currentUser || addComment.isPending}
          />

          {/* Submit Button */}
          <div className="flex items-center justify-end gap-2">
            <span className="text-muted-foreground text-xs flex items-center gap-1">
              <Kbd>Ctrl</Kbd>
              <span>+</span>
              <Kbd>Enter</Kbd>
              <span>
                {t('comments.sendShortcut').replace('Ctrl + Enter', '').trim()}
              </span>
            </span>
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={!currentUser || !content.trim() || addComment.isPending}
              className="gap-1.5"
            >
              {addComment.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <SendIcon className="h-3.5 w-3.5" />
              )}
              <span>{t('comments.postComment')}</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
