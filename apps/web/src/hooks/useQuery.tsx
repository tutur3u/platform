import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

const useQuery = () => {
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

  const get = useCallback(
    (data: { key: string; fallbackValue?: string } | string) => {
      if (typeof data === 'string') return searchParams.get(data) || '';

      const { key, fallbackValue } = data;
      return searchParams.get(key) || fallbackValue;
    },
    [searchParams]
  );

  const set = useCallback(
    (key: string, value: string) => {
      const query = createQueryString(key, value);
      router.push(`${pathname}?${query}`);
      // router.refresh();
    },
    [createQueryString, pathname, router]
  );

  return { get, set };
};

export default useQuery;
