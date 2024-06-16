'use client';

import { Input } from '@repo/ui/components/ui/input';
import { cn } from '@repo/ui/lib/utils';
import { debounce } from 'lodash';
import useTranslation from 'next-translate/useTranslation';

interface Props {
  defaultValue?: string;
  className?: string;
  // eslint-disable-next-line no-unused-vars
  onSearch?: (query: string) => void;
}

const SearchBar = ({ defaultValue, className, onSearch }: Props) => {
  const updateQuery = onSearch ? debounce(onSearch, 300) : () => {};

  const { t } = useTranslation('search');
  const searchPlaceholder = t('search-placeholder');

  return (
    <Input
      placeholder={searchPlaceholder}
      defaultValue={defaultValue || ''}
      onChange={(e) => updateQuery(e.target.value)}
      className={cn('placeholder:text-foreground/60 h-8 min-w-64', className)}
    />
  );
};

export default SearchBar;
