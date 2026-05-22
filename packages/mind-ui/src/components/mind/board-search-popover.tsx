'use client';

import { Search } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { useTranslations } from 'next-intl';

type Props = {
  query: string;
  onQueryChange: (query: string) => void;
};

export function BoardSearchPopover({ query, onQueryChange }: Props) {
  const t = useTranslations('mind');

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          aria-label={t('actions.searchBoards')}
          size="icon"
          type="button"
          variant={query ? 'secondary' : 'ghost'}
        >
          <Search className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-2">
        <Input
          autoFocus
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={t('placeholders.searchBoards')}
          value={query}
        />
      </PopoverContent>
    </Popover>
  );
}
