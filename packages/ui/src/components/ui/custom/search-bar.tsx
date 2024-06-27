'use client';

import { cn } from '../../../lib/utils';
import { Input } from '../input';
import { debounce } from 'lodash';
import { useEffect, useState } from 'react';

interface Props {
  t: any;
  defaultValue?: string;
  className?: string;
  // eslint-disable-next-line no-unused-vars
  onSearch?: (query: string) => void;
}

const SearchBar = ({ t, defaultValue, className, onSearch }: Props) => {
  const updateQuery = onSearch ? debounce(onSearch, 300) : () => {};

  const searchPlaceholder = t('search.search-placeholder');

  const [value, setValue] = useState(defaultValue);

  useEffect(() => {
    setValue(defaultValue);
  }, [defaultValue]);

  return (
    <Input
      placeholder={searchPlaceholder}
      defaultValue={defaultValue || ''}
      value={value}
      onChange={(e) => {
        setValue(e.target.value);
        updateQuery(e.target.value);
      }}
      className={cn('placeholder:text-foreground/60 h-8 min-w-64', className)}
    />
  );
};

export default SearchBar;
