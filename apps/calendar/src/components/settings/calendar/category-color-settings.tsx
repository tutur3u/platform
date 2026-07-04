'use client';

import { InfoIcon, Loader2, PlusIcon, Trash2 } from '@tuturuuu/icons';
import type { Workspace } from '@tuturuuu/types';
import type { SupportedColor } from '@tuturuuu/types/primitives/SupportedColors';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { cn } from '@tuturuuu/utils/format';
import { useEffect, useState } from 'react';
import {
  type CalendarCategory,
  useCalendarCategories,
} from '../../../hooks/use-calendar-categories';
import { type CategoryColor, colorMap } from './color-picker';

// Common category suggestions with predefined colors
const CATEGORY_SUGGESTIONS: CategoryColor[] = [
  { name: 'Work', color: 'BLUE' },
  { name: 'Personal', color: 'GREEN' },
  { name: 'Family', color: 'PURPLE' },
  { name: 'Health', color: 'RED' },
  { name: 'Social', color: 'YELLOW' },
  { name: 'Education', color: 'INDIGO' },
  { name: 'Travel', color: 'ORANGE' },
  { name: 'Meeting', color: 'CYAN' },
  { name: 'Appointment', color: 'PINK' },
  { name: 'Other', color: 'GRAY' },
];

type CategoryColorsSettingsProps = {
  workspace: Workspace | null;
};

