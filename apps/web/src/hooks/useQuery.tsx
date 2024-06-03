import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

const useQuery = () => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams()!;

  const get = useCallback(
    (data: { key: string; fallbackValue?: string | string[] } | string) => {
      if (typeof data === 'string') return searchParams.getAll(data) || '';

      const { key, fallbackValue } = data;
      return searchParams.getAll(key).length > 0
        ? searchParams.getAll(key)
        : fallbackValue;
    },
    [searchParams]
  );

  const set = useCallback(
    (
      data: Record<string, string | number | string[] | undefined>,
      refresh = true
    ) => {
      const params = new URLSearchParams(searchParams);

      Object.entries(data).forEach(([key, value]) => {
        if (value === undefined) return;
        if (Array.isArray(value)) {
          params.delete(key);
          value
            .filter((v) => v !== undefined && v !== null)
            .forEach((item) => params.append(key, item));
        } else {
          params.set(key, value.toString());
        }
      });

      router.push(`${pathname}?${params.toString()}`);
      if (refresh) router.refresh();
    },
    [pathname, router, searchParams]
  );

  const reset = useCallback(
    (refresh = true) => {
      router.push(pathname);
      if (refresh) router.refresh();
    },
    [pathname, router]
  );

  const isEmpty = searchParams.toString().length === 0;

  return { isEmpty, get, set, reset };
};

export default useQuery;
