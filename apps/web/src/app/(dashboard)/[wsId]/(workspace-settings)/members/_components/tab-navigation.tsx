'use client';

import { TabsTrigger } from '@/components/ui/tabs';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

interface Props {
  value: string;
  label: string;
}

export default function TabNavigation({ value, label }: Props) {
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

  const updateQuery = useCallback(
    (q: string) => {
      const query = createQueryString('status', q);
      router.push(`${pathname}?${query}`);
    },
    [createQueryString, pathname, router]
  );

  return (
    <TabsTrigger value={value} onClick={() => updateQuery(value)}>
      {label}
    </TabsTrigger>
  );
}
