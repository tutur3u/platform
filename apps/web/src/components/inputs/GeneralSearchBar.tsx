'use client';

import useTranslation from 'next-translate/useTranslation';
import { Input } from '@/components/ui/input';
import { debounce } from 'lodash';
import { cn } from '@/lib/utils';
import useSearchParams from '@/hooks/useSearchParams';

interface Props {
  resetPage?: boolean;
  className?: string;
}

const GeneralSearchBar = ({ resetPage = true, className }: Props) => {
  const searchParams = useSearchParams();

  const updateQuery = debounce((q: string) => {
    searchParams.set({ q, page: resetPage ? '1' : undefined });
  }, 300);

  const { t } = useTranslation('search');
  const searchPlaceholder = t('search-placeholder');

  return (
    <Input
      placeholder={searchPlaceholder}
      defaultValue={searchParams.get('q') || ''}
      onChange={(e) => updateQuery(e.target.value)}
      className={cn('placeholder:text-foreground/60 h-8 min-w-64', className)}
    />
  );
};

export default GeneralSearchBar;
