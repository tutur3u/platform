'use client';

import useTranslation from 'next-translate/useTranslation';
import { Input } from '@/components/ui/input';
import { debounce } from 'lodash';
import { cn } from '@/lib/utils';
import useQuery from '@/hooks/useQuery';

interface Props {
  resetPage?: boolean;
  className?: string;
}

const GeneralSearchBar = ({ resetPage = true, className }: Props) => {
  const query = useQuery();

  const updateQuery = debounce((q: string) => {
    query.set({ q, page: resetPage ? '1' : undefined });
  }, 300);

  const { t } = useTranslation('search');
  const searchPlaceholder = t('search-placeholder');

  return (
    <Input
      placeholder={searchPlaceholder}
      defaultValue={query.get('q') || ''}
      onChange={(e) => updateQuery(e.target.value)}
      className={cn('placeholder:text-foreground/60 h-8 min-w-64', className)}
    />
  );
};

export default GeneralSearchBar;
