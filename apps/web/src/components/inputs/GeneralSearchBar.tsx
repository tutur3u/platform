'use client';

import useSearchParams from '@/hooks/useSearchParams';
import SearchBar from '@repo/ui/components/ui/custom/search-bar';
import { cn } from '@repo/ui/lib/utils';

interface Props {
  resetPage?: boolean;
  className?: string;
}

const GeneralSearchBar = ({ resetPage = true, className }: Props) => {
  const searchParams = useSearchParams();

  return (
    <SearchBar
      className={cn('w-full', className)}
      defaultValue=""
      onSearch={(q: string) =>
        searchParams.set({ q, page: resetPage ? '1' : undefined })
      }
    />
  );
};

export default GeneralSearchBar;
