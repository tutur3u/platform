'use client';

import { CategoryColor, colorMap } from './color-picker';
import { SupportedColor } from '@ncthub/types/primitives/SupportedColors';
import { Button } from '@ncthub/ui/button';
import { Card, CardContent } from '@ncthub/ui/card';
import { Input } from '@ncthub/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@ncthub/ui/tabs';
import { cn } from '@ncthub/utils/format';
import { InfoIcon, PlusIcon, Trash2 } from 'lucide-react';
import { useState } from 'react';

export type CategoryColorsData = {
  categories: CategoryColor[];
};

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

export const defaultCategoryColors: CategoryColorsData = {
  categories: [
    { name: 'Work', color: 'BLUE' },
    { name: 'Personal', color: 'GREEN' },
    { name: 'Family', color: 'PURPLE' },
    { name: 'Health', color: 'RED' },
    { name: 'Social', color: 'YELLOW' },
    { name: 'Education', color: 'INDIGO' },
    { name: 'Travel', color: 'ORANGE' },
    { name: 'Other', color: 'GRAY' },
  ],
};

type CategoryColorsSettingsProps = {
  value: CategoryColorsData;
  onChange: (value: CategoryColorsData) => void;
};

export function CategoryColorsSettings({
  value,
  onChange,
}: CategoryColorsSettingsProps) {
  const [newCategoryName, setNewCategoryName] = useState('');
  const [activeTab, setActiveTab] = useState<'categories' | 'suggestions'>(
    'categories'
  );
  const [editingCategory, setEditingCategory] = useState<number | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const handleCategoryChange = (
    index: number,
    updatedCategory: CategoryColor
  ) => {
    console.log('Changing category:', index, updatedCategory);

    // Create a new array to ensure React detects the change
    const updatedCategories = value.categories.map((cat, i) =>
      i === index ? updatedCategory : cat
    );

    // Call the onChange handler with the updated categories
    onChange({ categories: updatedCategories });
  };

  const handleAddCategory = () => {
    if (!newCategoryName.trim()) return;

    // Find an unused color
    const usedColors = new Set(value.categories.map((cat) => cat.color));
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

    // Find first unused color or use the first available color
    const newColor =
      availableColors.find((color) => !usedColors.has(color)) ||
      (availableColors[0] as SupportedColor);

    onChange({
      categories: [
        ...value.categories,
        { name: newCategoryName.trim(), color: newColor },
      ],
    });

    setNewCategoryName('');
  };

  const handleRemoveCategory = (category: CategoryColor) => {
    const updatedCategories = value.categories.filter(
      (cat) => cat.name !== category.name
    );

    onChange({ categories: updatedCategories });
  };

  // Add a suggested category that isn't already in the list
  const addSuggestedCategory = (suggestion: CategoryColor) => {
    // Check if this category name or color already exists (case insensitive)
    const exists = value.categories.some(
      (cat) =>
        cat.name.toLowerCase() === suggestion.name.toLowerCase() ||
        cat.color === suggestion.color
    );

    if (!exists) {
      onChange({
        categories: [...value.categories, { ...suggestion }],
      });
    }
  };

  // Add all missing suggested categories
  const addAllSuggestions = () => {
    const currentCategoryNames = new Set(
      value.categories.map((cat) => cat.name.toLowerCase())
    );
    const currentColors = new Set(value.categories.map((cat) => cat.color));

    const missingCategories = CATEGORY_SUGGESTIONS.filter(
      (suggestion) =>
        !currentCategoryNames.has(suggestion.name.toLowerCase()) &&
        !currentColors.has(suggestion.color)
    );

    if (missingCategories.length > 0) {
      onChange({
        categories: [...value.categories, ...missingCategories],
      });
    }

    setActiveTab('categories');
  };

  // Filter categories based on search query
  const filteredCategories = value.categories;

  // Get a preview of what an event with this category might look like
  const getCategoryPreview = (category: CategoryColor) => {
    const colorInfo = colorMap[category.color];

    return (
      <div
        className="flex flex-col items-center"
        key={`preview-${category.name}-${category.color}`}
      >
        <div
          className={cn(
            'w-full rounded-md px-2 py-1 text-center text-xs font-medium',
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
      const newCategories = [...value.categories];
      const draggedItem = newCategories[draggedIndex];
      if (draggedItem) {
        newCategories.splice(draggedIndex, 1);
        newCategories.splice(index, 0, draggedItem);

        onChange({ categories: newCategories });
        setDraggedIndex(index);
        setEditingCategory(null);
      }
    }
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setEditingCategory(null);
  };

  return (
    <div className="space-y-6">
      <div className="bg-muted/30 rounded-md p-4">
        <div className="flex items-start gap-2">
          <InfoIcon className="text-muted-foreground mt-0.5 h-4 w-4" />
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

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <div className="mb-4 flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="categories" className="px-4">
              Your Categories
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
                />
                <Button
                  variant="outline"
                  onClick={handleAddCategory}
                  className="h-9"
                  disabled={!newCategoryName.trim()}
                >
                  <PlusIcon className="mr-2 h-4 w-4" />
                  Add
                </Button>
              </div>
            )}
            {activeTab === 'suggestions' && (
              <Button
                size="sm"
                onClick={addAllSuggestions}
                variant="outline"
                disabled={CATEGORY_SUGGESTIONS.every((suggestion) =>
                  value.categories.some(
                    (cat) =>
                      cat.name.toLowerCase() ===
                        suggestion.name.toLowerCase() ||
                      cat.color === suggestion.color
                  )
                )}
              >
                Add All Missing
              </Button>
            )}
          </div>
        </div>

        <TabsContent value="categories" className="mt-0">
          {filteredCategories.length === 0 ? (
            <div className="flex h-40 items-center justify-center rounded-md border border-dashed">
              <p className="text-muted-foreground">
                No categories yet. Add one to get started.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {filteredCategories.map((category, index) => (
                <Card
                  key={`${index}-${category.color}`}
                  className="group w-full overflow-hidden transition-all"
                  draggable
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragEnd={handleDragEnd}
                >
                  <CardContent className="p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <div className="flex flex-1 items-center gap-3">
                        <div
                          className={cn(
                            'h-6 w-6 flex-none cursor-move rounded-full border',
                            colorMap[category.color].cbg
                          )}
                          key={`color-circle-${category.color}`}
                          onClick={() => setEditingCategory(index)}
                        />

                        {editingCategory === index ? (
                          <div className="flex flex-1 items-center justify-between">
                            <Input
                              value={category.name}
                              onChange={(e) =>
                                handleCategoryChange(index, {
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
                              onClick={() => setEditingCategory(index)}
                            >
                              {category.name}
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-muted-foreground h-7 text-xs"
                              onClick={() => setEditingCategory(index)}
                            >
                              Edit
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Color picker */}
                    {editingCategory === index ? (
                      <div className="mt-3">
                        <div className="mb-2 flex items-center justify-between">
                          <div className="text-sm font-medium">
                            Select a color:
                          </div>
                          <div className="pr-2.5">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                handleRemoveCategory(category);
                                setEditingCategory(null);
                              }}
                              disabled={value.categories.length <= 1}
                              className="text-muted-foreground hover:text-destructive h-7 w-7"
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
                                      'ring-offset-background shadow-md ring-2 ring-offset-2'
                                  )}
                                  onClick={() => {
                                    // Create a new category object with the updated color
                                    const newCategory = {
                                      ...category,
                                      color: colorValue,
                                    };

                                    // Update the category
                                    handleCategoryChange(index, newCategory);
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
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="suggestions" className="mt-0">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {CATEGORY_SUGGESTIONS.map((suggestion, index) => {
              // Check if this category name or color already exists
              const exists = value.categories.some(
                (cat) =>
                  cat.name.toLowerCase() === suggestion.name.toLowerCase() ||
                  cat.color === suggestion.color
              );

              const colorInfo = colorMap[suggestion.color];

              return (
                <Card
                  key={index}
                  className={cn(
                    'overflow-hidden transition-all',
                    exists
                      ? 'opacity-50'
                      : 'hover:ring-primary cursor-pointer hover:ring-1'
                  )}
                  onClick={() => !exists && addSuggestedCategory(suggestion)}
                >
                  <CardContent className="p-3">
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
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
