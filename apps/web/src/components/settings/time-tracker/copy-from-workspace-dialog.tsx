'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CheckCircle, Copy, Loader2 } from '@tuturuuu/icons';
import type { TimeTrackingCategory } from '@tuturuuu/types';
import { Button } from '@tuturuuu/ui/button';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { toast } from '@tuturuuu/ui/sonner';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { useWorkspaceCategories } from '@/hooks/use-workspace-categories';

interface Workspace {
  id: string;
  name: string;
  personal?: boolean;
}

interface CopyFromWorkspaceDialogProps {
  wsId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const CATEGORY_COLORS = [
  { value: 'BLUE', label: 'Blue', class: 'bg-blue-500' },
  { value: 'GREEN', label: 'Green', class: 'bg-green-500' },
  { value: 'RED', label: 'Red', class: 'bg-red-500' },
  { value: 'YELLOW', label: 'Yellow', class: 'bg-yellow-500' },
  { value: 'ORANGE', label: 'Orange', class: 'bg-orange-500' },
  { value: 'PURPLE', label: 'Purple', class: 'bg-purple-500' },
  { value: 'PINK', label: 'Pink', class: 'bg-pink-500' },
  { value: 'INDIGO', label: 'Indigo', class: 'bg-indigo-500' },
  { value: 'CYAN', label: 'Cyan', class: 'bg-cyan-500' },
  { value: 'GRAY', label: 'Gray', class: 'bg-gray-500' },
];

export function CopyFromWorkspaceDialog({
  wsId,
  open,
  onOpenChange,
}: CopyFromWorkspaceDialogProps) {
  const t = useTranslations('settings.time_tracker.categories_management');
  const queryClient = useQueryClient();

  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState('');
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);

