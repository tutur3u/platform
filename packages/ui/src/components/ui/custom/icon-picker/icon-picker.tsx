'use client';

import { useVirtualizer } from '@tanstack/react-virtual';
import { ChevronDown, Circle, Grid3X3, X } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@tuturuuu/ui/command';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { ScrollArea, ScrollBar } from '@tuturuuu/ui/scroll-area';
import { cn } from '@tuturuuu/utils/format';
import {
  Suspense,
  useCallback,
  useDeferredValue,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Button } from '../../button';
import { Input } from '../../input';
import { Skeleton } from '../../skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../../tooltip';
import {
  CATEGORY_INFO,
  getIconComponentByKey,
  getIconsByCategory,
  ICON_OPTIONS,
} from './icon-options';
import type { IconCategory, IconOption, IconPickerProps } from './types';

/** Number of icons per row in the grid (used for virtualization row slicing) */
const ICONS_PER_ROW = 12;
/** Height of each row in pixels */
const ROW_HEIGHT = 44;
/** Extra rows to render above/below viewport */
const OVERSCAN = 3;
/** Number of top categories to show in pill bar */
const TOP_CATEGORIES_COUNT = 6;

/** Default category labels (English) */
const DEFAULT_CATEGORY_LABELS: Record<IconCategory | 'all', string> = {
  all: 'All',
  accessibility: 'Accessibility',
  account: 'Account',
  animals: 'Animals',
  arrows: 'Arrows',
  brands: 'Brands',
  buildings: 'Buildings',
  charts: 'Charts',
  communication: 'Communication',
  connectivity: 'Connectivity',
  cursors: 'Cursors',
  design: 'Design',
  development: 'Development',
  devices: 'Devices',
  emoji: 'Emoji',
  files: 'Files',
  finance: 'Finance',
  'food-beverage': 'Food & Beverage',
  gaming: 'Gaming',
  home: 'Home',
  layout: 'Layout',
  mail: 'Mail',
  math: 'Math',
  medical: 'Medical',
  multimedia: 'Multimedia',
  nature: 'Nature',
  navigation: 'Navigation',
  notifications: 'Notifications',
  people: 'People',
  photography: 'Photography',
  science: 'Science',
  seasons: 'Seasons',
  security: 'Security',
  shapes: 'Shapes',
  shopping: 'Shopping',
  social: 'Social',
  sports: 'Sports',
  sustainability: 'Sustainability',
  text: 'Text',
  time: 'Time',
  tools: 'Tools',
  transportation: 'Transportation',
  travel: 'Travel',
  weather: 'Weather',
};

/**
 * Normalizes a string for search comparison
 * Converts to lowercase and replaces dashes/underscores with spaces
 */
function normalizeForSearch(str: string): string {
  return str.toLowerCase().replace(/[-_]/g, ' ').trim();
}

/**
 * Filters icons based on search query
 * Matches against label, value, and semantic keywords
 */
function filterIcons(icons: IconOption[], query: string): IconOption[] {
  const searchTerm = normalizeForSearch(query);
  if (!searchTerm) return icons;

  return icons.filter((icon) => {
    // Match label
    if (normalizeForSearch(icon.label).includes(searchTerm)) return true;

    // Match value (enum key)
    if (normalizeForSearch(icon.value).includes(searchTerm)) return true;

    // Match keywords
    if (
      icon.keywords?.some((kw) => normalizeForSearch(kw).includes(searchTerm))
    ) {
      return true;
    }

    return false;
  });
}

/**
 * Loading skeleton for the icon grid
 */
function IconGridSkeleton() {
  return (
    <div className="grid grid-cols-[repeat(12,40px)] gap-2 p-2">
      {Array.from({ length: 78 }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-10" />
      ))}
    </div>
  );
}

/**
 * Category pill button
 */
function CategoryPill({
  categoryId,
  label,
  count,
  isSelected,
  onClick,
}: {
  categoryId: IconCategory | 'all';
  label: string;
  count: number;
  isSelected: boolean;
  onClick: () => void;
}) {
  const CategoryIcon = useMemo(() => {
    if (categoryId === 'all') return Grid3X3;
    const info = CATEGORY_INFO.find((c) => c.id === categoryId);
    if (!info) return Circle;
    return getIconComponentByKey(info.icon) ?? Circle;
  }, [categoryId]);

  return (
    <Button
      type="button"
      variant={isSelected ? 'default' : 'outline'}
      size="sm"
      onClick={onClick}
      className="flex h-7 shrink-0 items-center gap-1.5 px-2"
    >
      <CategoryIcon className="h-3.5 w-3.5" />
      <span className="text-xs">{label}</span>
      <Badge
        variant={isSelected ? 'secondary' : 'outline'}
        className="h-4 px-1 text-[10px]"
      >
        {count}
      </Badge>
    </Button>
  );
}

/**
 * "More" dropdown for remaining categories
 */
