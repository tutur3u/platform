'use client';

import { Coins, FileText, FolderOpen, Lock, PlusIcon } from '@tuturuuu/icons';
import { Combobox } from '@tuturuuu/ui/custom/combobox';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@tuturuuu/ui/form';
import { useTranslations } from 'next-intl';
import type { UseFormReturn } from 'react-hook-form';

import type { TransactionFormValues } from './form-schema';
import type { NewContent, NewContentType } from './form-types';
import { Switch } from '@tuturuuu/ui/switch';

interface FormMoreTabProps {
  form: UseFormReturn<TransactionFormValues>;
  tags: Array<{ id: string; name: string; color: string }> | undefined;
  tagsLoading: boolean;
  loading: boolean;
  hasFormPermission: boolean;
  canManageConfidential: boolean;
  isTransfer: boolean;
  setNewContentType: (value: NewContentType) => void;
  setNewContent: (value: NewContent) => void;
}

export function FormMoreTab({
  form,
  tags,
  tagsLoading,
  loading,
  hasFormPermission,
  canManageConfidential,
  isTransfer,
  setNewContentType,
  setNewContent,
}: FormMoreTabProps) {
  const t = useTranslations();
  return (
    <div className="space-y-4">
      <FormField
        control={form.control}
        name="tag_ids"
        render={({ field }) => (
          <FormItem className="flex flex-col">
            <FormLabel>{t('transaction-data-table.tags')}</FormLabel>
            <Combobox
              t={t}
              {...field}
              mode="multiple"
              options={
                tags
                  ? tags.map((tag) => ({
                      value: tag.id || '',
                      label: tag.name || '',
                      color: tag.color,
                    }))
                  : []
              }
              label={tagsLoading ? 'Loading...' : undefined}
              placeholder={
                !tagsLoading && (!tags || tags.length === 0)
                  ? t('transaction-data-table.no_tags_hint')
                  : t('transaction-data-table.select_tags')
              }
              selected={field.value || []}
              onChange={field.onChange}
              actions={[
                {
                  key: 'add-tag',
                  label: t('common.add'),
                  icon: <PlusIcon className="h-4 w-4 shrink-0" />,
                  onSelect: () => {
                    setNewContentType('tag');
                    setNewContent({ name: '' });
                  },
                },
              ]}
              actionsPosition="top"
              disabled={loading || tagsLoading || !hasFormPermission}
            />
            <FormDescription>
              {t('transaction-data-table.tags_description')}
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="report_opt_in"
        render={({ field }) => (
          <FormItem className="flex items-center justify-between rounded-lg border p-3">
            <div className="space-y-0.5">
              <FormLabel className="text-sm">
                {t('transaction-data-table.report_opt_in')}
              </FormLabel>
              <FormDescription className="text-xs">
                {t('transaction-data-table.report_opt_in_description')}
              </FormDescription>
            </div>
            <FormControl>
              <Switch
                checked={field.value}
                onCheckedChange={field.onChange}
                disabled={!hasFormPermission}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      {canManageConfidential && !isTransfer && (
        <div className="rounded-lg border border-dynamic-orange/30 bg-dynamic-orange/5 p-3">
          <div className="mb-3 flex items-center gap-2">
            <Lock className="h-4 w-4 text-dynamic-orange" />
            <span className="font-medium text-sm">
              {t('workspace-finance-transactions.mark-as-confidential')}
            </span>
          </div>

          <div className="grid gap-2">
            <FormField
              control={form.control}
              name="is_amount_confidential"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-md bg-background/50 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Coins className="h-4 w-4 text-muted-foreground" />
                    <FormLabel className="mt-0! font-normal text-sm">
                      {t('workspace-finance-transactions.confidential-amount')}
                    </FormLabel>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value || false}
                      onCheckedChange={field.onChange}
                      disabled={loading}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="is_description_confidential"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-md bg-background/50 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <FormLabel className="mt-0! font-normal text-sm">
                      {t(
                        'workspace-finance-transactions.confidential-description'
                      )}
                    </FormLabel>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value || false}
                      onCheckedChange={field.onChange}
                      disabled={loading}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="is_category_confidential"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-md bg-background/50 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <FolderOpen className="h-4 w-4 text-muted-foreground" />
                    <FormLabel className="mt-0! font-normal text-sm">
                      {t(
                        'workspace-finance-transactions.confidential-category'
                      )}
                    </FormLabel>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value || false}
                      onCheckedChange={field.onChange}
                      disabled={loading}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>
        </div>
      )}
    </div>
  );
}
