'use client';

import useSearchParams from '@tuturuuu/ui/hooks/useSearchParams';
import { TabsTrigger } from '@tuturuuu/ui/tabs';

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
