'use client';

import {
  useSearchParams as useDefaultSearchParams,
  usePathname,
  useRouter,
} from 'next/navigation';
import { useCallback } from 'react';

const useSearchParams = () => {
  const searchParams = useDefaultSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const has = useCallback(
    (key: string) => searchParams.has(key),
    [searchParams]
  );

  const get = useCallback(
    (data: { key: string; fallbackValue?: string | string[] } | string) => {
      if (typeof data === 'string') return searchParams.getAll(data) || '';

      const { key, fallbackValue } = data;
      return searchParams.getAll(key).length > 0
        ? searchParams.getAll(key) || fallbackValue
        : fallbackValue;
    },
    [searchParams]
  );

  const getSingle = useCallback(
    (key: string, fallbackValue?: string) => {
      return searchParams.get(key) || fallbackValue;
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

  const add = useCallback(
    (key: string, value: string | string[], refresh = true) => {
      const params = new URLSearchParams(searchParams);
      if (Array.isArray(value)) {
        value.forEach((item) => params.append(key, item));
      } else {
        params.append(key, value);
      }
      router.push(`${pathname}?${params.toString()}`);
      if (refresh) router.refresh();
    },
    [pathname, router, searchParams]
  );

  const remove = useCallback(
    (key: string, refresh = true) => {
      const params = new URLSearchParams(searchParams);
      params.delete(key);
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

  const getAll = useCallback(() => {
    const params = new URLSearchParams(searchParams);
    const entries = params.entries();
    const result: Record<string, string[]> = {};
    for (const [key, value] of entries) {
      if (result[key]) {
        result[key]?.push(value);
      } else {
        result[key] = [value];
      }
    }
    return result;
  }, [searchParams]);

  const isEmpty = searchParams.toString().length === 0;

  return {
    isEmpty,
    has,
    get,
    set,
    add,
    remove,
    reset,
    clear: reset,
    getAll,
    getSingle,
  };
};

export default useSearchParams;
