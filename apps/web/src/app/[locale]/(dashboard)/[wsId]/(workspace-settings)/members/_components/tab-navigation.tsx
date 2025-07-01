'use client';

import { TabsTrigger } from '@tuturuuu/ui/tabs';
import useSearchParams from '@/hooks/useSearchParams';

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
