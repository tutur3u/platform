'use client';

import { PencilIcon } from '@tuturuuu/icons';
import { Input } from '@tuturuuu/ui/input';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getWhiteboardMutationErrorKey,
  getWhiteboardTitleValidationError,
  normalizeWhiteboardTitle,
  WHITEBOARD_TITLE_MAX_LENGTH,
} from '../validation';

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
        const response = await fetch(
          `/api/v1/workspaces/${wsId}/whiteboards/${boardId}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            cache: 'no-store',
            body: JSON.stringify({
              title: trimmedTitle,
              updated_at: new Date().toISOString(),
            }),
          }
        );

        if (!response.ok) {
          const error = await response.json().catch(() => null);
          throw new Error(error?.error || 'Failed to update whiteboard');
        }
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
    [boardId, boardName, commonT, wsId]
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
