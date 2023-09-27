'use client';

import useTranslation from 'next-translate/useTranslation';
import { useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { debounce } from 'lodash';
import { cn } from '@/lib/utils';

interface Props {
  beforeValueChange?: (value: string) => void;
  className?: string;
}

const GeneralSearchBar = ({ beforeValueChange, className }: Props) => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams()!;

  // Get a new searchParams string by merging the current
  // searchParams with a provided key/value pair
  const createQueryString = useCallback(
    (name: string, value: string) => {
      const params = new URLSearchParams(searchParams);

      if (value) params.set(name, value);
      else params.delete(name);

      return params.toString();
    },
    [searchParams]
  );

  const updateQuery = debounce((q: string) => {
    const query = createQueryString('q', q);
    router.push(`${pathname}?${query}`);
  }, 300);

  const { t } = useTranslation('search');

  const searchLabel = t('search');
  const searchPlaceholder = t('search-placeholder');

  return (
    <div className={cn('grid w-full items-center gap-1.5', className)}>
      <Label>{searchLabel}</Label>
      <Input
        placeholder={searchPlaceholder}
        defaultValue={searchParams.get('q') || ''}
        onChange={(e) => {
          if (beforeValueChange) beforeValueChange(e.target.value);
          updateQuery(e.target.value);
        }}
      />
    </div>
  );
};

export default GeneralSearchBar;
