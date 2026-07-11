'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from '@tuturuuu/icons';
import { removeWorkspaceUserGroupIndicatorCategory } from '@tuturuuu/internal-api/user-groups';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@tuturuuu/ui/alert-dialog';
import { Button } from '@tuturuuu/ui/button';
import { toast } from '@tuturuuu/ui/sonner';
import { Tabs, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import type { MetricCategory } from '@tuturuuu/users-core/lib/group-indicators-types';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface IndicatorCategoryTabsProps {
  canDelete: boolean;
  groupId: string;
  hasUncategorizedIndicators: boolean;
  metricCategories: MetricCategory[];
  onValueChange: (value: string) => void;
  value: string;
  wsId: string;
}

export function IndicatorCategoryTabs({
  canDelete,
  groupId,
  hasUncategorizedIndicators,
  metricCategories,
  onValueChange,
  value,
  wsId,
}: IndicatorCategoryTabsProps) {
  const t = useTranslations();
  const tIndicators = useTranslations('ws-user-group-indicators');
  const queryClient = useQueryClient();
  const [categoryPendingDelete, setCategoryPendingDelete] =
    useState<MetricCategory | null>(null);

  const deleteCategoryMutation = useMutation({
    mutationFn: (category: MetricCategory) =>
      removeWorkspaceUserGroupIndicatorCategory(wsId, groupId, category.id),
    onSuccess: async (_data, category) => {
      if (value === category.id) {
        onValueChange('all');
      }

      await queryClient.invalidateQueries({
        queryKey: ['group-indicators-data', wsId, groupId],
      });
      toast.success(tIndicators('category_removed_successfully'));
    },
    onError: () => {
      toast.error(tIndicators('failed_to_remove_category'));
    },
  });

  const handleRemoveCategory = async () => {
    if (!categoryPendingDelete) return;

    try {
      await deleteCategoryMutation.mutateAsync(categoryPendingDelete);
      setCategoryPendingDelete(null);
    } catch {
      // The mutation onError callback owns the user-facing error toast.
    }
  };

  return (
    <>
      <Tabs value={value} onValueChange={onValueChange}>
        <TabsList className="h-auto flex-wrap justify-start gap-1">
          <TabsTrigger value="all">{t('common.all')}</TabsTrigger>
          {metricCategories.map((category) => (
            <div
              key={category.id}
              className="flex items-center overflow-hidden rounded-md border"
            >
              <TabsTrigger
                value={category.id}
                className="rounded-none border-0 shadow-none"
              >
                {category.name}
              </TabsTrigger>
              {canDelete && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={tIndicators('remove_metric_category_label', {
                        categoryName: category.name,
                      })}
                      className="h-7 w-7 rounded-none text-muted-foreground hover:bg-dynamic-red/10 hover:text-dynamic-red"
                      disabled={deleteCategoryMutation.isPending}
                      onClick={() => setCategoryPendingDelete(category)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {tIndicators('remove_metric_category')}
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          ))}
          {hasUncategorizedIndicators && (
            <TabsTrigger value="uncategorized">
              {tIndicators('uncategorized')}
            </TabsTrigger>
          )}
        </TabsList>
      </Tabs>

      <AlertDialog
        open={Boolean(categoryPendingDelete)}
        onOpenChange={(open) => {
          if (!open) setCategoryPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {tIndicators('remove_metric_category')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {tIndicators('remove_metric_category_description', {
                categoryName: categoryPendingDelete?.name ?? '',
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteCategoryMutation.isPending}>
              {t('common.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteCategoryMutation.isPending}
              className="bg-dynamic-red/60 hover:bg-dynamic-red/70"
              onClick={(event) => {
                event.preventDefault();
                void handleRemoveCategory();
              }}
            >
              {deleteCategoryMutation.isPending
                ? tIndicators('removing')
                : t('common.remove')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
