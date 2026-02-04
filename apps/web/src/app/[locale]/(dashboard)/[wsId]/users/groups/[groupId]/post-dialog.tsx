'use client';

import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import { memo, useCallback } from 'react';
import type { UserGroupPostFormInput } from './use-posts';

interface PostDialogProps {
  isOpen: boolean;
  post: UserGroupPostFormInput | undefined;
  onClose: () => void;
  onFieldChange: (field: keyof UserGroupPostFormInput, value: string) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
}

// Memoized input components to prevent unnecessary re-renders
const MemoizedInput = memo(function MemoizedInput({
  id,
  name,
  value,
  placeholder,
  onChange,
}: {
  id: string;
  name: string;
  value: string;
  placeholder: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <Input
      id={id}
      name={name}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      className="col-span-3"
    />
  );
});

const MemoizedTextarea = memo(function MemoizedTextarea({
  id,
  name,
  value,
  placeholder,
  onChange,
}: {
  id: string;
  name: string;
  value: string;
  placeholder: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
}) {
  return (
    <Textarea
      id={id}
      name={name}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      className="col-span-3"
    />
  );
});

export function PostDialog({
  isOpen,
  post,
  onClose,
  onFieldChange,
  onSubmit,
  isSubmitting,
}: PostDialogProps) {
  const t = useTranslations();

  // Stable callback handlers that won't cause child re-renders
  const handleTitleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onFieldChange('title', e.target.value);
    },
    [onFieldChange]
  );

  const handleContentChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onFieldChange('content', e.target.value);
    },
    [onFieldChange]
  );

  const handleNotesChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onFieldChange('notes', e.target.value);
    },
    [onFieldChange]
  );

  const handleSubmit = useCallback(() => {
    if (!isSubmitting) {
      onSubmit();
    }
  }, [isSubmitting, onSubmit]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-106.25">
        <DialogHeader>
          <DialogTitle>
            {post?.id
              ? t('ws-user-groups.edit_post')
              : t('ws-user-groups.add_post')}
          </DialogTitle>
          <DialogDescription>
            {post?.id
              ? t('ws-user-groups.edit_post_description')
              : t('ws-user-groups.add_post_description')}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid items-center gap-2">
            <Label htmlFor="title">
              {t('post-email-data-table.post_title')}
            </Label>
            <MemoizedInput
              id="title"
              name="title"
              placeholder={t('post-email-data-table.post_title_placeholder')}
              value={post?.title || ''}
              onChange={handleTitleChange}
            />
          </div>
          <div className="grid items-center gap-2">
            <Label htmlFor="content">
              {t('post-email-data-table.post_content')}
            </Label>
            <MemoizedTextarea
              id="content"
              name="content"
              placeholder={t('post-email-data-table.post_content_placeholder')}
              value={post?.content || ''}
              onChange={handleContentChange}
            />
          </div>
          <div className="grid items-center gap-2">
            <Label htmlFor="notes">{t('post-email-data-table.notes')}</Label>
            <MemoizedTextarea
              id="notes"
              name="notes"
              placeholder={t('post-email-data-table.notes_placeholder')}
              value={post?.notes || ''}
              onChange={handleNotesChange}
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="submit" onClick={handleSubmit} disabled={isSubmitting}>
            {post?.id ? t('common.save') : t('common.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
