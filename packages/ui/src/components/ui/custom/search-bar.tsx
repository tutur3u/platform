'use client';

import { cn } from '@tuturuuu/utils/format';
import { debounce } from 'lodash';
import { useCallback, useEffect, useState } from 'react';
import { Input } from '../input';

interface Props {
  t: any;
  defaultValue?: string;
  className?: string;

  onSearch?: (query: string) => void;
}

// Assuming the rest of your imports and Props interface are unchanged

const SearchBar = ({ t, defaultValue = '', className, onSearch }: Props) => {
  // Memoize the updateQuery function to ensure debounce works correctly
  const updateQuery = useCallback(
    debounce((query: string) => {
      if (onSearch) {
        onSearch(query);
      }
    }, 300),
    [] // Re-create the debounced function only if onSearch changes
  );

  const searchPlaceholder = t('search.search-placeholder');
  const [value, setValue] = useState(defaultValue);

  useEffect(() => {
    setValue(defaultValue);
  }, [defaultValue]);

  useEffect(() => {
    // Cleanup the debounced function on component unmount
    return () => {
      updateQuery.cancel();
    };
  }, [updateQuery]);

  return (
    <Input
      placeholder={searchPlaceholder}
      value={value}
      onChange={(e) => {
        setValue(e.target.value);
        updateQuery(e.target.value);
      }}
      className={cn('h-8 min-w-64 placeholder:text-foreground/60', className)}
    />
  );
};

export default SearchBar;
