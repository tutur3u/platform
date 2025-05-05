'use client';

import { Tabs, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

interface TabSelectorProps {
  defaultTab: string;
  children: React.ReactNode;
}

export function TabSelector({ defaultTab, children }: TabSelectorProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const createQueryString = useCallback(
    (name: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set(name, value);

      // Reset page when switching tabs
      if (name === 'tab') {
        params.set('page', '1');
      }

      return params.toString();
    },
    [searchParams]
  );

  const handleTabChange = (value: string) => {
    router.push(pathname + '?' + createQueryString('tab', value));
  };

  return (
    <Tabs
      defaultValue={defaultTab}
      className="w-full"
      onValueChange={handleTabChange}
    >
      <TabsList className="mb-4">
        <TabsTrigger value="users">Users</TabsTrigger>
        <TabsTrigger value="whitelist">Emails Whitelist</TabsTrigger>
      </TabsList>
      {children}
    </Tabs>
  );
}