export function CategoryColorsSettings({
  workspace,
}: CategoryColorsSettingsProps) {
  const {
    categories,
    isLoading,
    isError,
    createCategory,
    updateCategory,
    deleteCategory,
    reorderCategories,
    isCreating,
    isMutating,
  } = useCalendarCategories({ workspaceId: workspace?.id });

  const [newCategoryName, setNewCategoryName] = useState('');
  const [activeTab, setActiveTab] = useState<'categories' | 'suggestions'>(
    'categories'
  );
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [localCategories, setLocalCategories] = useState<CalendarCategory[]>(
    []
  );

  // Sync local state with fetched categories
  useEffect(() => {
    setLocalCategories(categories);
  }, [categories]);

  // Auto-switch to suggestions tab when no categories exist
  useEffect(() => {
    if (!isLoading && categories.length === 0) {
      setActiveTab('suggestions');
    }
  }, [isLoading, categories.length]);

  const handleCategoryChange = (id: string, updatedCategory: CategoryColor) => {
    // Update local state immediately for responsive UI
    setLocalCategories((prev) =>
      prev.map((cat) =>
        cat.id === id
          ? { ...cat, name: updatedCategory.name, color: updatedCategory.color }
          : cat
      )
    );

    // Send update to server
    updateCategory({
      id,
      name: updatedCategory.name,
      color: updatedCategory.color,
    });
  };

  const handleAddCategory = () => {
    if (!newCategoryName.trim()) return;

    // Find an unused color
    const usedColors = new Set(localCategories.map((cat) => cat.color));
    const availableColors: SupportedColor[] = [
      'BLUE',
      'GREEN',
      'RED',
      'YELLOW',
      'PURPLE',
      'PINK',
      'ORANGE',
      'INDIGO',
      'CYAN',
      'GRAY',
    ];

    const newColor =
      availableColors.find((color) => !usedColors.has(color)) ||
      availableColors[0]!;

    createCategory({
      name: newCategoryName.trim(),
      color: newColor,
    });

    setNewCategoryName('');
    setActiveTab('categories');
  };

  const handleRemoveCategory = (categoryId: string) => {
    deleteCategory(categoryId);
  };

  // Add a suggested category
  const addSuggestedCategory = (suggestion: CategoryColor) => {
    // Check if this category name or color already exists (case insensitive)
    const exists = localCategories.some(
      (cat) =>
        cat.name.toLowerCase() === suggestion.name.toLowerCase() ||
        cat.color === suggestion.color
    );

    if (!exists) {
      createCategory({
        name: suggestion.name,
        color: suggestion.color,
      });
    }
  };

  // Add all missing suggested categories
  const addAllSuggestions = () => {
    const currentCategoryNames = new Set(
      localCategories.map((cat) => cat.name.toLowerCase())
    );
    const currentColors = new Set(localCategories.map((cat) => cat.color));

    const missingCategories = CATEGORY_SUGGESTIONS.filter(
      (suggestion) =>
        !currentCategoryNames.has(suggestion.name.toLowerCase()) &&
        !currentColors.has(suggestion.color)
    );

    // Add each missing category
    missingCategories.forEach((category) => {
      createCategory({
        name: category.name,
        color: category.color,
      });
    });

    if (missingCategories.length > 0) {
      setActiveTab('categories');
    }
  };

  // Get a preview of what an event with this category might look like
  const getCategoryPreview = (category: CalendarCategory) => {
    const colorInfo = colorMap[category.color];

    return (
      <div
        className="flex flex-col items-center"
        key={`preview-${category.id}`}
      >
        <div
          className={cn(
            'w-full rounded-md px-2 py-1 text-center font-medium text-xs',
            colorInfo.bg,
            colorInfo.text
          )}
        >
          {category.name} Event
        </div>
      </div>
    );
  };

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
    setEditingCategory(null);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null) return;

    if (draggedIndex !== index) {
      const newCategories = [...localCategories];
      const draggedItem = newCategories[draggedIndex];
      if (draggedItem) {
        newCategories.splice(draggedIndex, 1);
        newCategories.splice(index, 0, draggedItem);
        setLocalCategories(newCategories);
        setDraggedIndex(index);
      }
    }
  };

  const handleDragEnd = () => {
    if (draggedIndex !== null) {
      // Persist the new order to the database
      const reorderedItems = localCategories.map((cat, idx) => ({
        id: cat.id,
        position: idx,
      }));
      reorderCategories(reorderedItems);
    }
    setDraggedIndex(null);
    setEditingCategory(null);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-24 w-full rounded-lg" />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32 w-full rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
        <p className="font-medium text-destructive">
          Failed to load categories
        </p>
        <p className="mt-1 text-muted-foreground text-sm">
          Please try refreshing the page.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-md bg-muted/30 p-4">
        <div className="flex items-start gap-2">
          <InfoIcon className="mt-0.5 h-4 w-4 text-muted-foreground" />
          <div className="text-muted-foreground text-sm">
            <p>
              Categories help organize your events by color. The AI will
              automatically assign colors to events based on their title and
              these categories.
            </p>
            <p className="mt-1">
              For example, if you have a "Work" category with blue color, events
              with "work" or "meeting" in the title will be colored blue.
            </p>
          </div>
        </div>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as 'categories' | 'suggestions')}
      >
        <div className="mb-4 flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="categories" className="px-4">
              Your Categories
              {localCategories.length > 0 && (
                <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs">
                  {localCategories.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="suggestions" className="px-4">
              Suggestions
            </TabsTrigger>
          </TabsList>

          <div className="flex gap-2">
            {activeTab === 'categories' && (
              <div className="flex items-center gap-2">
                <Input
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="New category name"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleAddCategory();
                    }
                  }}
                  className="h-9"
                  disabled={isMutating}
                />
                <Button
                  variant="outline"
                  onClick={handleAddCategory}
                  className="h-9"
                  disabled={!newCategoryName.trim() || isCreating}
                >
                  {isCreating ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <PlusIcon className="mr-2 h-4 w-4" />
                  )}
                  Add
                </Button>
              </div>
            )}
            {activeTab === 'suggestions' && (
              <Button
                size="sm"
                onClick={addAllSuggestions}
                variant="outline"
                disabled={
                  isMutating ||
                  CATEGORY_SUGGESTIONS.every((suggestion) =>
                    localCategories.some(
                      (cat) =>
                        cat.name.toLowerCase() ===
                          suggestion.name.toLowerCase() ||
                        cat.color === suggestion.color
                    )
                  )
                }
              >
                {isMutating ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Add All Missing
              </Button>
            )}
          </div>
        </div>

        <TabsContent value="categories" className="mt-0">
          {localCategories.length === 0 ? (
            <div className="flex h-40 flex-col items-center justify-center gap-3 rounded-md border border-dashed">
              <p className="text-muted-foreground">
                No categories yet. Add one to get started.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setActiveTab('suggestions')}
              >
                Browse suggestions
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {localCategories.map((category, index) => (
                <div
                  key={category.id}
                  className="group w-full overflow-hidden rounded-lg border bg-card text-card-foreground shadow-sm transition-all"
                  draggable
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragEnd={handleDragEnd}
                >
                  <div className="p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <div className="flex flex-1 items-center gap-3">
                        <div
                          className={cn(
                            'h-6 w-6 flex-none cursor-move rounded-full border',
                            colorMap[category.color].cbg
                          )}
                          onClick={() => setEditingCategory(category.id)}
                        />

                        {editingCategory === category.id ? (
                          <div className="flex flex-1 items-center justify-between">
                            <Input
                              value={category.name}
                              onChange={(e) =>
                                handleCategoryChange(category.id, {
                                  ...category,
                                  name: e.target.value,
                                })
                              }
                              placeholder="Category name"
                              className="h-8 w-40"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  setEditingCategory(null);
                                }
                              }}
                            />
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => setEditingCategory(null)}
                            >
                              Done
                            </Button>
                          </div>
                        ) : (
                          <div className="flex flex-1 items-center justify-between">
                            <div
                              className="cursor-pointer truncate font-medium"
                              onClick={() => setEditingCategory(category.id)}
                            >
                              {category.name}
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-muted-foreground text-xs"
                              onClick={() => setEditingCategory(category.id)}
                            >
                              Edit
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Color picker */}
                    {editingCategory === category.id ? (
                      <div className="mt-3">
                        <div className="mb-2 flex items-center justify-between">
                          <div className="font-medium text-sm">
                            Select a color:
                          </div>
                          <div className="pr-2.5">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                handleRemoveCategory(category.id);
                                setEditingCategory(null);
                              }}
                              disabled={localCategories.length <= 1}
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                        <div className="grid grid-cols-5 gap-2">
                          {Object.entries(colorMap).map(
                            ([colorKey, colorInfo]) => {
                              const colorValue = colorKey as SupportedColor;
                              const isSelected = category.color === colorValue;

                              return (
                                <button
                                  key={colorKey}
                                  type="button"
                                  className={cn(
                                    colorInfo.cbg,
                                    'h-12 w-full rounded-md border transition-all hover:scale-105 hover:shadow-md',
                                    isSelected &&
                                      'shadow-md ring-2 ring-offset-2 ring-offset-background'
                                  )}
                                  onClick={() => {
                                    handleCategoryChange(category.id, {
                                      ...category,
                                      color: colorValue,
                                    });
                                    setEditingCategory(null);
                                  }}
                                  aria-label={`Select ${colorInfo.name} color`}
                                />
                              );
                            }
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="mt-2">{getCategoryPreview(category)}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="suggestions" className="mt-0">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {CATEGORY_SUGGESTIONS.map((suggestion, index) => {
              // Check if this category name or color already exists
              const exists = localCategories.some(
                (cat) =>
                  cat.name.toLowerCase() === suggestion.name.toLowerCase() ||
                  cat.color === suggestion.color
              );

              const colorInfo = colorMap[suggestion.color];

              return (
                <div
                  key={index}
                  className={cn(
                    'overflow-hidden rounded-lg border bg-card text-card-foreground shadow-sm transition-all',
                    exists
                      ? 'opacity-50'
                      : 'cursor-pointer hover:ring-1 hover:ring-primary'
                  )}
                  onClick={() => !exists && addSuggestedCategory(suggestion)}
                >
                  <div className="p-3">
                    <div className="mb-2 flex items-center gap-2">
                      <div
                        className={cn('h-4 w-4 rounded-full', colorInfo.cbg)}
                      />
                      <div className="font-medium">{suggestion.name}</div>
                    </div>
                    <div
                      className={cn(
                        'w-full rounded-md px-2 py-1 text-center text-xs',
                        colorInfo.bg,
                        colorInfo.text
                      )}
                    >
                      {suggestion.name}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Re-export types for backward compatibility
export type CategoryColorsData = {
  categories: CategoryColor[];
};

export const defaultCategoryColors: CategoryColorsData = {
  categories: [],
};
