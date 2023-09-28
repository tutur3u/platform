import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

const useQuery = () => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams()!;

  const get = useCallback(
    (data: { key: string; fallbackValue?: string } | string) => {
      if (typeof data === 'string') return searchParams.get(data) || '';

      const { key, fallbackValue } = data;
      return searchParams.get(key) || fallbackValue;
    },
    [searchParams]
  );

  const set = useCallback(
    (data: Record<string, string | number | undefined>) => {
      const params = new URLSearchParams(searchParams);

      Object.entries(data).forEach(([key, value]) => {
        if (value === undefined) return;
        if (value) params.set(key, value.toString());
        else params.delete(key);
      });

      router.push(`${pathname}?${params.toString()}`);
    },
    [pathname, router, searchParams]
  );

  return { get, set };
};

export default useQuery;
