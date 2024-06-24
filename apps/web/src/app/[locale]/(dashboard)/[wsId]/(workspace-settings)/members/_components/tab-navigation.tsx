'use client';

import useSearchParams from '@/hooks/useSearchParams';
import { TabsTrigger } from '@repo/ui/components/ui/tabs';

interface Props {
  value: string;
  label: string;
}

export default function TabNavigation({ value, label }: Props) {
  const searchParams = useSearchParams();

  return (
    <TabsTrigger
      value={value}
      onClick={() => searchParams.set({ status: value === 'all' ? '' : value })}
    >
      {label}
    </TabsTrigger>
  );
}