  const { data: workspaces = [], isLoading: isLoadingWorkspaces } = useQuery({
    queryKey: ['workspaces'],
    queryFn: async () => {
      const response = await fetch('/api/v1/workspaces');
      if (!response.ok) throw new Error(t('copy_dialog.load_workspaces_error'));
      return response.json();
    },
    enabled: open,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const filteredWorkspaces = useMemo(
    () => workspaces.filter((ws: Workspace) => ws.id !== wsId),
    [workspaces, wsId]
  );

  const {
    data: currentCategories = [],
    isLoading: isLoadingCurrentCategories,
  } = useWorkspaceCategories({
    wsId,
    enabled: open,
  });

  const { data: sourceCategories = [], isLoading: isLoadingSourceCategories } =
    useWorkspaceCategories({
      wsId: selectedWorkspaceId,
      enabled: !!selectedWorkspaceId && open,
    });

  const { categories, existingCategories } = useMemo(() => {
    if (!selectedWorkspaceId) return { categories: [], existingCategories: [] };

    // Create a map of existing categories by name (case-insensitive)
    const existingCategoriesMap = new Map(
      currentCategories.map((cat: TimeTrackingCategory) => [
        cat.name.toLowerCase(),
        cat,
      ])
    );

    // Separate categories into existing and new
    const existingInCurrent: TimeTrackingCategory[] = [];
    const newCategories: TimeTrackingCategory[] = [];

    sourceCategories.forEach((cat: TimeTrackingCategory) => {
      const existingCat = existingCategoriesMap.get(cat.name.toLowerCase());
      if (existingCat) {
        existingInCurrent.push(cat);
      } else {
        newCategories.push(cat);
      }
    });

    return { categories: newCategories, existingCategories: existingInCurrent };
  }, [selectedWorkspaceId, sourceCategories, currentCategories]);

  const isLoadingCategories =
    isLoadingSourceCategories || isLoadingCurrentCategories;

  const copyMutation = useMutation({
    mutationFn: async ({
      sourceWorkspaceId,
      categoryIds,
    }: {
      sourceWorkspaceId: string;
      categoryIds: string[];
    }) => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/time-tracking/categories/copy`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sourceWorkspaceId,
            categoryIds,
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || t('copy_dialog.load_categories_error'));
      }

      return response.json();
    },
    onSuccess: (result) => {
      let message = '';
      if (result.copiedCount > 0 && result.skippedCount > 0) {
        message = t('copy_dialog.copy_success_partial', {
          copiedCount: result.copiedCount,
          skippedCount: result.skippedCount,
        });
      } else if (result.copiedCount > 0) {
        message = t('copy_dialog.copy_success_full', {
          copiedCount: result.copiedCount,
        });
      } else {
        message = result.message || t('copy_dialog.copy_no_categories');
      }

      if (result.existingCategories && result.existingCategories.length > 0) {
        const existingNames = result.existingCategories
          .map((cat: { name: string }) => cat.name)
          .join(', ');
        message += `${t('copy_dialog.already_exist_prefix')}${existingNames}`;
      }

      toast.success(message);
      onOpenChange(false);
      queryClient.invalidateQueries({
        queryKey: ['workspace-categories', wsId],
      });
    },
    onError: (error) => {
      console.error('Error copying categories:', error);
      toast.error(
        error instanceof Error
          ? error.message
          : t('copy_dialog.load_categories_error')
      );
    },
  });

  const isCopying = copyMutation.isPending;

  const handleCopy = async () => {
    if (!selectedWorkspaceId || selectedCategoryIds.length === 0) {
      toast.error(t('copy_dialog.select_error'));
      return;
    }

    copyMutation.mutate({
      sourceWorkspaceId: selectedWorkspaceId,
      categoryIds: selectedCategoryIds,
    });
  };

  const handleCategoryToggle = (categoryId: string, checked: boolean) => {
    setSelectedCategoryIds((prev) =>
      checked ? [...prev, categoryId] : prev.filter((id) => id !== categoryId)
    );
  };

  const handleSelectAll = () => {
    if (selectedCategoryIds.length === categories.length) {
      setSelectedCategoryIds([]);
    } else {
      setSelectedCategoryIds(categories.map((cat) => cat.id));
    }
  };

  const resetDialog = () => {
    setSelectedWorkspaceId('');
    setSelectedCategoryIds([]);
  };

  const getCategoryColor = (color: string) => {
    const colorConfig = CATEGORY_COLORS.find((c) => c.value === color);
    return colorConfig?.class || 'bg-blue-500';
  };

  const selectedWorkspace = filteredWorkspaces.find(
    (ws: Workspace) => ws.id === selectedWorkspaceId
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(open) => {
        onOpenChange(open);
        if (!open) resetDialog();
      }}
    >
      <DialogContent className="flex max-h-[85vh] max-w-3xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Copy className="h-5 w-5" />
            {t('copy_dialog.title')}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 space-y-6 overflow-y-auto">
          {/* Workspace Selection */}
          <div className="space-y-2">
            <Label>{t('copy_dialog.select_workspace')}</Label>
            <Select
              value={selectedWorkspaceId}
              onValueChange={setSelectedWorkspaceId}
              disabled={isLoadingWorkspaces}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    isLoadingWorkspaces
                      ? t('copy_dialog.loading_workspaces')
                      : t('copy_dialog.choose_workspace')
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {filteredWorkspaces.map((workspace: Workspace) => (
                  <SelectItem key={workspace.id} value={workspace.id}>
                    <div className="flex items-center gap-2">
                      <span>{workspace.name}</span>
                      {workspace.personal && (
                        <span className="text-muted-foreground text-xs">
                          {t('copy_dialog.personal')}
                        </span>
                      )}
                    </div>
                  </SelectItem>
                ))}
                {filteredWorkspaces.length === 0 && !isLoadingWorkspaces && (
                  <SelectItem value="__empty__" disabled>
                    {t('copy_dialog.no_workspaces')}
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Categories Selection */}
          {selectedWorkspaceId && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>
                  {t('copy_dialog.categories_from', {
                    name: selectedWorkspace?.name || '',
                  })}
                  {(categories.length > 0 || existingCategories.length > 0) && (
                    <span className="ml-2 text-muted-foreground text-sm">
                      ({categories.length + existingCategories.length}{' '}
                      {t('copy_dialog.available')}
                      {categories.length > 0 &&
                        `, ${categories.length} ${t('copy_dialog.can_be_copied')}`}
                      {existingCategories.length > 0 &&
                        `, ${existingCategories.length} ${t('copy_dialog.already_exist')}`}
                      )
                    </span>
                  )}
                </Label>
                {(categories.length > 0 || existingCategories.length > 0) && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSelectAll}
                    disabled={isLoadingCategories}
                  >
                    {selectedCategoryIds.length === categories.length
                      ? t('copy_dialog.deselect_all')
                      : t('copy_dialog.select_all')}
                  </Button>
                )}
              </div>

              {isLoadingCategories ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                  <span className="ml-2">
                    {t('copy_dialog.loading_categories')}
                  </span>
                </div>
              ) : categories.length === 0 && existingCategories.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  {t('copy_dialog.no_categories_found')}
                </div>
              ) : (
                <div className="max-h-80 space-y-1 overflow-y-auto rounded-md border">
                  {/* New Categories that can be copied */}
                  {categories.length > 0 && (
                    <>
                      <div className="sticky top-0 border-b bg-background px-3 py-2">
                        <h4 className="flex items-center gap-2 font-medium text-green-600 text-sm dark:text-green-400">
                          <CheckCircle className="h-4 w-4" />
                          {t('copy_dialog.available_to_copy')} (
                          {categories.length})
                        </h4>
                      </div>
                      {categories.map((category) => (
                        <button
                          key={category.id}
                          type="button"
                          className="flex w-full items-start space-x-3 rounded-md p-3 text-left transition-colors hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
                          onClick={() =>
                            handleCategoryToggle(
                              category.id,
                              !selectedCategoryIds.includes(category.id)
                            )
                          }
                        >
                          <Checkbox
                            id={category.id}
                            checked={selectedCategoryIds.includes(category.id)}
                            onCheckedChange={(checked) =>
                              handleCategoryToggle(category.id, !!checked)
                            }
                            className="pointer-events-none mt-0.5"
                            tabIndex={-1}
                          />
                          <div className="flex min-w-0 flex-1 items-start gap-3">
                            <div
                              className={cn(
                                'mt-0.5 h-4 w-4 shrink-0 rounded-full',
                                getCategoryColor(category.color || 'BLUE')
                              )}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="font-medium text-sm leading-relaxed">
                                {category.name}
                              </div>
                              {category.description && (
                                <p className="wrap-break-word mt-1 text-muted-foreground text-xs leading-relaxed">
                                  {category.description}
                                </p>
                              )}
                            </div>
                          </div>
                        </button>
                      ))}
                    </>
                  )}

                  {/* Existing Categories that already exist */}
                  {existingCategories.length > 0 && (
                    <>
                      <div className="sticky top-0 border-b bg-background px-3 py-2">
                        <h4 className="flex items-center gap-2 font-medium text-sm text-yellow-600 dark:text-yellow-400">
                          <AlertCircle className="h-4 w-4" />
                          {t('copy_dialog.already_exist_title')} (
                          {existingCategories.length})
                        </h4>
                      </div>
                      {existingCategories.map((category) => (
                        <div
                          key={`existing-${category.id}`}
                          className="flex w-full items-start space-x-3 rounded-md p-3 text-left opacity-60"
                        >
                          <Checkbox
                            checked={false}
                            disabled={true}
                            className="pointer-events-none mt-0.5"
                            tabIndex={-1}
                          />
                          <div className="flex min-w-0 flex-1 items-start gap-3">
                            <div
                              className={cn(
                                'mt-0.5 h-4 w-4 shrink-0 rounded-full',
                                getCategoryColor(category.color || 'BLUE')
                              )}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="font-medium text-sm leading-relaxed">
                                {category.name}
                                <span className="ml-2 text-xs text-yellow-600 dark:text-yellow-400">
                                  {t('copy_dialog.already_exists_label')}
                                </span>
                              </div>
                              {category.description && (
                                <p className="wrap-break-word mt-1 text-muted-foreground text-xs leading-relaxed">
                                  {category.description}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}

              {selectedCategoryIds.length > 0 && (
                <div className="rounded-md bg-muted/50 p-3">
                  <p className="text-sm">
                    {t('copy_dialog.selected_count', {
                      count: selectedCategoryIds.length,
                    })}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Actions - Fixed at bottom */}
        <div className="flex gap-3 border-t bg-background pt-4">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="flex-1"
            disabled={isCopying}
          >
            {t('cancel')}
          </Button>
          <Button
            onClick={handleCopy}
            disabled={
              !selectedWorkspaceId ||
              selectedCategoryIds.length === 0 ||
              isCopying ||
              isLoadingCategories
            }
            className="flex-1"
          >
            {isCopying ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('copy_dialog.copying')}
              </>
            ) : (
              <>
                <Copy className="mr-2 h-4 w-4" />
                {t('copy_dialog.copy_button')}
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