function MoreCategoriesDropdown({
  categories,
  selectedCategory,
  onSelectCategory,
  labels,
}: {
  categories: typeof CATEGORY_INFO;
  selectedCategory: IconCategory | 'all';
  onSelectCategory: (category: IconCategory) => void;
  labels: Record<IconCategory | 'all', string>;
}) {
  const [open, setOpen] = useState(false);

  // Check if current selection is in the "more" list
  const isMoreSelected =
    selectedCategory !== 'all' &&
    categories.some((c) => c.id === selectedCategory);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant={isMoreSelected ? 'default' : 'outline'}
          size="sm"
          className="flex h-7 shrink-0 items-center gap-1 px-2"
        >
          <span className="text-xs">More</span>
          <ChevronDown className="h-3 w-3" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-56 p-0"
        align="start"
        side="bottom"
        collisionPadding={16}
      >
        <Command>
          <CommandInput placeholder="Search categories..." />
          <CommandList>
            <CommandEmpty>No category found.</CommandEmpty>
            <CommandGroup>
              {categories.map((category) => {
                const CategoryIcon =
                  getIconComponentByKey(category.icon) ?? Circle;
                const isSelected = selectedCategory === category.id;
                return (
                  <CommandItem
                    key={category.id}
                    value={`${category.id} ${labels[category.id]}`}
                    onSelect={() => {
                      onSelectCategory(category.id);
                      setOpen(false);
                    }}
                    className={cn(
                      'flex items-center gap-2',
                      isSelected && 'bg-accent'
                    )}
                  >
                    <CategoryIcon className="h-4 w-4" />
                    <span className="flex-1">{labels[category.id]}</span>
                    <Badge variant="outline" className="h-5 px-1.5 text-xs">
                      {category.count}
                    </Badge>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Category pill bar with horizontal scroll and "More" dropdown
 */
function CategoryPillBar({
  selectedCategory,
  onSelectCategory,
  labels,
}: {
  selectedCategory: IconCategory | 'all';
  onSelectCategory: (category: IconCategory | 'all') => void;
  labels: Record<IconCategory | 'all', string>;
}) {
  const topCategories = CATEGORY_INFO.slice(0, TOP_CATEGORIES_COUNT);
  const moreCategories = CATEGORY_INFO.slice(TOP_CATEGORIES_COUNT);
  const totalIconCount = ICON_OPTIONS.length;

  return (
    <div className="w-full overflow-hidden">
      <ScrollArea className="w-full">
        <div className="flex items-center gap-1.5 pb-2">
          {/* All category pill */}
          <CategoryPill
            categoryId="all"
            label={labels.all}
            count={totalIconCount}
            isSelected={selectedCategory === 'all'}
            onClick={() => onSelectCategory('all')}
          />

          {/* Top categories */}
          {topCategories.map((category) => (
            <CategoryPill
              key={category.id}
              categoryId={category.id}
              label={labels[category.id]}
              count={category.count}
              isSelected={selectedCategory === category.id}
              onClick={() => onSelectCategory(category.id)}
            />
          ))}

          {/* More dropdown */}
          {moreCategories.length > 0 && (
            <MoreCategoriesDropdown
              categories={moreCategories}
              selectedCategory={selectedCategory}
              onSelectCategory={onSelectCategory}
              labels={labels}
            />
          )}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
}

/**
 * Virtualized icon grid for efficient rendering of 500+ icons
 */
function VirtualizedIconGrid({
  icons,
  selectedValue,
  onSelect,
}: {
  icons: IconOption[];
  selectedValue: string | null | undefined;
  onSelect: (value: string) => void;
}) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Calculate number of rows needed
  const rowCount = Math.ceil(icons.length / ICONS_PER_ROW);

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: OVERSCAN,
  });

  const virtualRows = virtualizer.getVirtualItems();

  return (
    <div
      ref={scrollContainerRef}
      className="h-72 overflow-auto"
      style={{ contain: 'strict' }}
    >
      <div
        className="relative"
        style={{ height: `${virtualizer.getTotalSize()}px` }}
      >
        <TooltipProvider delayDuration={200}>
          <div
            className="absolute inset-x-0 top-0"
            style={{
              transform: `translateY(${virtualRows[0]?.start ?? 0}px)`,
            }}
          >
            {virtualRows.map((virtualRow) => {
              const startIndex = virtualRow.index * ICONS_PER_ROW;
              const rowIcons = icons.slice(
                startIndex,
                startIndex + ICONS_PER_ROW
              );

              return (
                <div
                  key={virtualRow.key}
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  className="grid grid-cols-6 gap-2 py-1 md:grid-cols-[repeat(12,40px)]"
                >
                  {rowIcons.map(({ value, label, Icon }) => {
                    const isSelected = value === selectedValue;
                    return (
                      <Tooltip key={value}>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            variant={isSelected ? 'default' : 'outline'}
                            size="icon"
                            aria-label={label}
                            onClick={() => onSelect(value)}
                            className="h-10 w-10 shrink-0"
                          >
                            <Icon className="h-5 w-5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" sideOffset={4}>
                          <p className="text-xs">{label}</p>
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </TooltipProvider>
      </div>
    </div>
  );
}

/**
 * Icon picker component with virtualization, semantic search, and category browsing
 *
 * Features:
 * - Virtualized rendering for 1668 icons
 * - Semantic keyword search (e.g., "money" finds finance icons)
 * - Category browsing with 43 Lucide categories
 * - Code-split icon options for smaller initial bundle
 * - Accessible with keyboard navigation
 */
export default function IconPicker({
  value,
  onValueChange,
  disabled,
  allowClear = true,
  ariaLabel = 'Select icon',
  title = 'Select an icon',
  description = 'Choose an icon to represent this item.',
  searchPlaceholder = 'Search icons...',
  clearLabel = 'Clear',
  defaultCategory = 'all',
  categoryLabels = DEFAULT_CATEGORY_LABELS,
  triggerClassName,
  triggerStyle,
  renderIcon,
}: IconPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<
    IconCategory | 'all'
  >(defaultCategory);

  // Defer search updates for better perceived performance
  const deferredQuery = useDeferredValue(query);
  const deferredCategory = useDeferredValue(selectedCategory);

  // Get the currently selected icon
  const SelectedIcon = useMemo(() => {
    return getIconComponentByKey(value) ?? Circle;
  }, [value]);

  // Filter icons based on category and search query
  const filteredIcons = useMemo(() => {
    // First filter by category
    const categoryIcons = getIconsByCategory(deferredCategory);
    // Then filter by search query
    return filterIcons(categoryIcons, deferredQuery);
  }, [deferredCategory, deferredQuery]);

  // Get category display info
  const categoryInfo = useMemo(() => {
    if (deferredCategory === 'all') {
      return { label: categoryLabels.all, count: ICON_OPTIONS.length };
    }
    const info = CATEGORY_INFO.find((c) => c.id === deferredCategory);
    return {
      label: categoryLabels[deferredCategory],
      count: info?.count ?? 0,
    };
  }, [deferredCategory, categoryLabels]);

  // Handle icon selection
  const handleSelect = useCallback(
    (iconValue: string) => {
      // The iconValue comes from ICON_OPTIONS which are already typed as DbPlatformIcon
      onValueChange(iconValue as NonNullable<typeof value>);
      setOpen(false);
    },
    [onValueChange]
  );

  // Handle clear
  const handleClear = useCallback(() => {
    onValueChange(null);
    setOpen(false);
  }, [onValueChange]);

  // Reset search and category when dialog closes
  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      setOpen(isOpen);
      if (!isOpen) {
        setQuery('');
        setSelectedCategory(defaultCategory);
      }
    },
    [defaultCategory]
  );

  // Handle category change
  const handleCategoryChange = useCallback((category: IconCategory | 'all') => {
    setSelectedCategory(category);
  }, []);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          aria-label={ariaLabel}
          className={cn('h-10 w-10 p-0', triggerClassName)}
          style={triggerStyle}
        >
          {renderIcon ?? <SelectedIcon className="h-5 w-5" />}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-155">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {/* Search input */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              autoFocus
            />
            {query && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute top-1/2 right-1 h-6 w-6 -translate-y-1/2"
                onClick={() => setQuery('')}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
          {allowClear && (
            <Button type="button" variant="outline" onClick={handleClear}>
              {clearLabel}
            </Button>
          )}
        </div>

        {/* Category pill bar */}
        <CategoryPillBar
          selectedCategory={selectedCategory}
          onSelectCategory={handleCategoryChange}
          labels={categoryLabels}
        />

        {/* Result count with category context */}
        <p className="text-muted-foreground text-xs">
          {deferredQuery ? (
            <>
              {filteredIcons.length} icon
              {filteredIcons.length !== 1 ? 's' : ''} found
              {deferredCategory !== 'all' && ` in "${categoryInfo.label}"`}
            </>
          ) : (
            <>
              {categoryInfo.count} icon{categoryInfo.count !== 1 ? 's' : ''} in
              &quot;{categoryInfo.label}&quot;
            </>
          )}
        </p>

        <Suspense fallback={<IconGridSkeleton />}>
          {filteredIcons.length > 0 ? (
            <VirtualizedIconGrid
              icons={filteredIcons}
              selectedValue={value}
              onSelect={handleSelect}
            />
          ) : (
            <div className="flex h-72 items-center justify-center">
              <p className="text-muted-foreground text-sm">
                No icons found
                {deferredQuery && <> for &quot;{deferredQuery}&quot;</>}
                {deferredCategory !== 'all' && (
                  <> in &quot;{categoryInfo.label}&quot;</>
                )}
              </p>
            </div>
          )}
        </Suspense>
      </DialogContent>
    </Dialog>
  );
}
