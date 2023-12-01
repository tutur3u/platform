'use client';

import useTranslation from 'next-translate/useTranslation';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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

  const searchLabel = t('search');
  const searchPlaceholder = t('search-placeholder');

  return (
    <div className={cn('grid w-full items-center gap-1.5', className)}>
      <Label>{searchLabel}</Label>
      <Input
        placeholder={searchPlaceholder}
        defaultValue={query.get('q') || ''}
        onChange={(e) => updateQuery(e.target.value)}
        className="placeholder:text-foreground/60"
      />
    </div>
  );
};

export default GeneralSearchBar;
