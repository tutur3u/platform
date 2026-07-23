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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
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
              <div className="grid items-center gap-2">
                <Label htmlFor="title">
                  {t('post-email-data-table.post_title')}
                </Label>
                <MemoizedInput
                  id="title"
                  name="title"
                  placeholder={t(
                    'post-email-data-table.post_title_placeholder'
                  )}
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
                  placeholder={t(
                    'post-email-data-table.post_content_placeholder'
                  )}
                  value={post?.content || ''}
                  onChange={handleContentChange}
                />
              </div>
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
              <div className="grid items-center gap-2">
                <Label htmlFor="notes">
                  {t('post-email-data-table.notes')}
                </Label>
                <MemoizedTextarea
                  id="notes"
                  name="notes"
                  placeholder={t('post-email-data-table.notes_placeholder')}
                  value={post?.notes || ''}
                  onChange={handleNotesChange}
                />
              </div>
            </TabsContent>
          </div>
        </Tabs>
        <DialogFooter className="p-4 sm:px-6">
          <Button type="submit" onClick={handleSubmit} disabled={isSubmitting}>
            {post?.id ? t('common.save') : t('common.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
