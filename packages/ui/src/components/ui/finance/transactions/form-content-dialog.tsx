'use client';

import type { QueryClient } from '@tanstack/react-query';
import type { TransactionCategory } from '@tuturuuu/types/primitives/TransactionCategory';
import type { Wallet as WalletType } from '@tuturuuu/types/primitives/Wallet';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { TransactionCategoryForm } from '@tuturuuu/ui/finance/transactions/categories/form';
import { WalletForm } from '@tuturuuu/ui/finance/wallets/form';
import { Input } from '@tuturuuu/ui/input';
import { toast } from '@tuturuuu/ui/sonner';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import type { Dispatch, SetStateAction } from 'react';
import type { UseFormReturn } from 'react-hook-form';

import type { TransactionFormValues } from './form-schema';
import type { NewContent, NewContentType } from './form-types';

interface FormContentDialogProps {
  wsId: string;
  queryClient: QueryClient;
  form: UseFormReturn<TransactionFormValues>;
  newContentType: NewContentType | undefined;
  setNewContentType: Dispatch<SetStateAction<NewContentType | undefined>>;
  newContent: NewContent;
  setNewContent: Dispatch<SetStateAction<NewContent>>;
  newTagColor: string;
  setNewTagColor: Dispatch<SetStateAction<string>>;
}

const PRESET_TAG_COLORS = [
  '#ef4444',
  '#f97316',
  '#84cc16',
  '#10b981',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
];

export function FormContentDialog({
  wsId,
  queryClient,
  form,
  newContentType,
  setNewContentType,
  newContent,
  setNewContent,
  newTagColor,
  setNewTagColor,
}: FormContentDialogProps) {
  const t = useTranslations();
  const handleCreateTag = async () => {
    if (!newContent || !('name' in newContent) || !newContent.name) return;

    try {
      const res = await fetch(`/api/workspaces/${wsId}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newContent.name,
          color: newTagColor,
        }),
      });

      if (res.ok) {
        const createdTag = await res.json();
        queryClient.invalidateQueries({
          queryKey: [`/api/workspaces/${wsId}/tags`],
        });
        const currentTags = form.getValues('tag_ids') || [];
        form.setValue('tag_ids', [...currentTags, createdTag.id]);
        setNewContent(undefined);
        setNewContentType(undefined);
        toast.success(t('ws-tags.created'));
      } else {
        toast.error(t('ws-tags.error_creating'));
      }
    } catch {
      toast.error(t('ws-tags.error_creating'));
    }
  };

  return (
    <Dialog
      open={!!newContent}
      onOpenChange={(open) =>
        setNewContent(open ? newContent || { name: '' } : undefined)
      }
    >
      <DialogContent onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>
            {newContentType === 'wallet'
              ? t('ws-wallets.create')
              : newContentType === 'tag'
                ? t('ws-tags.create')
                : t('ws-transaction-categories.create')}
          </DialogTitle>
        </DialogHeader>
        {newContentType === 'wallet' ? (
          <WalletForm
            wsId={wsId}
            data={newContent as WalletType}
            onFinish={() => {
              setNewContent(undefined);
              setNewContentType(undefined);
              queryClient.invalidateQueries({
                queryKey: [`/api/workspaces/${wsId}/wallets`],
              });
            }}
          />
        ) : newContentType === 'tag' ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="font-medium text-sm">{t('ws-tags.name')}</label>
              <Input
                value={(newContent as { name: string })?.name || ''}
                onChange={(e) => setNewContent({ name: e.target.value })}
                placeholder={t('ws-tags.name_placeholder')}
              />
            </div>
            <div className="space-y-2">
              <label className="font-medium text-sm">
                {t('ws-tags.color')}
              </label>
              <div className="flex flex-wrap gap-2">
                {PRESET_TAG_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={cn(
                      'h-8 w-8 rounded-full border-2 transition-transform hover:scale-110',
                      newTagColor === color
                        ? 'border-foreground'
                        : 'border-transparent'
                    )}
                    style={{ backgroundColor: color }}
                    onClick={() => setNewTagColor(color)}
                  />
                ))}
              </div>
            </div>
            <Button onClick={handleCreateTag} className="w-full">
              {t('ws-tags.create')}
            </Button>
          </div>
        ) : (
          <TransactionCategoryForm
            wsId={wsId}
            data={newContent as TransactionCategory}
            onFinish={() => {
              setNewContent(undefined);
              setNewContentType(undefined);
              queryClient.invalidateQueries({
                queryKey: [`/api/workspaces/${wsId}/transactions/categories`],
              });
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
