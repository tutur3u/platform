'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PencilIcon } from '@tuturuuu/icons';
import {
  updateWorkspaceWhiteboard,
  type WorkspaceWhiteboardDetail,
} from '@tuturuuu/internal-api/whiteboards';
import { Input } from '@tuturuuu/ui/input';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getWhiteboardMutationErrorKey,
  getWhiteboardTitleValidationError,
  normalizeWhiteboardTitle,
  WHITEBOARD_TITLE_MAX_LENGTH,
} from './validation';
import { whiteboardKeys } from './whiteboard-types';

// Title save debounce (500ms)
const TITLE_SAVE_DEBOUNCE_MS = 500;

interface WhiteboardTitleProps {
  wsId: string;
  boardId: string;
  boardName: string;
}

export function WhiteboardTitle({
  wsId,
  boardId,
  boardName,
}: WhiteboardTitleProps) {
  const commonT = useTranslations('common');
  const queryClient = useQueryClient();
  const renameMutation = useMutation({
    mutationFn: (title: string) =>
      updateWorkspaceWhiteboard(wsId, boardId, {
        title,
        updated_at: new Date().toISOString(),
      }),
    onSuccess: (updated) => {
      // The board view keeps its snapshot; only the shown title changes.
      queryClient.setQueryData<WorkspaceWhiteboardDetail>(
        whiteboardKeys.detail(wsId, boardId),
        (current) => current && { ...current, title: updated.title }
      );
      return queryClient.invalidateQueries({
        queryKey: whiteboardKeys.list(wsId),
      });
    },
  });

  const [isEditing, setIsEditing] = useState(false);
  const [editedTitle, setEditedTitle] = useState(boardName);

  const inputRef = useRef<HTMLInputElement>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  const saveTitle = useCallback(
    async (newTitle: string) => {
      const validationError = getWhiteboardTitleValidationError(newTitle);
      if (validationError) {
        toast.error(commonT(validationError));
        setEditedTitle(boardName);
        return;
      }

      const trimmedTitle = normalizeWhiteboardTitle(newTitle);
      if (!trimmedTitle || trimmedTitle === boardName) {
        setEditedTitle(boardName);
        return;
      }

      try {
        await renameMutation.mutateAsync(trimmedTitle);
        setEditedTitle(trimmedTitle);
      } catch (error) {
        console.error('Failed to save title:', error);
        const errorKey = getWhiteboardMutationErrorKey(
          error as Error & { details?: string }
        );
        toast.error(
          errorKey ? commonT(errorKey) : commonT('update_whiteboard_error')
        );
        setEditedTitle(boardName);
      }
    },
    [boardName, commonT, renameMutation]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      setEditedTitle(newValue);

      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = setTimeout(() => {
        void saveTitle(newValue);
      }, TITLE_SAVE_DEBOUNCE_MS);
    },
    [saveTitle]
  );

  const handleBlur = useCallback(() => {
    setIsEditing(false);
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    void saveTitle(editedTitle);
  }, [saveTitle, editedTitle]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        inputRef.current?.blur();
      } else if (e.key === 'Escape') {
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        setEditedTitle(boardName);
        setIsEditing(false);
      }
    },
    [boardName]
  );

  const handleClick = useCallback(() => {
    setIsEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }, []);

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      {isEditing ? (
        <Input
          ref={inputRef}
          value={editedTitle}
          onChange={handleChange}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className="h-8 max-w-md font-semibold text-lg"
          autoFocus
          maxLength={WHITEBOARD_TITLE_MAX_LENGTH}
        />
      ) : (
        <button
          type="button"
          onClick={handleClick}
          className="group flex min-w-0 items-center gap-2 rounded-md px-2 py-1 hover:bg-muted"
        >
          <h1 className="truncate font-semibold text-lg">{editedTitle}</h1>
          <PencilIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
        </button>
      )}
    </div>
  );
}
