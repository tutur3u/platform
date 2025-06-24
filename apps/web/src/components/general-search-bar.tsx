'use client';

import SearchBar from '@tuturuuu/ui/custom/search-bar';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import useSearchParams from '@/hooks/useSearchParams';

interface Props {
  resetPage?: boolean;
  className?: string;
}

const GeneralSearchBar = ({ resetPage = true, className }: Props) => {
  const t = useTranslations();
  const searchParams = useSearchParams();

  return (
    <SearchBar
      t={t}
      className={cn('w-full', className)}
      defaultValue=""
      onSearch={(q: string) =>
        searchParams.set({ q, page: resetPage ? '1' : undefined })
      }
    />
  );
};

export default GeneralSearchBar;
