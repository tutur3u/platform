'use client';

import { cn } from '../../../lib/utils';
import { Input } from '../input';
import { debounce } from 'lodash';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

interface Props {
  defaultValue?: string;
  className?: string;
  // eslint-disable-next-line no-unused-vars
  onSearch?: (query: string) => void;
}

const SearchBar = ({ defaultValue, className, onSearch }: Props) => {
  const updateQuery = onSearch ? debounce(onSearch, 300) : () => {};

  const t = useTranslations('search');
  const searchPlaceholder = t('search-placeholder');

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
