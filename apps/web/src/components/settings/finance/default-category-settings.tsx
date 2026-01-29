'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowDownCircle, ArrowUpCircle, Loader2 } from '@tuturuuu/icons';
import type { TransactionCategory } from '@tuturuuu/types/primitives/TransactionCategory';
import { Button } from '@tuturuuu/ui/button';
import {
  getIconComponentByKey,
  type PlatformIconKey,
} from '@tuturuuu/ui/custom/icon-picker';
import { useWorkspaceConfig } from '@tuturuuu/ui/hooks/use-workspace-config';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { useTransactionCategories } from '@/hooks/use-transaction-categories';

interface Props {
  workspaceId: string;
}

const NONE_OPTION = 'none';

function CategoryIcon({ category }: { category: TransactionCategory }) {
  if (category.icon) {
    const IconComponent = getIconComponentByKey(
      category.icon as PlatformIconKey
    );
    if (IconComponent) {
      return <IconComponent className="h-4 w-4" />;
    }
  }
  if (category.is_expense === false) {
    return <ArrowUpCircle className="h-4 w-4" />;
  }
  return <ArrowDownCircle className="h-4 w-4" />;
}

export default function DefaultCategorySettings({ workspaceId }: Props) {
  const t = useTranslations('ws-finance-settings');
  const tCategories = useTranslations('ws-transaction-categories');
  const { data: categories = [], isLoading: isLoadingCategories } =
    useTransactionCategories(workspaceId);
  const { data: defaultConfig, isLoading: isLoadingDefaultConfig } =
    useWorkspaceConfig(workspaceId, 'default_category_id', '');

  const queryClient = useQueryClient();

  const isLoading = isLoadingCategories || isLoadingDefaultConfig;

  const [selectedCategoryId, setSelectedCategoryId] = useState(NONE_OPTION);
  const [initialCategoryId, setInitialCategoryId] = useState(NONE_OPTION);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (isLoading) return;

    const trimmed = String(defaultConfig || '').trim();
    const categoryExists = categories.some((c) => c.id === trimmed);
    const val = categoryExists ? trimmed : NONE_OPTION;

    setInitialCategoryId(val);
    if (!initialized) {
      setSelectedCategoryId(val);
      setInitialized(true);
    }
  }, [isLoading, defaultConfig, categories, initialized]);

  const isDirty = selectedCategoryId !== initialCategoryId;

  const updateMutation = useMutation({
    mutationFn: async () => {
      const nextValue =
        selectedCategoryId && selectedCategoryId !== NONE_OPTION
          ? selectedCategoryId
          : '';
      const res = await fetch(
        `/api/v1/workspaces/${workspaceId}/settings/default_category_id`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: nextValue }),
        }
      );

      if (!res.ok) {
        throw new Error('Failed to update settings');
      }

      return res.json();
    },
    onSuccess: () => {
      setInitialCategoryId(selectedCategoryId);
      queryClient.invalidateQueries({
        queryKey: ['workspace-config', workspaceId, 'default_category_id'],
      });
      toast.success(t('update_success'));
    },
    onError: () => {
      toast.error(t('update_error'));
    },
  });

  if (!initialized) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    updateMutation.mutate();
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h3 className="font-medium text-lg">{t('default_category_title')}</h3>
        <p className="text-muted-foreground text-sm">
          {t('default_category_description')}
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid gap-2">
          <Label>{t('default_category_label')}</Label>
          <Select
            onValueChange={setSelectedCategoryId}
            value={selectedCategoryId}
          >
            <SelectTrigger>
              <SelectValue placeholder={t('select_default_category')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE_OPTION}>
                {t('no_default_category')}
              </SelectItem>
              {categories
                .filter((category) => category.id)
                .map((category) => (
                  <SelectItem key={category.id} value={category.id as string}>
                    <div className="flex items-center gap-2">
                      <CategoryIcon category={category} />
                      <span>
                        {category.name || tCategories('unnamed_category')}
                      </span>
                    </div>
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          type="submit"
          disabled={isLoading || updateMutation.isPending || !isDirty}
        >
          {updateMutation.isPending ? t('saving') : t('save')}
        </Button>
      </form>
    </div>
  );
}
