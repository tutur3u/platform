'use client';

import { useQueryClient } from '@tanstack/react-query';
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
import { useCallback, useEffect, useState } from 'react';

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
  const queryClient = useQueryClient();

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState('');
  const [categories, setCategories] = useState<TimeTrackingCategory[]>([]);
  const [existingCategories, setExistingCategories] = useState<
    TimeTrackingCategory[]
  >([]);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [isLoadingWorkspaces, setIsLoadingWorkspaces] = useState(true);
  const [isLoadingCategories, setIsLoadingCategories] = useState(false);
  const [isCopying, setIsCopying] = useState(false);

  const fetchWorkspaces = useCallback(async () => {
    setIsLoadingWorkspaces(true);
    try {
      const response = await fetch('/api/v1/workspaces');
      if (!response.ok) throw new Error('Failed to fetch workspaces');

      const data = await response.json();
      // Filter out current workspace
      const filteredWorkspaces = data.filter((ws: Workspace) => ws.id !== wsId);
      setWorkspaces(filteredWorkspaces);
    } catch (error) {
      console.error('Error fetching workspaces:', error);
      toast.error('Failed to load workspaces');
    } finally {
      setIsLoadingWorkspaces(false);
    }
  }, [wsId]);

  const fetchCategories = useCallback(
    async (workspaceId: string) => {
      setIsLoadingCategories(true);
      try {
        // Fetch categories from source workspace and current workspace
        const [sourceResponse, currentResponse] = await Promise.all([
          fetch(`/api/v1/workspaces/${workspaceId}/time-tracking/categories`),
          fetch(`/api/v1/workspaces/${wsId}/time-tracking/categories`),
        ]);

        if (!sourceResponse.ok || !currentResponse.ok) {
          throw new Error('Failed to fetch categories');
        }

        const [sourceData, currentData] = await Promise.all([
          sourceResponse.json(),
          currentResponse.json(),
        ]);

        const sourceCategories = sourceData.categories || [];
        const currentCategories = currentData.categories || [];

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

        setCategories(newCategories);
        setExistingCategories(existingInCurrent);
      } catch (error) {
        console.error('Error fetching categories:', error);
        toast.error('Failed to load categories from selected workspace');
        setCategories([]);
        setExistingCategories([]);
      } finally {
        setIsLoadingCategories(false);
      }
    },
    [wsId]
  );

  // Load workspaces when dialog opens
  useEffect(() => {
    if (open) {
      fetchWorkspaces();
    }
  }, [open, fetchWorkspaces]);

  // Load categories when workspace is selected
  useEffect(() => {
    if (selectedWorkspaceId) {
      fetchCategories(selectedWorkspaceId);
    } else {
      setCategories([]);
      setExistingCategories([]);
      setSelectedCategoryIds([]);
    }
  }, [selectedWorkspaceId, fetchCategories]);

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

  const handleCopy = async () => {
    if (!selectedWorkspaceId || selectedCategoryIds.length === 0) {
      toast.error('Please select a workspace and at least one category');
      return;
    }

    setIsCopying(true);
    try {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/time-tracking/categories/copy`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sourceWorkspaceId: selectedWorkspaceId,
            categoryIds: selectedCategoryIds,
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to copy categories');
      }

      const result = await response.json();

      let message = '';
      if (result.copiedCount > 0 && result.skippedCount > 0) {
        message = `Copied ${result.copiedCount} categories. ${result.skippedCount} categories were skipped (already exist).`;
      } else if (result.copiedCount > 0) {
        message = `Successfully copied ${result.copiedCount} categories!`;
      } else {
        message = result.message || 'No categories were copied.';
      }

      if (result.existingCategories && result.existingCategories.length > 0) {
        const existingNames = result.existingCategories
          .map((cat: { name: string }) => cat.name)
          .join(', ');
        message += ` Categories that already exist: ${existingNames}`;
      }

      toast.success(message);
      onOpenChange(false);
      queryClient.invalidateQueries({
        queryKey: ['workspace-categories', wsId],
      });
    } catch (error) {
      console.error('Error copying categories:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to copy categories'
      );
    } finally {
      setIsCopying(false);
    }
  };

  const resetDialog = () => {
    setSelectedWorkspaceId('');
    setCategories([]);
    setExistingCategories([]);
    setSelectedCategoryIds([]);
  };

  const getCategoryColor = (color: string) => {
    const colorConfig = CATEGORY_COLORS.find((c) => c.value === color);
    return colorConfig?.class || 'bg-blue-500';
  };

  const selectedWorkspace = workspaces.find(
    (ws) => ws.id === selectedWorkspaceId
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
            Copy Categories from Another Workspace
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 space-y-6 overflow-y-auto">
          {/* Workspace Selection */}
          <div className="space-y-2">
            <Label>Select Workspace</Label>
            <Select
              value={selectedWorkspaceId}
              onValueChange={setSelectedWorkspaceId}
              disabled={isLoadingWorkspaces}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    isLoadingWorkspaces
                      ? 'Loading workspaces...'
                      : 'Choose a workspace to copy from'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {workspaces.map((workspace) => (
                  <SelectItem key={workspace.id} value={workspace.id}>
                    <div className="flex items-center gap-2">
                      <span>{workspace.name}</span>
                      {workspace.personal && (
                        <span className="text-muted-foreground text-xs">
                          (Personal)
                        </span>
                      )}
                    </div>
                  </SelectItem>
                ))}
                {workspaces.length === 0 && !isLoadingWorkspaces && (
                  <SelectItem value="__empty__" disabled>
                    No other workspaces available
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
                  Categories from {selectedWorkspace?.name}
                  {(categories.length > 0 || existingCategories.length > 0) && (
                    <span className="ml-2 text-muted-foreground text-sm">
                      ({categories.length + existingCategories.length} available
                      {categories.length > 0 &&
                        `, ${categories.length} can be copied`}
                      {existingCategories.length > 0 &&
                        `, ${existingCategories.length} already exist`}
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
                      ? 'Deselect All'
                      : 'Select All Available'}
                  </Button>
                )}
              </div>

              {isLoadingCategories ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                  <span className="ml-2">Loading categories...</span>
                </div>
              ) : categories.length === 0 && existingCategories.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  No categories found in this workspace
                </div>
              ) : (
                <div className="max-h-80 space-y-1 overflow-y-auto rounded-md border">
                  {/* New Categories that can be copied */}
                  {categories.length > 0 && (
                    <>
                      <div className="sticky top-0 border-b bg-background px-3 py-2">
                        <h4 className="flex items-center gap-2 font-medium text-green-600 text-sm dark:text-green-400">
                          <CheckCircle className="h-4 w-4" />
                          Available to Copy ({categories.length})
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
                          Already Exist ({existingCategories.length})
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
                                  (Already exists)
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
                    <strong>{selectedCategoryIds.length}</strong> categories
                    selected for copying
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
            Cancel
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
                Copying...
              </>
            ) : (
              <>
                <Copy className="mr-2 h-4 w-4" />
                Copy Categories
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
