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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import {
  MAX_LONG_TEXT_LENGTH,
  MAX_MEDIUM_TEXT_LENGTH,
  MAX_NAME_LENGTH,
} from '@tuturuuu/utils/constants';
import { useTranslations } from 'next-intl';
import { useCallback } from 'react';
import { PostInputField, PostTextareaField } from './post-form-field';
import type { UserGroupPostFormInput } from './use-posts';

interface PostDialogProps {
  isOpen: boolean;
  post: UserGroupPostFormInput | undefined;
  onClose: () => void;
  onFieldChange: (field: keyof UserGroupPostFormInput, value: string) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
}

export function PostDialog({
  isOpen,
  post,
  onClose,
  onFieldChange,
  onSubmit,
  isSubmitting,
}: PostDialogProps) {
  const t = useTranslations();
  const isOverLimit =
    (post?.title?.length ?? 0) > MAX_NAME_LENGTH ||
    (post?.content?.length ?? 0) > MAX_LONG_TEXT_LENGTH ||
    (post?.notes?.length ?? 0) > MAX_MEDIUM_TEXT_LENGTH;

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
    if (!(isSubmitting || isOverLimit)) {
      onSubmit();
    }
  }, [isOverLimit, isSubmitting, onSubmit]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex h-dvh max-h-dvh w-screen max-w-none flex-col gap-0 overflow-hidden p-0 sm:h-auto sm:max-h-[90vh] sm:w-full sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="px-4 pt-4 sm:px-6 sm:pt-6">
            {post?.id
              ? t('ws-user-groups.edit_post')
              : t('ws-user-groups.add_post')}
          </DialogTitle>
          <DialogDescription className="px-4 pb-4 sm:px-6">
            {post?.id
              ? t('ws-user-groups.edit_post_description')
              : t('ws-user-groups.add_post_description')}
          </DialogDescription>
        </DialogHeader>
        <Tabs
          defaultValue="content"
          className="flex min-h-0 flex-1 flex-col border-y"
        >
          <TabsList className="m-2 grid h-auto grid-cols-3 sm:mx-6 sm:mt-4">
            <TabsTrigger value="content" className="h-full">
              {t('reports-hub.post_dialog_content')}
            </TabsTrigger>
            <TabsTrigger value="review" className="h-full">
              {t('reports-hub.post_dialog_review')}
            </TabsTrigger>
            <TabsTrigger value="notes" className="h-full">
              {t('reports-hub.post_dialog_notes')}
            </TabsTrigger>
          </TabsList>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 sm:px-6">
            <TabsContent value="content" className="mt-2 grid gap-4">
              <PostInputField
                id="title"
                label={t('post-email-data-table.post_title')}
                limitMessage={t('ws-user-groups.shorten_field')}
                maxLength={MAX_NAME_LENGTH}
                name="title"
                onChange={handleTitleChange}
                placeholder={t('post-email-data-table.post_title_placeholder')}
                value={post?.title || ''}
              />
              <PostTextareaField
                id="content"
                label={t('post-email-data-table.post_content')}
                limitMessage={t('ws-user-groups.shorten_field')}
                maxLength={MAX_LONG_TEXT_LENGTH}
                name="content"
                onChange={handleContentChange}
                placeholder={t(
                  'post-email-data-table.post_content_placeholder'
                )}
                value={post?.content || ''}
              />
            </TabsContent>
            <TabsContent value="review" className="mt-2">
              <div className="rounded-lg border p-4">
                <p className="font-medium">
                  {t('reports-hub.post_dialog_review_title')}
                </p>
                <p className="mt-1 text-muted-foreground text-sm">
                  {t('reports-hub.post_dialog_review_description')}
                </p>
              </div>
            </TabsContent>
            <TabsContent value="notes" className="mt-2">
              <PostTextareaField
                id="notes"
                label={t('post-email-data-table.notes')}
                limitMessage={t('ws-user-groups.shorten_field')}
                maxLength={MAX_MEDIUM_TEXT_LENGTH}
                name="notes"
                onChange={handleNotesChange}
                placeholder={t('post-email-data-table.notes_placeholder')}
                value={post?.notes || ''}
              />
            </TabsContent>
          </div>
        </Tabs>
        <DialogFooter className="p-4 sm:px-6">
          <Button
            type="submit"
            onClick={handleSubmit}
            disabled={isSubmitting || isOverLimit}
          >
            {post?.id ? t('common.save') : t('common.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
