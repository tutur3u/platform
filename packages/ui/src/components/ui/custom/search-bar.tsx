'use client';

import { Input } from '../input';
import { cn } from '@tuturuuu/utils/format';
import { debounce } from 'lodash';
import { useCallback, useEffect, useRef, useState } from 'react';

interface Props {
  t: any;
  defaultValue?: string;
  className?: string;
  // eslint-disable-next-line no-unused-vars
  onSearch?: (query: string) => void;
}

// Assuming the rest of your imports and Props interface are unchanged

const SearchBar = ({ t, defaultValue = '', className, onSearch }: Props) => {
  // Use ref to avoid stale closure while preserving debounce behavior
  const onSearchRef = useRef(onSearch);
  onSearchRef.current = onSearch;

  const updateQuery = useCallback(
    debounce((query: string) => {
      if (onSearchRef.current) {
        onSearchRef.current(query);
      }
    }, 300),
    []
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
