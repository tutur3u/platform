'use client';

import { useQuery } from '@tanstack/react-query';
import { Check, Tag, X } from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@tuturuuu/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface TransactionTag {
  id: string;
  name: string;
  color: string;
}

interface TagFilterProps {
  wsId: string;
  selectedTagIds: string[];
  onTagsChange: (tagIds: string[]) => void;
  className?: string;
}

async function fetchTransactionTags(wsId: string): Promise<TransactionTag[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('transaction_tags')
    .select('id, name, color')
    .eq('ws_id', wsId)
    .order('name', { ascending: true });

  if (error) throw error;
  return data || [];
}

export function TagFilter({
  wsId,
  selectedTagIds,
  onTagsChange,
  className,
}: TagFilterProps) {
  const t = useTranslations();
  const [isOpen, setIsOpen] = useState(false);

  const hasActiveFilters = selectedTagIds.length > 0;

  const {
    data: tags = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['transaction-tags', wsId],
    queryFn: () => fetchTransactionTags(wsId),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    enabled: !!wsId,
  });

  const handleTagToggle = (tagId: string) => {
    const newSelectedTagIds = selectedTagIds.includes(tagId)
      ? selectedTagIds.filter((id) => id !== tagId)
      : [...selectedTagIds, tagId];

    onTagsChange(newSelectedTagIds);
  };

  const clearAllFilters = () => {
    onTagsChange([]);
  };

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-9 w-full gap-1.5 md:h-8 md:w-auto"
          >
            <Tag className="h-3 w-3" />
            <span className="text-xs">{t('finance.filter_by_tags')}</span>
            {hasActiveFilters && (
              <Badge
                variant="secondary"
                className="ml-1 h-5 rounded-full px-1.5 text-xs"
              >
                {selectedTagIds.length}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-70 p-0" align="start">
          <Command>
            <CommandInput placeholder={t('finance.search_tags')} />
            <CommandList>
              <CommandEmpty>
                {isLoading
                  ? t('finance.loading_tags')
                  : t('finance.no_tags_found')}
              </CommandEmpty>

              {error && (
                <CommandGroup>
                  <CommandItem disabled className="text-destructive">
                    {error instanceof Error
                      ? error.message
                      : t('finance.failed_to_load_tags')}
                  </CommandItem>
                </CommandGroup>
              )}

              {!isLoading && !error && tags.length > 0 && (
                <CommandGroup>
                  {tags
                    .sort((a, b) => {
                      const aSelected = selectedTagIds.includes(a.id);
                      const bSelected = selectedTagIds.includes(b.id);

                      if (aSelected && !bSelected) return -1;
                      if (!aSelected && bSelected) return 1;

                      return a.name.localeCompare(b.name);
                    })
                    .map((tag) => {
                      const isSelected = selectedTagIds.includes(tag.id);

                      return (
                        <CommandItem
                          key={tag.id}
                          onSelect={() => handleTagToggle(tag.id)}
                          className="flex cursor-pointer items-center gap-2"
                        >
                          <div
                            className={cn(
                              'mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary',
                              isSelected
                                ? 'bg-primary text-primary-foreground'
                                : 'opacity-50 [&_svg]:invisible'
                            )}
                          >
                            <Check className="h-4 w-4" />
                          </div>
                          <div className="flex flex-1 items-center gap-2">
                            <div
                              className="h-3 w-3 rounded-full"
                              style={{ backgroundColor: tag.color }}
                            />
                            <span className="font-medium text-sm">
                              {tag.name}
                            </span>
                          </div>
                        </CommandItem>
                      );
                    })}
                </CommandGroup>
              )}

              {hasActiveFilters && (
                <>
                  <CommandSeparator />
                  <CommandGroup>
                    <CommandItem
                      onSelect={clearAllFilters}
                      className="cursor-pointer justify-center text-center text-destructive"
                    >
                      <X className="mr-2 h-4 w-4" />
                      {t('common.clear_all_filters')}
                    </CommandItem>
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
