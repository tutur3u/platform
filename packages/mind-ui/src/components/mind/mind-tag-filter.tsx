'use client';

import { Check, Tags } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@tuturuuu/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';

type Props = {
  align?: 'center' | 'end' | 'start';
  compact?: boolean;
  selectedTags: string[];
  tags: string[];
  onSelectedTagsChange: (tags: string[]) => void;
};

export function MindTagFilter({
  align = 'end',
  compact,
  selectedTags,
  tags,
  onSelectedTagsChange,
}: Props) {
  const t = useTranslations('mind');
  const selected = new Set(selectedTags);

  const toggleTag = (tag: string) => {
    onSelectedTagsChange(
      selected.has(tag)
        ? selectedTags.filter((item) => item !== tag)
        : [...selectedTags, tag]
    );
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          aria-label={t('tags.filter')}
          className={cn(
            'touch-manipulation',
            compact
              ? 'h-8 w-8 justify-center p-0'
              : 'h-9 max-w-48 justify-start'
          )}
          size="sm"
          type="button"
          variant={
            compact ? 'ghost' : selectedTags.length ? 'secondary' : 'outline'
          }
        >
          <Tags className="h-4 w-4" />
          {compact ? null : (
            <span className="truncate">
              {selectedTags.length
                ? t('tags.selected', { count: selectedTags.length })
                : t('tags.filter')}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align={align} className="w-80 p-0">
        <Command>
          <CommandInput placeholder={t('tags.search')} />
          <CommandList>
            <CommandEmpty>{t('tags.empty')}</CommandEmpty>
            <CommandGroup>
              {tags.map((tag) => (
                <CommandItem key={tag} onSelect={() => toggleTag(tag)}>
                  <Check
                    className={cn(
                      'h-4 w-4',
                      selected.has(tag) ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  <span className="min-w-0 flex-1 truncate">{tag}</span>
                  <Badge variant="outline">{t('tags.item')}</Badge>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
          {selectedTags.length ? (
            <div className="border-border border-t p-2">
              <Button
                className="w-full"
                onClick={() => onSelectedTagsChange([])}
                size="sm"
                type="button"
                variant="ghost"
              >
                {t('tags.clear')}
              </Button>
            </div>
          ) : null}
        </Command>
      </PopoverContent>
    </Popover>
  );
}
